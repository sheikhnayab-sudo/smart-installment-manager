/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User as FirebaseUser 
} from "firebase/auth";
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  serverTimestamp, 
  where,
  Timestamp,
  getDoc,
  getDocFromServer,
  getDocFromCache
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  Plus,
  Phone,
  Search, 
  LogOut, 
  Camera, 
  FileText, 
  ChevronRight, 
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Calendar,
  Share2,
  Download,
  Settings,
  Store,
  MapPin,
  Info,
  Bell,
  MessageSquare,
  Send,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format, addMonths, isBefore, isAfter, subDays, startOfDay, differenceInDays } from "date-fns";

import { auth, db, storage } from "./firebase";
import { cn } from "./lib/utils";

const toDate = (date: any): Date => {
  try {
    if (!date) return new Date();
    if (date instanceof Timestamp) return date.toDate();
    if (date && typeof date.toDate === 'function') return date.toDate();
    if (typeof date === 'object' && 'seconds' in date) return new Date(date.seconds * 1000);
    const d = new Date(date);
    return isNaN(d.getTime()) ? new Date() : d;
  } catch (e) {
    return new Date();
  }
};

const safeFormat = (date: any, formatStr: string) => {
  return format(toDate(date), formatStr);
};

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number = 30000): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Operation timed out. Please check your internet connection and try again.")), timeoutMs))
  ]);
};

// --- Types ---

interface Guarantor {
  name: string;
  phone: string;
  cnic: string;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  cnic: string;
  address: string;
  cnicPhotoUrl?: string;
  guarantor1: Guarantor;
  guarantor2: Guarantor;
  salespersonId?: string;
  userId: string;
  createdAt: any;
  isDeleted?: boolean;
  deletedAt?: any;
}

interface Installment {
  id: string;
  customerId: string;
  productName: string;
  brand: string;
  model: string;
  imei?: string;
  totalPrice: number;
  advancePayment: number;
  duration: number;
  profitPercentage: number;
  formCharges: number;
  monthlyInstallment: number;
  remainingBalance: number;
  totalPayable: number;
  status: "active" | "completed" | "defaulted";
  nextDueDate: any;
  lastReminderSent?: any;
  salespersonId?: string;
  userId: string;
  createdAt: any;
  isDeleted?: boolean;
  deletedAt?: any;
}

interface Salesperson {
  id: string;
  name: string;
  phone: string;
  userId: string;
  createdAt: any;
  isDeleted?: boolean;
  deletedAt?: any;
}

interface Payment {
  id: string;
  installmentId: string;
  amount: number;
  paymentDate: any;
  receiptUrl?: string;
  userId: string;
  createdAt: any;
  isDeleted?: boolean;
  deletedAt?: any;
}

interface BusinessProfile {
  businessName: string;
  ownerName: string;
  phone: string;
  address: string;
  tagline?: string;
  logoUrl?: string;
  updatedAt?: any;
}

// --- Error Handling ---

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    try {
      console.error("ErrorBoundary caught an error:", error.message, errorInfo.componentStack);
    } catch (e) {
      console.error("ErrorBoundary caught an error (fallback)");
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center bg-gray-50 p-4">
          <Card className="max-w-md w-full p-8 text-center border-rose-200 bg-rose-50/30">
            <div className="mb-6 flex justify-center">
              <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-rose-600" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Application Error</h1>
            <p className="text-gray-600 mb-6 text-sm">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <Button onClick={() => window.location.reload()} className="w-full bg-rose-600 hover:bg-rose-700">
              Refresh Application
            </Button>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`Firestore Error [${operationType}] at ${path}:`, errorMessage);
  
  // Create a safe object with only primitives to avoid circular structure errors
  const errInfo = {
    error: String(errorMessage),
    operationType: String(operationType),
    path: path ? String(path) : null,
    userId: auth.currentUser?.uid ? String(auth.currentUser.uid) : null
  };
  
  let stringifiedInfo = errorMessage;
  try {
    stringifiedInfo = JSON.stringify(errInfo);
  } catch (e) {
    console.error("Failed to stringify error info", e);
    // Ultimate fallback with manual string construction for safety
    stringifiedInfo = `{"error": ${JSON.stringify(errorMessage)}, "operationType": "${operationType}", "path": ${JSON.stringify(path)}, "serializationError": true}`;
  }
  
  throw new Error(stringifiedInfo);
}

// --- Components ---

function DeleteConfirmModal({ title, message, onConfirm, onCancel }: { title: string; message: string; onConfirm: () => void; onCancel: () => void }) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    await onConfirm();
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl p-6 space-y-6"
      >
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center">
            <Trash2 className="w-8 h-8 text-rose-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-900">{title}</h3>
            <p className="text-slate-500 text-sm leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button 
            variant="outline" 
            className="flex-1" 
            onClick={onCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button 
            className="flex-1 bg-rose-600 hover:bg-rose-700 text-white" 
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function ProfileSetup({ user, onComplete, onLogout }: { user: FirebaseUser; onComplete: () => void; onLogout: () => void }) {
  const [formData, setFormData] = useState<BusinessProfile>({
    businessName: "",
    ownerName: user.displayName || "",
    phone: "+92",
    address: "",
    tagline: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Ensure phone has +92
      let phone = formData.phone;
      if (!phone.startsWith('+92')) phone = '+92' + phone.replace(/^\+?92?/, '');
      
      await withTimeout(setDoc(doc(db, "profiles", user.uid), {
        ...formData,
        phone,
        updatedAt: serverTimestamp(),
      }), 30000);
      onComplete();
    } catch (err: any) {
      console.error("Profile setup failed", err);
      if (err.message.includes("timed out")) {
        setError("Connection is slow. Please try again when you have a better signal.");
      } else {
        setError("Failed to save profile. Please check your internet connection.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex items-start sm:items-center justify-center bg-gray-50 p-4 overflow-y-auto">
      <Card className="max-w-lg w-full p-6 sm:p-8 my-4 sm:my-0">
        <div className="mb-6 text-center relative">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onLogout}
            className="absolute -top-2 -right-2 text-slate-400 hover:text-rose-500"
            title="Logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Store className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Setup Your Business</h2>
          <p className="text-gray-600">Please provide your business details to get started.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 text-sm rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Business Name</label>
            <Input 
              required 
              placeholder="e.g. Madni Electronics" 
              value={formData.businessName}
              onChange={e => setFormData({...formData, businessName: e.target.value})}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Owner Name</label>
            <Input 
              required 
              placeholder="Your Name" 
              value={formData.ownerName}
              onChange={e => setFormData({...formData, ownerName: e.target.value})}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Contact Phone</label>
              <Input 
                required 
                placeholder="03xx-xxxxxxx" 
                value={formData.phone}
                onChange={e => {
                  let val = e.target.value;
                  if (!val.startsWith('+92')) val = '+92' + val.replace(/^\+?92?/, '');
                  setFormData({...formData, phone: val});
                }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Business Tagline (Optional)</label>
              <Input 
                placeholder="e.g. Quality Electronics on Easy Installments" 
                value={formData.tagline}
                onChange={e => setFormData({...formData, tagline: e.target.value})}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Business Address</label>
            <Input 
              required 
              placeholder="Full Shop/Office Address" 
              value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
            />
          </div>
          
          <Button type="submit" className="w-full py-6 text-lg" disabled={loading}>
            {loading ? "Saving..." : "Complete Setup"}
          </Button>

          <p className="text-center text-xs text-slate-400 mt-4">
            Logged in as {user.email}
          </p>
        </form>
      </Card>
    </div>
  );
}

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger',
  size?: 'sm' | 'md' | 'lg' | 'icon'
}>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variants = {
      primary: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm",
      secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
      outline: "border border-gray-300 bg-transparent hover:bg-gray-50",
      ghost: "bg-transparent hover:bg-gray-100 text-gray-600",
      danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
    };
    const sizes = {
      sm: "px-3 py-1.5 text-xs",
      md: "px-4 py-2 text-sm",
      lg: "px-6 py-3 text-base",
      icon: "p-2",
    };
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);

const Card = ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void; key?: string | number }) => (
  <div 
    onClick={onClick}
    className={cn("bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden", className, onClick && "cursor-pointer")}
  >
    {children}
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [activeTab, setActiveTab] = useState<"dashboard" | "customers" | "installments" | "settings" | "reminders" | "salespeople" | "trash">("dashboard");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [salespeople, setSalespeople] = useState<Salesperson[]>([]);

  const activeCustomers = useMemo(() => customers.filter(c => !c.isDeleted), [customers]);
  const activeInstallments = useMemo(() => {
    return installments.filter(i => {
      if (i.isDeleted) return false;
      const customer = customers.find(c => c.id === i.customerId);
      return customer && !customer.isDeleted;
    });
  }, [installments, customers]);

  const activePayments = useMemo(() => {
    return payments.filter(p => {
      if (p.isDeleted) return false;
      const inst = installments.find(i => i.id === p.installmentId);
      if (!inst || inst.isDeleted) return false;
      const customer = customers.find(c => c.id === inst.customerId);
      return customer && !customer.isDeleted;
    });
  }, [payments, installments, customers]);

  const activeSalespeople = useMemo(() => salespeople.filter(s => !s.isDeleted), [salespeople]);

  const trashCustomers = useMemo(() => customers.filter(c => c.isDeleted), [customers]);
  const trashSalespeople = useMemo(() => salespeople.filter(s => s.isDeleted), [salespeople]);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [isAddingInstallment, setIsAddingInstallment] = useState(false);
  const [preselectedSalespersonId, setPreselectedSalespersonId] = useState<string | null>(null);
  const [preselectedCustomerId, setPreselectedCustomerId] = useState<string | null>(null);

  // Online Status Listener
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setInitError(null);
      if (u) {
        try {
          const profileDoc = doc(db, "profiles", u.uid);
          
          // Try cache first for speed
          try {
            const cacheSnap = await getDocFromCache(profileDoc);
            if (cacheSnap.exists()) {
              setBusinessProfile(cacheSnap.data() as BusinessProfile);
              setProfileLoading(false);
            }
          } catch (e) {
            // Cache miss is fine
          }

          // Then fetch from server if online
          if (navigator.onLine) {
            try {
              const docSnap = await withTimeout(getDoc(profileDoc), 30000);
              if (docSnap.exists()) {
                setBusinessProfile(docSnap.data() as BusinessProfile);
              }
            } catch (e: any) {
              // Ignore offline or timeout errors here as onSnapshot will handle it
              if (!e.message?.includes("offline") && !e.message?.includes("timed out")) {
                console.error("Profile fetch error:", e);
              }
            }
          }
          setProfileLoading(false);
        } catch (e: any) {
          if (!e.message?.includes("offline")) {
            console.error("Initial profile fetch error:", e);
          }
          setProfileLoading(false);
        }
      } else {
        setProfileLoading(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Connection Test
  useEffect(() => {
    const testConnection = async () => {
      try {
        await withTimeout(getDocFromServer(doc(db, 'test', 'connection')), 5000);
        console.log("Firebase connection successful.");
      } catch (error) {
        // Silently ignore connection test errors
      }
    };
    testConnection();
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;

    const qCustomers = query(collection(db, "customers"), where("userId", "==", user.uid));
    const unsubCustomers = onSnapshot(qCustomers, (snapshot) => {
      console.log("App: Customers snapshot received, count:", snapshot.size);
      setCustomers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "customers"));

    const qInstallments = query(collection(db, "installments"), where("userId", "==", user.uid));
    const unsubInstallments = onSnapshot(qInstallments, (snapshot) => {
      console.log("App: Installments snapshot received, count:", snapshot.size);
      setInstallments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Installment)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "installments"));

    const qPayments = query(collection(db, "payments"), where("userId", "==", user.uid));
    const unsubPayments = onSnapshot(qPayments, (snapshot) => {
      console.log("App: Payments snapshot received, count:", snapshot.size);
      setPayments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "payments"));

    const qSalespeople = query(collection(db, "salespeople"), where("userId", "==", user.uid));
    const unsubSalespeople = onSnapshot(qSalespeople, (snapshot) => {
      console.log("App: Salespeople snapshot received, count:", snapshot.size);
      setSalespeople(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Salesperson)));
    }, (error) => handleFirestoreError(error, OperationType.LIST, "salespeople"));

    const unsubProfile = onSnapshot(doc(db, "profiles", user.uid), (docSnap) => {
      console.log("App: Profile snapshot received, exists:", docSnap.exists());
      if (docSnap.exists()) {
        setBusinessProfile(docSnap.data() as BusinessProfile);
      } else {
        setBusinessProfile(null);
      }
      setProfileLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `profiles/${user.uid}`);
      setProfileLoading(false);
    });

    return () => {
      unsubCustomers();
      unsubInstallments();
      unsubPayments();
      unsubSalespeople();
      unsubProfile();
    };
  }, [user]);

  const [loginError, setLoginError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!navigator.onLine) {
      return setLoginError("You are currently offline. Please check your internet connection.");
    }
    const provider = new GoogleAuthProvider();
    setLoginError(null);
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login failed", error);
      if (error.code === 'auth/unauthorized-domain') {
        setLoginError("This domain is not authorized in Firebase. Please add the current URL to your Firebase Console > Authentication > Settings > Authorized domains.");
      } else {
        setLoginError("Login failed: " + (error.message || "Unknown error"));
      }
    }
  };

  const handleLogout = () => signOut(auth);

  const reminderCount = useMemo(() => {
    const today = startOfDay(new Date());
    return installments.filter(inst => {
      if (inst.status !== 'active') return false;
      const dueDate = inst.nextDueDate instanceof Timestamp ? inst.nextDueDate.toDate() : new Date(inst.nextDueDate);
      return differenceInDays(startOfDay(dueDate), today) <= 3;
    }).length;
  }, [installments]);

  if (loading || (user && profileLoading)) {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    
    return (
      <div className="h-full flex flex-col items-center justify-center bg-white p-6">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center gap-6 max-w-xs w-full"
        >
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-xl shadow-indigo-200 animate-pulse">
            <CreditCard className="w-10 h-10 text-white" />
          </div>
          <div className="space-y-6 text-center w-full">
            <h1 className="text-xl font-bold text-slate-900">Smart Installment Manager</h1>
            
            <div className="space-y-4 w-full">
              {initError ? (
                <div className="flex flex-col items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100">
                  <AlertCircle className="w-5 h-5" />
                  <p className="text-sm font-medium">{initError}</p>
                  <Button 
                    size="sm"
                    variant="outline"
                    className="mt-2 border-amber-200 text-amber-700 hover:bg-amber-100"
                    onClick={() => window.location.reload()}
                  >
                    Retry Connection
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: "0%" }}
                      animate={{ width: "95%" }}
                      transition={{ 
                        duration: 10, 
                        ease: [0.4, 0, 0.2, 1], // Custom slow-to-fast ease
                      }}
                      className="h-full bg-indigo-600 rounded-full"
                    />
                  </div>
                  <p className="text-xs text-slate-400 font-medium animate-pulse">
                    {isOffline ? "Waiting for internet..." : "Syncing your data..."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <div className="mb-6 flex justify-center">
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center">
              <CreditCard className="w-8 h-8 text-indigo-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Smart Installment Manager</h1>
          <p className="text-gray-600 mb-8">Manage your business installments with ease and security.</p>
          
          {loginError && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-sm flex items-center gap-3 text-left">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p>{loginError}</p>
            </div>
          )}

          <Button onClick={handleLogin} className="w-full py-6 text-lg">
            Sign in with Google
          </Button>
          <p className="mt-6 text-xs text-gray-400">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
        </Card>
      </div>
    );
  }

  if (!businessProfile) {
    return (
      <div className="h-full overflow-y-auto">
        <ProfileSetup 
          user={user} 
          onComplete={() => setProfileLoading(true)} 
          onLogout={handleLogout}
        />
      </div>
    );
  }

  // Main Content
  return (
    <div className="flex-1 bg-gray-50 flex flex-col md:flex-row overflow-hidden h-full">
      {/* Offline Indicator */}
      {!isOnline && (
        <div className="bg-amber-500 text-white text-[10px] py-1 px-4 text-center font-bold sticky top-0 z-[100] flex items-center justify-center gap-2">
          <Info className="w-3 h-3" />
          WORKING OFFLINE: Your changes will sync automatically when you connect to internet.
        </div>
      )}

      {/* Sidebar / Bottom Nav */}
      <nav className="md:w-64 bg-white border-t md:border-t-0 md:border-r border-gray-200 z-50 order-2 md:order-1 flex-shrink-0">
        <div className="flex md:flex-col justify-between md:justify-start h-16 md:h-full px-1 md:p-4">
          <div className="hidden md:flex items-center gap-3 mb-8 px-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-slate-900">Smart Install</span>
          </div>
          
          <NavButton 
            active={activeTab === "dashboard"} 
            onClick={() => setActiveTab("dashboard")}
            icon={<LayoutDashboard className="w-5 h-5" />}
            label="Dashboard"
          />
          <NavButton 
            active={activeTab === "customers"} 
            onClick={() => setActiveTab("customers")}
            icon={<Users className="w-5 h-5" />}
            label="Customers"
          />
          <NavButton 
            active={activeTab === "installments"} 
            onClick={() => setActiveTab("installments")}
            icon={<FileText className="w-5 h-5" />}
            label="Installments"
          />
          <NavButton 
            active={activeTab === "reminders"} 
            onClick={() => setActiveTab("reminders")}
            icon={<Bell className="w-5 h-5" />}
            label="Reminders"
            badge={reminderCount}
          />
          <NavButton 
            active={activeTab === "salespeople"} 
            onClick={() => setActiveTab("salespeople")}
            icon={<Users className="w-5 h-5" />}
            label="Salespeople"
          />
          <NavButton 
            active={activeTab === "trash"} 
            onClick={() => setActiveTab("trash")}
            icon={<Trash2 className="w-5 h-5" />}
            label="Trash"
            badge={trashCustomers.length + trashSalespeople.length}
          />
          <NavButton 
            active={activeTab === "settings"} 
            onClick={() => setActiveTab("settings")}
            icon={<Settings className="w-5 h-5" />}
            label="Settings"
          />

          <div className="mt-auto hidden md:block">
            <div className="flex items-center gap-3 p-2 mb-4">
              <img src={user.photoURL || ""} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.displayName}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            </div>
            <Button variant="ghost" onClick={handleLogout} className="w-full justify-start gap-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50">
              <LogOut className="w-4 h-4" />
              Logout
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto order-1 md:order-2 relative">
        <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 md:px-8 py-4 md:py-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between z-40">
          <h2 className="text-xl font-bold capitalize">{activeTab}</h2>
          <div className="flex items-center gap-4">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input 
                placeholder="Search..." 
                className="pl-9 w-64" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="md:hidden">
              <img src={user.photoURL || ""} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
            </div>
          </div>
        </header>

        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            {activeTab === "dashboard" && (
              <DashboardView 
                key="dashboard"
                customers={activeCustomers} 
                installments={activeInstallments} 
                payments={activePayments} 
                salespeople={activeSalespeople}
                onAddCustomer={() => setIsAddingCustomer(true)}
                onAddInstallment={() => setIsAddingInstallment(true)}
                businessProfile={businessProfile}
                onNavigate={setActiveTab}
              />
            )}
            {activeTab === "customers" && (
              <CustomersView 
                customers={activeCustomers} 
                salespeople={activeSalespeople}
                installments={installments}
                payments={payments}
                searchQuery={searchQuery}
              />
            )}
            {activeTab === "installments" && (
              <InstallmentsView 
                installments={activeInstallments} 
                customers={activeCustomers}
                salespeople={activeSalespeople}
                payments={activePayments}
                searchQuery={searchQuery}
                businessProfile={businessProfile}
              />
            )}
            {activeTab === "reminders" && (
              <RemindersView 
                installments={activeInstallments} 
                customers={activeCustomers}
                businessProfile={businessProfile}
              />
            )}
            {activeTab === "salespeople" && (
              <SalespeopleView 
                salespeople={activeSalespeople}
                installments={activeInstallments}
                customers={activeCustomers}
              />
            )}
            {activeTab === "trash" && (
              <TrashView 
                customers={trashCustomers}
                salespeople={trashSalespeople}
                installments={installments}
                payments={payments}
              />
            )}
            {activeTab === "settings" && (
              <SettingsView 
                profile={businessProfile}
                user={user}
              />
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {isAddingCustomer && (
            <CustomerModal 
              customer={null} 
              salespeople={salespeople}
              onClose={() => {
                setIsAddingCustomer(false);
                setPreselectedSalespersonId(null);
              }} 
              onSuccess={(id) => {
                setIsAddingCustomer(false);
                setPreselectedCustomerId(id);
                setIsAddingInstallment(true);
              }}
            />
          )}
          {isAddingInstallment && (
            <InstallmentModal 
              customers={customers} 
              salespeople={salespeople}
              initialCustomerId={preselectedCustomerId || undefined}
              initialSalespersonId={preselectedSalespersonId || undefined}
              onClose={() => {
                setIsAddingInstallment(false);
                setPreselectedCustomerId(null);
                setPreselectedSalespersonId(null);
              }} 
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- Sub-Views ---

function NavButton({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number }) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={cn(
        "flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-1 md:px-3 py-2 rounded-lg transition-all flex-1 md:w-full h-full md:h-auto relative touch-manipulation active:scale-95 cursor-pointer pointer-events-auto",
        active 
          ? "text-indigo-600 md:bg-indigo-50 font-medium" 
          : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
      )}
    >
      <div className="relative">
        {icon}
        {badge && badge > 0 && (
          <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">
            {badge}
          </span>
        )}
      </div>
      <span className="text-[10px] md:text-sm">{label}</span>
    </button>
  );
}

const DashboardView = React.memo(({ customers, installments, payments, salespeople, onAddCustomer, onAddInstallment, businessProfile, onNavigate }: { 
  customers: Customer[]; 
  installments: Installment[]; 
  payments: Payment[];
  salespeople: Salesperson[];
  onAddCustomer: () => void;
  onAddInstallment: () => void;
  businessProfile: BusinessProfile | null;
  onNavigate: (tab: any) => void;
}) => {
  const stats = useMemo(() => {
    const totalSalesValue = installments.reduce((acc, curr) => acc + curr.totalPrice, 0);
    const totalOutstanding = installments.reduce((acc, curr) => acc + curr.remainingBalance, 0);
    const totalReceived = payments.reduce((acc, curr) => acc + curr.amount, 0);
    const monthlyEarnings = payments
      .filter(p => {
        const date = p.paymentDate instanceof Timestamp ? p.paymentDate.toDate() : new Date(p.paymentDate);
        return date.getMonth() === new Date().getMonth() && date.getFullYear() === new Date().getFullYear();
      })
      .reduce((acc, curr) => acc + curr.amount, 0);

    const dueReminders = installments.filter(inst => {
      if (inst.status !== 'active') return false;
      const dueDate = inst.nextDueDate instanceof Timestamp ? inst.nextDueDate.toDate() : new Date(inst.nextDueDate);
      return differenceInDays(startOfDay(dueDate), startOfDay(new Date())) <= 3;
    }).length;

    return {
      totalCustomers: customers.length,
      totalSalesValue,
      totalOutstanding,
      totalReceived,
      monthlyEarnings,
      dueReminders
    };
  }, [customers, installments, payments]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{businessProfile?.businessName || "Business Overview"}</h2>
          <p className="text-slate-500">Welcome back, {businessProfile?.ownerName || "here's what's happening today"}.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onAddCustomer} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
            <Plus className="w-4 h-4" />
            Add Customer
          </Button>
          <Button onClick={onAddInstallment} variant="outline" className="gap-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50">
            <CreditCard className="w-4 h-4" />
            New Plan
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard 
          label="Total Customers" 
          value={stats.totalCustomers} 
          icon={<Users className="text-indigo-600" />} 
          color="indigo" 
          onClick={() => onNavigate('customers')}
        />
        <StatCard 
          label="Total Sales Value" 
          value={`Rs. ${stats.totalSalesValue.toLocaleString()}`} 
          icon={<Store className="text-slate-600" />} 
          color="slate" 
          onClick={() => onNavigate('installments')}
        />
        <StatCard 
          label="Total Outstanding" 
          value={`Rs. ${stats.totalOutstanding.toLocaleString()}`} 
          icon={<AlertCircle className="text-amber-600" />} 
          color="amber" 
          onClick={() => onNavigate('installments')}
        />
        <StatCard 
          label="Total Received" 
          value={`Rs. ${stats.totalReceived.toLocaleString()}`} 
          icon={<CheckCircle2 className="text-emerald-600" />} 
          color="emerald" 
          onClick={() => onNavigate('installments')}
        />
        <StatCard 
          label="Monthly Earnings" 
          value={`Rs. ${stats.monthlyEarnings.toLocaleString()}`} 
          icon={<TrendingUp className="text-violet-600" />} 
          color="violet" 
          onClick={() => onNavigate('installments')}
        />
        <StatCard 
          label="Due Reminders" 
          value={stats.dueReminders} 
          icon={<Bell className="text-rose-600" />} 
          color="rose" 
          onClick={() => onNavigate('reminders')}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-bold mb-4 flex items-center gap-2 text-slate-800">
            <Calendar className="w-5 h-5 text-indigo-600" />
            Upcoming Payments
          </h3>
          <div className="space-y-4">
            {installments.filter(i => i.status === 'active').slice(0, 5).map(inst => {
              const customer = customers.find(c => c.id === inst.customerId);
              const salesperson = salespeople.find(s => s.id === inst.salespersonId);
              return (
                <div key={inst.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div>
                    <p className="font-semibold text-sm text-slate-900">{customer?.name || 'Unknown'}</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs text-slate-500">{inst.productName}</p>
                      <span className="text-[9px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded font-bold uppercase tracking-tighter">
                        By {salesperson?.name || 'Owner'}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm text-indigo-600">Rs. {inst.monthlyInstallment.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-400">Due: {safeFormat(inst.nextDueDate, 'MMM dd')}</p>
                  </div>
                </div>
              );
            })}
            {installments.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No active installments</p>}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-bold mb-4 flex items-center gap-2 text-slate-800">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            Recent Activity
          </h3>
          <div className="space-y-4">
            {payments.slice(0, 5).map(pay => {
              const inst = installments.find(i => i.id === pay.installmentId);
              const customer = customers.find(c => c.id === inst?.customerId);
              const salesperson = salespeople.find(s => s.id === inst?.salespersonId);
              return (
                <div key={pay.id} className="flex items-center gap-3 p-3 border-b border-slate-50 last:border-0">
                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <div className="text-[10px] font-bold text-emerald-600">Rs</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{customer?.name || 'Unknown'}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-slate-500">Payment for {inst?.productName || 'Installment'}</p>
                      <span className="text-[8px] px-1 bg-slate-100 text-slate-500 rounded font-bold uppercase">
                        {salesperson?.name || 'Owner'}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-emerald-600">+Rs. {pay.amount.toLocaleString()}</p>
                </div>
              );
            })}
            {payments.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No recent payments</p>}
          </div>
        </Card>
      </div>
    </motion.div>
  );
});

function StatCard({ label, value, icon, color, onClick }: { label: string; value: string | number; icon: React.ReactNode; color: string; onClick?: () => void }) {
  const colors: Record<string, string> = {
    indigo: "bg-indigo-50",
    amber: "bg-amber-50",
    emerald: "bg-emerald-50",
    violet: "bg-violet-50",
    rose: "bg-rose-50",
  };
  return (
    <Card 
      className={cn(
        "p-4 md:p-6 border-slate-100 transition-all",
        onClick && "cursor-pointer hover:border-indigo-200 hover:shadow-sm active:scale-95"
      )}
      onClick={onClick}
    >
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center mb-4", colors[color])}>
        {icon}
      </div>
      <p className="text-xs md:text-sm text-slate-500 font-medium mb-1">{label}</p>
      <p className="text-lg md:text-2xl font-bold text-slate-900">{value}</p>
    </Card>
  );
}

const SettingsView = React.memo(({ profile, user }: { profile: BusinessProfile | null; user: FirebaseUser }) => {
  const [formData, setFormData] = useState<BusinessProfile>(profile || {
    businessName: "",
    ownerName: user.displayName || "",
    phone: "+92",
    address: "",
    tagline: "",
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await setDoc(doc(db, "profiles", user.uid), {
        ...formData,
        updatedAt: serverTimestamp(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error("Profile update failed", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-2xl"
    >
      <Card className="p-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
            <Settings className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-xl font-bold">Business Settings</h3>
            <p className="text-sm text-gray-500">Update your business information for receipts and slips.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Business Name</label>
              <Input 
                required 
                value={formData.businessName}
                onChange={e => setFormData({...formData, businessName: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Owner Name</label>
              <Input 
                required 
                value={formData.ownerName}
                onChange={e => setFormData({...formData, ownerName: e.target.value})}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Contact Phone</label>
              <Input 
                required 
                value={formData.phone}
                onChange={e => {
                  let val = e.target.value;
                  if (!val.startsWith('+92')) val = '+92' + val.replace(/^\+?92?/, '');
                  setFormData({...formData, phone: val});
                }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Business Tagline</label>
              <Input 
                value={formData.tagline}
                onChange={e => setFormData({...formData, tagline: e.target.value})}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Business Address</label>
            <Input 
              required 
              value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
            />
          </div>

          <div className="pt-4 flex items-center gap-4">
            <Button type="submit" disabled={loading} className="px-8">
              {loading ? "Saving..." : "Save Changes"}
            </Button>
            {saved && (
              <motion.p 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-emerald-600 text-sm font-medium flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                Settings saved successfully!
              </motion.p>
            )}
          </div>
        </form>
      </Card>

      <div className="mt-8 p-6 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-start gap-4">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <Info className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h4 className="font-bold text-indigo-900 text-sm">Professional Tip</h4>
          <p className="text-indigo-700 text-sm mt-1">
            The information you provide here will be automatically included in all PDF receipts and payment slips you generate for your customers. Make sure it's accurate!
          </p>
        </div>
      </div>
    </motion.div>
  );
});

const CustomersView = React.memo(({ customers, salespeople, installments, payments, searchQuery }: { 
  customers: Customer[]; 
  salespeople: Salesperson[]; 
  installments: Installment[];
  payments: Payment[];
  searchQuery: string 
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.phone.includes(searchQuery) ||
    c.cnic.includes(searchQuery)
  );

  const confirmDelete = async () => {
    if (!customerToDelete) return;
    
    // Optimistic Delete: Close modal immediately
    const idToDelete = customerToDelete.id;
    setCustomerToDelete(null);
    
    try {
      console.log("Moving customer to trash:", idToDelete);
      // Mark customer as deleted
      await updateDoc(doc(db, "customers", idToDelete), {
        isDeleted: true,
        deletedAt: serverTimestamp()
      });

      // Cascade delete: Mark all associated installments as deleted
      const customerInstallments = installments.filter(i => i.customerId === idToDelete);
      for (const inst of customerInstallments) {
        await updateDoc(doc(db, "installments", inst.id), {
          isDeleted: true,
          deletedAt: serverTimestamp()
        });

        // Mark all associated payments as deleted
        const instPayments = payments.filter(p => p.installmentId === inst.id);
        for (const pay of instPayments) {
          await updateDoc(doc(db, "payments", pay.id), {
            isDeleted: true,
            deletedAt: serverTimestamp()
          });
        }
      }
      
      console.log("Customer and associated records moved to trash successfully");
    } catch (err) {
      console.error("Failed to move customer to trash:", err);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500 font-medium">{filteredCustomers.length} Customers found</p>
        <Button onClick={() => setIsAdding(true)} className="bg-indigo-600 hover:bg-indigo-700 gap-2 shadow-sm">
          <Plus className="w-4 h-4" />
          Add Customer
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCustomers.map(customer => (
          <Card 
            key={customer.id} 
            className="p-5 hover:border-indigo-300 transition-all cursor-pointer group border-slate-100 relative" 
            onClick={() => setEditingCustomer(customer)}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 group-hover:bg-indigo-50 transition-colors">
                <Users className="w-6 h-6 text-slate-400 group-hover:text-indigo-600 transition-colors" />
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCustomerToDelete(customer);
                  }}
                  className="p-2 text-slate-400 md:text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all md:opacity-0 md:group-hover:opacity-100"
                  title="Delete Customer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 transition-all group-hover:translate-x-1" />
              </div>
            </div>
            <h4 className="font-bold text-slate-900 text-lg mb-1">{customer.name}</h4>
            <div className="space-y-1 mb-3">
              <p className="text-sm text-slate-500 flex items-center gap-2">
                <Phone className="w-3 h-3" />
                {customer.phone}
              </p>
              <p className="text-xs text-slate-400 font-medium tracking-wide">CNIC: {customer.cnic}</p>
            </div>

            {customer.salespersonId && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-indigo-50 rounded-md w-fit">
                <Store className="w-3 h-3 text-indigo-500" />
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                  {salespeople.find(s => s.id === customer.salespersonId)?.name || "Worker"}
                </span>
              </div>
            )}
          </Card>
        ))}
      </div>

      <AnimatePresence>
        {(isAdding || editingCustomer) && (
          <CustomerModal 
            customer={editingCustomer} 
            salespeople={salespeople}
            onClose={() => { setIsAdding(false); setEditingCustomer(null); }} 
          />
        )}
        {customerToDelete && (
          <DeleteConfirmModal 
            title="Delete Customer"
            message={`Are you sure you want to delete ${customerToDelete.name}? This action cannot be undone.`}
            onConfirm={confirmDelete}
            onCancel={() => setCustomerToDelete(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
});

const CustomerModal = React.memo(({ customer, salespeople, onClose, onSuccess }: { customer: Customer | null; salespeople: Salesperson[]; onClose: () => void; onSuccess?: (customerId: string) => void }) => {
  const [formData, setFormData] = useState({
    name: customer?.name || "",
    phone: customer?.phone || "+92",
    cnic: customer?.cnic || "",
    address: customer?.address || "",
    salespersonId: customer?.salespersonId || "",
    guarantor1: {
      name: customer?.guarantor1?.name || "",
      phone: customer?.guarantor1?.phone || "+92",
      cnic: customer?.guarantor1?.cnic || "",
    },
    guarantor2: {
      name: customer?.guarantor2?.name || "",
      phone: customer?.guarantor2?.phone || "+92",
      cnic: customer?.guarantor2?.cnic || "",
    },
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (customer?.cnicPhotoUrl) {
      setPhotoPreview(customer.cnicPhotoUrl);
    }
  }, [customer]);

  useEffect(() => {
    if (!photo) {
      if (!customer?.cnicPhotoUrl) setPhotoPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(photo);
    setPhotoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo, customer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("CustomerModal: handleSubmit started");
    if (!auth.currentUser) {
      console.error("CustomerModal: No user authenticated");
      return setError("User not authenticated. Please login again.");
    }
    
    setLoading(true);
    setError(null);
    setSuccess(false);
    setUploadProgress(0);
    
    // Small delay to ensure loading state is rendered
    await new Promise(resolve => setTimeout(resolve, 100));
    
    try {
      let photoUrl = customer?.cnicPhotoUrl || "";
      
      if (photo) {
        if (navigator.onLine) {
          console.log("CustomerModal: Starting photo upload...");
          const storageRef = ref(storage, `cnics/${auth.currentUser.uid}/${Date.now()}_${photo.name}`);
          const uploadTask = uploadBytesResumable(storageRef, photo);
          
          const uploadPromise = new Promise<string>((resolve, reject) => {
            uploadTask.on('state_changed', 
              (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setUploadProgress(progress);
              }, 
              (error) => reject(error), 
              async () => {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(downloadURL);
              }
            );
          });
          photoUrl = await withTimeout(uploadPromise, 30000);
        } else {
          console.warn("CustomerModal: Offline, skipping photo upload");
          // We can't upload photo offline, but we'll save the rest
        }
      }

      const data = {
        ...formData,
        cnicPhotoUrl: photoUrl,
        userId: auth.currentUser.uid,
        updatedAt: serverTimestamp(),
      };

      // OPTIMISTIC SAVE: Don't await the server response for the UI to continue
      // Firestore will handle the sync in the background
      if (customer) {
        updateDoc(doc(db, "customers", customer.id), data).catch(err => console.error("Background update failed", err));
        setSuccess(true);
        setLoading(false);
        setTimeout(() => {
          onClose();
          if (onSuccess) onSuccess(customer.id);
        }, 1200);
      } else {
        // Generate ID client-side for true optimism
        const customerRef = doc(collection(db, "customers"));
        const customerId = customerRef.id;
        
        setDoc(customerRef, {
          ...data,
          createdAt: serverTimestamp(),
        }).catch(err => console.error("Background add failed", err));
        
        setSuccess(true);
        setLoading(false);
        setTimeout(() => {
          onClose();
          if (onSuccess) onSuccess(customerId);
        }, 1200);
      }

    } catch (err: any) {
      console.error("CustomerModal: Error saving customer", err);
      setError(err.message || "Failed to save customer. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl my-auto"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xl font-bold">{customer ? 'Edit Customer' : 'Add New Customer'}</h3>
          <Button variant="ghost" onClick={onClose}>&times;</Button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 text-sm rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-600 text-sm rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Customer saved successfully!
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Salesperson (Worker Profile)</label>
            <select 
              className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={formData.salespersonId}
              onChange={e => setFormData({...formData, salespersonId: e.target.value})}
            >
              <option value="">Direct Sale (My Own Profile)</option>
              {salespeople.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400">Select which worker's profile this customer belongs to.</p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Full Name</label>
            <Input 
              required 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})} 
              placeholder="e.g. Muhammad Ali" 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">Phone Number</label>
              <Input 
                required 
                value={formData.phone} 
                onChange={e => {
                  let val = e.target.value;
                  if (!val.startsWith('+92')) val = '+92' + val.replace(/^\+?92?/, '');
                  setFormData({...formData, phone: val});
                }} 
                placeholder="+92 3xx xxxxxxx" 
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">CNIC Number</label>
              <Input required value={formData.cnic} onChange={e => setFormData({...formData, cnic: e.target.value})} placeholder="xxxxx-xxxxxxx-x" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Address</label>
            <Input required value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="Full residential address" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-indigo-600 uppercase">Guarantor 1</h4>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Name</label>
                <Input required value={formData.guarantor1.name} onChange={e => setFormData({...formData, guarantor1: {...formData.guarantor1, name: e.target.value}})} placeholder="Guarantor 1 Name" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Phone</label>
                <Input 
                  required 
                  value={formData.guarantor1.phone} 
                  onChange={e => {
                    let val = e.target.value;
                    if (!val.startsWith('+92')) val = '+92' + val.replace(/^\+?92?/, '');
                    setFormData({...formData, guarantor1: {...formData.guarantor1, phone: val}});
                  }} 
                  placeholder="+92 3xx xxxxxxx" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">CNIC</label>
                <Input required value={formData.guarantor1.cnic} onChange={e => setFormData({...formData, guarantor1: {...formData.guarantor1, cnic: e.target.value}})} placeholder="xxxxx-xxxxxxx-x" />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold text-indigo-600 uppercase">Guarantor 2</h4>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Name</label>
                <Input required value={formData.guarantor2.name} onChange={e => setFormData({...formData, guarantor2: {...formData.guarantor2, name: e.target.value}})} placeholder="Guarantor 2 Name" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Phone</label>
                <Input 
                  required 
                  value={formData.guarantor2.phone} 
                  onChange={e => {
                    let val = e.target.value;
                    if (!val.startsWith('+92')) val = '+92' + val.replace(/^\+?92?/, '');
                    setFormData({...formData, guarantor2: {...formData.guarantor2, phone: val}});
                  }} 
                  placeholder="+92 3xx xxxxxxx" 
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">CNIC</label>
                <Input required value={formData.guarantor2.cnic} onChange={e => setFormData({...formData, guarantor2: {...formData.guarantor2, cnic: e.target.value}})} placeholder="xxxxx-xxxxxxx-x" />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">CNIC Photo</label>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-4">
                <div className="flex-1 border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:border-indigo-400 transition-colors cursor-pointer relative">
                  <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setPhoto(e.target.files?.[0] || null)} />
                  <Camera className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">{photo ? photo.name : 'Click to upload photo'}</p>
                </div>
                {(photo || customer?.cnicPhotoUrl) && (
                  <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                    <img src={photoPreview || customer?.cnicPhotoUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
              {loading && uploadProgress > 0 && uploadProgress < 100 && (
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                </div>
              )}
            </div>
          </div>
          <div className="pt-4 flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700" disabled={loading}>
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  {uploadProgress > 0 && uploadProgress < 100 ? `Uploading ${Math.round(uploadProgress)}%` : 'Saving...'}
                </div>
              ) : success ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Saved Successfully!
                </div>
              ) : (
                customer ? 'Update Customer' : 'Add Customer'
              )}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
});

const InstallmentsView = React.memo(({ installments, customers, salespeople, payments, searchQuery, businessProfile }: { installments: Installment[]; customers: Customer[]; salespeople: Salesperson[]; payments: Payment[]; searchQuery: string; businessProfile: BusinessProfile | null }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | null>(null);
  const [installmentToDelete, setInstallmentToDelete] = useState<Installment | null>(null);

  const filteredInstallments = installments.filter(inst => {
    const customer = customers.find(c => c.id === inst.customerId);
    return (
      inst.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer?.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const confirmDelete = async () => {
    if (!installmentToDelete) return;
    
    // Optimistic Delete: Close modal immediately
    const idToDelete = installmentToDelete.id;
    setInstallmentToDelete(null);
    
    try {
      console.log("Optimistic delete for installment:", idToDelete);
      await deleteDoc(doc(db, "installments", idToDelete));
      console.log("Installment deleted successfully in background");
    } catch (err) {
      console.error("Failed to delete installment in background:", err);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{filteredInstallments.length} Installments found</p>
        <Button onClick={() => setIsAdding(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Installment
        </Button>
      </div>

      <div className="space-y-4">
        {filteredInstallments.map(inst => {
          const customer = customers.find(c => c.id === inst.customerId);
          const progress = ((inst.totalPayable - inst.remainingBalance) / inst.totalPayable) * 100;
          
          return (
            <Card key={inst.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer group relative" onClick={() => setSelectedInstallment(inst)}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileText className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">{inst.productName}</h4>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-500">{customer?.name || 'Unknown Customer'}</p>
                      {inst.salespersonId && (
                        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-md font-medium">
                          Sold by: {salespeople.find(s => s.id === inst.salespersonId)?.name || 'Worker'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-gray-400 uppercase font-bold">Remaining</p>
                    <p className="font-bold text-indigo-600">Rs. {inst.remainingBalance.toLocaleString()}</p>
                  </div>
                  <div className="w-32 hidden sm:block">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span>Progress</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setInstallmentToDelete(inst);
                      }}
                      className="p-2 text-slate-400 md:text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all md:opacity-0 md:group-hover:opacity-100"
                      title="Delete Installment"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-5 h-5 text-gray-300" />
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <AnimatePresence>
        {isAdding && (
          <InstallmentModal 
            customers={customers} 
            salespeople={salespeople}
            onClose={() => setIsAdding(false)} 
          />
        )}
        {selectedInstallment && (
          <InstallmentDetailsModal 
            installment={selectedInstallment} 
            customer={customers.find(c => c.id === selectedInstallment.customerId)!}
            salespeople={salespeople}
            payments={payments.filter(p => p.installmentId === selectedInstallment.id)}
            onClose={() => setSelectedInstallment(null)} 
            businessProfile={businessProfile}
          />
        )}
        {installmentToDelete && (
          <DeleteConfirmModal 
            title="Delete Installment"
            message={`Are you sure you want to delete the installment record for ${installmentToDelete.productName}?`}
            onConfirm={confirmDelete}
            onCancel={() => setInstallmentToDelete(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
});

const RemindersView = React.memo(({ installments, customers, businessProfile }: { installments: Installment[]; customers: Customer[]; businessProfile: BusinessProfile | null }) => {
  const dueInstallments = useMemo(() => {
    const today = startOfDay(new Date());
    
    return installments
      .filter(inst => inst.status === 'active')
      .map(inst => {
        const dueDate = inst.nextDueDate instanceof Timestamp ? inst.nextDueDate.toDate() : new Date(inst.nextDueDate);
        const daysRemaining = differenceInDays(startOfDay(dueDate), today);
        const customer = customers.find(c => c.id === inst.customerId);
        
        return { ...inst, daysRemaining, customer, dueDate };
      })
      .filter(item => item.daysRemaining <= 3 && item.daysRemaining >= -30)
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [installments, customers]);

  const handleSendReminder = async (item: any) => {
    const message = `Assalam-o-Alaikum *${item.customer?.name}*,
  
This is a friendly reminder from *${businessProfile?.businessName || "our shop"}* regarding your installment for *${item.productName}*.

*Due Date:* ${safeFormat(item.dueDate, 'PPP')}
*Amount Due:* Rs. ${Math.round(item.monthlyInstallment).toLocaleString()}
${item.daysRemaining < 0 ? `*Status:* Overdue by ${Math.abs(item.daysRemaining)} days` : item.daysRemaining === 0 ? `*Status:* Due Today` : `*Status:* Due in ${item.daysRemaining} days`}

Please ensure timely payment. Thank you!
*${businessProfile?.ownerName || businessProfile?.businessName}*`;

    const encodedMessage = encodeURIComponent(message);
    const phone = item.customer?.phone.replace(/[^0-9]/g, '');
    const whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
    
    try {
      await updateDoc(doc(db, "installments", item.id), {
        lastReminderSent: serverTimestamp()
      });
    } catch (error) {
      console.error("Failed to update reminder status", error);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
          <Bell className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Payment Reminders</h2>
          <p className="text-sm text-gray-500">Customers with installments due in the next 3 days or overdue.</p>
        </div>
      </div>

      <div className="grid gap-4">
        {dueInstallments.map(item => (
          <Card key={item.id} className={cn(
            "p-5 border-l-4",
            item.daysRemaining < 0 ? "border-l-rose-500 bg-rose-50/30" : "border-l-amber-500 bg-amber-50/30"
          )}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100">
                  <Users className="w-6 h-6 text-gray-400" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900">{item.customer?.name}</h4>
                  <p className="text-sm text-gray-500">{item.productName} • Rs. {Math.round(item.monthlyInstallment).toLocaleString()}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-6">
                <div className="text-right">
                  <p className={cn(
                    "text-sm font-bold",
                    item.daysRemaining < 0 ? "text-rose-600" : "text-amber-600"
                  )}>
                    {item.daysRemaining === 0 ? "Due Today" : 
                     item.daysRemaining < 0 ? `Overdue by ${Math.abs(item.daysRemaining)} days` : 
                     `Due in ${item.daysRemaining} days`}
                  </p>
                  <p className="text-xs text-gray-400">Next Due: {safeFormat(item.dueDate, 'MMM dd, yyyy')}</p>
                </div>
                
                <Button 
                  onClick={() => handleSendReminder(item)}
                  className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  Send WhatsApp
                </Button>
              </div>
            </div>
          </Card>
        ))}
        
        {dueInstallments.length === 0 && (
          <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900">All caught up!</h3>
            <p className="text-gray-500">No installments are due in the next 3 days.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
});

function SalespeopleView({ salespeople, installments, customers }: { salespeople: Salesperson[]; installments: Installment[]; customers: Customer[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingSalesperson, setEditingSalesperson] = useState<Salesperson | null>(null);
  const [viewingClients, setViewingClients] = useState<Salesperson | null>(null);

  const getSalesStats = (salespersonId: string) => {
    const workerSales = installments.filter(inst => inst.salespersonId === salespersonId);
    const totalSales = workerSales.reduce((sum, inst) => sum + inst.totalPrice, 0);
    const activeCount = workerSales.filter(inst => inst.status === 'active').length;
    return { totalSales, activeCount, count: workerSales.length };
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
            <Users className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Salespeople Management</h2>
            <p className="text-sm text-gray-500">Manage your shop workers and track their sales performance.</p>
          </div>
        </div>
        <Button onClick={() => setIsAdding(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
          <Plus className="w-4 h-4" />
          Add Salesperson
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Self Stats */}
        <Card 
          className="p-6 border-l-4 border-l-slate-400 bg-slate-50/30 cursor-pointer hover:shadow-md transition-all"
          onClick={() => setViewingClients({ id: "self", name: "Direct Sales (Self)", phone: "", userId: "", createdAt: null })}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100">
              <Store className="w-6 h-6 text-slate-600" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Owner (Self)</span>
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">Direct Sales</h3>
          <p className="text-sm text-slate-500 mb-6">Sales made directly by you.</p>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-white rounded-xl border border-slate-100">
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Total Sold</p>
              <p className="text-sm font-bold">Rs. {installments.filter(i => !i.salespersonId).reduce((s, i) => s + i.totalPrice, 0).toLocaleString()}</p>
            </div>
            <div className="p-3 bg-white rounded-xl border border-slate-100">
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Active Plans</p>
              <p className="text-sm font-bold">{installments.filter(i => !i.salespersonId && i.status === 'active').length}</p>
            </div>
          </div>
        </Card>

        {salespeople.map(person => {
          const stats = getSalesStats(person.id);
          return (
            <Card 
              key={person.id} 
              className="p-6 hover:shadow-md transition-shadow group cursor-pointer border-transparent hover:border-indigo-100"
              onClick={() => setViewingClients(person)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                  <Users className="w-6 h-6 text-indigo-600" />
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0 text-slate-400 hover:text-indigo-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingSalesperson(person);
                    }}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">{person.name}</h3>
              <p className="text-sm text-slate-500 mb-6">{person.phone}</p>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                  <p className="text-[10px] text-indigo-400 font-bold uppercase mb-1">Total Sold</p>
                  <p className="text-sm font-bold text-indigo-700">Rs. {stats.totalSales.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Active Plans</p>
                  <p className="text-sm font-bold text-slate-700">{stats.activeCount}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {(isAdding || editingSalesperson) && (
        <SalespersonModal 
          salesperson={editingSalesperson} 
          onClose={() => {
            setIsAdding(false);
            setEditingSalesperson(null);
          }} 
        />
      )}

      {viewingClients && (
        <SalespersonClientsModal 
          salesperson={viewingClients}
          customers={customers}
          installments={installments}
          onClose={() => setViewingClients(null)}
        />
      )}
    </motion.div>
  );
}

function SalespersonClientsModal({ salesperson, customers, installments, onClose }: { 
  salesperson: Salesperson; 
  customers: Customer[]; 
  installments: Installment[];
  onClose: () => void;
}) {
  const workerClients = customers.filter(c => 
    salesperson.id === 'self' ? !c.salespersonId : c.salespersonId === salesperson.id
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-slate-50 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="p-6 bg-white border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold">{salesperson.name}'s Clients</h3>
              <p className="text-sm text-gray-500">{workerClients.length} customers assigned</p>
            </div>
          </div>
          <Button variant="ghost" onClick={onClose} className="text-2xl">&times;</Button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {workerClients.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
              <Users className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 font-medium">No clients found for this worker.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {workerClients.map(customer => {
                const customerInstallments = installments.filter(i => i.customerId === customer.id);
                const activePlans = customerInstallments.filter(i => i.status === 'active').length;
                
                return (
                  <Card key={customer.id} className="p-4 bg-white hover:shadow-md transition-all border-slate-100">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-bold text-slate-900">{customer.name}</h4>
                        <p className="text-xs text-slate-500">{customer.phone}</p>
                      </div>
                      <div className="px-2 py-1 bg-indigo-50 rounded text-[10px] font-bold text-indigo-600 uppercase">
                        {activePlans} Active Plans
                      </div>
                    </div>
                    <div className="space-y-2">
                      {customerInstallments.map(inst => (
                        <div key={inst.id} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg">
                          <span className="font-medium text-slate-700">{inst.productName}</span>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase",
                            inst.status === 'active' ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"
                          )}>
                            {inst.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function SalespersonModal({ salesperson, onClose }: { salesperson: Salesperson | null; onClose: () => void }) {
  const [name, setName] = useState(salesperson?.name || "");
  const [phone, setPhone] = useState(salesperson?.phone || "+92");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const data = {
        name,
        phone,
        userId: auth.currentUser.uid,
        updatedAt: serverTimestamp(),
      };

      // Optimistic save
      if (salesperson) {
        updateDoc(doc(db, "salespeople", salesperson.id), data).catch(err => {
          console.error("Background salesperson update failed", err);
          handleFirestoreError(err, OperationType.UPDATE, "salespeople");
        });
      } else {
        addDoc(collection(db, "salespeople"), {
          ...data,
          createdAt: serverTimestamp(),
        }).catch(err => {
          console.error("Background salesperson add failed", err);
          handleFirestoreError(err, OperationType.CREATE, "salespeople");
        });
      }
      
      setSuccess(true);
      setLoading(false);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error("Error saving salesperson", err);
      setError(err.message || "Failed to save salesperson. Please try again.");
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!salesperson) return;
    setLoading(true);
    setError(null);
    try {
      // Move to trash instead of permanent delete
      await updateDoc(doc(db, "salespeople", salesperson.id), {
        isDeleted: true,
        deletedAt: serverTimestamp()
      });
      onClose();
    } catch (err: any) {
      console.error("Error moving salesperson to trash", err);
      setError(err.message || "Failed to move salesperson to trash.");
      setLoading(false);
      if (err.message?.includes("permission")) {
        handleFirestoreError(err, OperationType.DELETE, "salespeople");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xl font-bold">{salesperson ? "Edit Salesperson" : "Add New Salesperson"}</h3>
          <Button variant="ghost" onClick={onClose} disabled={loading}>&times;</Button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 text-sm rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-600 text-sm rounded-lg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Salesperson saved successfully!
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Full Name</label>
            <Input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ahmed Ali" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Phone Number</label>
            <Input required value={phone} onChange={e => setPhone(e.target.value)} placeholder="+923001234567" />
          </div>
          
          <div className="pt-4 flex gap-3">
            {salesperson && (
              <Button type="button" variant="outline" className="text-rose-600 border-rose-100 hover:bg-rose-50" onClick={() => setShowDeleteConfirm(true)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700" disabled={loading}>
              {loading ? "Saving..." : salesperson ? "Update" : "Add Salesperson"}
            </Button>
          </div>
        </form>
      </motion.div>

      {showDeleteConfirm && (
        <DeleteConfirmModal 
          title="Delete Salesperson?"
          message="This will remove the salesperson profile. Existing sales records will remain but will no longer be linked to this profile."
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}

const InstallmentModal = React.memo(({ customers, salespeople, onClose, initialCustomerId, initialSalespersonId }: { 
  customers: Customer[]; 
  salespeople: Salesperson[]; 
  onClose: () => void;
  initialCustomerId?: string;
  initialSalespersonId?: string;
}) => {
  const [formData, setFormData] = useState({
    customerId: initialCustomerId || "",
    salespersonId: initialSalespersonId || "",
    productName: "",
    brand: "",
    model: "",
    imei: "",
    totalPrice: 0,
    advancePayment: 0,
    duration: 12,
    profitPercentage: 20,
    formCharges: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (formData.customerId) {
      const customer = customers.find(c => c.id === formData.customerId);
      if (customer?.salespersonId) {
        setFormData(prev => ({ ...prev, salespersonId: customer.salespersonId || "" }));
      }
    }
  }, [formData.customerId, customers]);

  const calculations = useMemo(() => {
    const totalPrice = Number(formData.totalPrice) || 0;
    const profitPercentage = Number(formData.profitPercentage) || 0;
    const formCharges = Number(formData.formCharges) || 0;
    const advancePayment = Number(formData.advancePayment) || 0;
    const duration = Math.max(1, Number(formData.duration) || 1);

    const profit = (totalPrice * profitPercentage) / 100;
    const totalPayable = totalPrice + profit + formCharges;
    const remainingAfterAdvance = totalPayable - advancePayment;
    const monthlyInstallment = remainingAfterAdvance / duration;

    return {
      totalPayable,
      monthlyInstallment,
      remainingBalance: remainingAfterAdvance
    };
  }, [formData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("InstallmentModal: handleSubmit started");
    if (!auth.currentUser) {
      console.error("InstallmentModal: No user authenticated");
      return setError("User not authenticated. Please login again.");
    }
    if (!formData.customerId) {
      console.error("InstallmentModal: No customer selected");
      return setError("Please select a customer");
    }
    
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      console.log("InstallmentModal: Saving to Firestore (Optimistic)...", { ...formData, ...calculations });
      
      // Optimistic save: Don't await the server response
      addDoc(collection(db, "installments"), {
        ...formData,
        ...calculations,
        status: "active",
        nextDueDate: addMonths(new Date(), 1),
        userId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      }).catch(err => console.error("Background installment add failed", err));
      
      setSuccess(true);
      setLoading(false);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error("InstallmentModal: Error saving installment", err);
      setError(err.message || "Failed to save installment. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-auto"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xl font-bold">New Installment Plan</h3>
          <Button variant="ghost" onClick={onClose}>&times;</Button>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          {error && (
            <div className="p-3 mb-4 bg-rose-50 border border-rose-100 text-rose-600 text-sm rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Select Customer</label>
                <select 
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={formData.customerId}
                  onChange={e => setFormData({...formData, customerId: e.target.value})}
                  required
                >
                  <option value="">Choose a customer...</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Salesperson (Worker)</label>
                <select 
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={formData.salespersonId}
                  onChange={e => setFormData({...formData, salespersonId: e.target.value})}
                >
                  <option value="">Direct Sale (Owner)</option>
                  {salespeople.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Product Name</label>
                <Input 
                  required 
                  value={formData.productName} 
                  onChange={e => setFormData({...formData, productName: e.target.value})} 
                  placeholder="e.g. Mobile, Washing Machine, Laptop" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Brand</label>
                  <Input 
                    required 
                    value={formData.brand} 
                    onChange={e => setFormData({...formData, brand: e.target.value})} 
                    placeholder="e.g. Samsung, LG" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Model</label>
                  <Input 
                    required 
                    value={formData.model} 
                    onChange={e => setFormData({...formData, model: e.target.value})} 
                    placeholder="e.g. S24 Ultra, 8kg Front Load" 
                  />
                </div>
              </div>
              {(formData.productName.toLowerCase().includes('phone') || formData.productName.toLowerCase().includes('mobile') || formData.productName.toLowerCase().includes('smartphone')) && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="space-y-1"
                >
                  <label className="text-xs font-bold text-gray-500 uppercase">IMEI Number</label>
                  <Input 
                    value={formData.imei} 
                    onChange={e => setFormData({...formData, imei: e.target.value})} 
                    placeholder="15-digit IMEI number" 
                    className="border-indigo-200 focus:ring-indigo-500"
                  />
                </motion.div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Total Price (Rs)</label>
                  <Input type="number" required value={formData.totalPrice} onChange={e => setFormData({...formData, totalPrice: Number(e.target.value)})} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Advance (Rs)</label>
                  <Input type="number" required value={formData.advancePayment} onChange={e => setFormData({...formData, advancePayment: Number(e.target.value)})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Duration (Months)</label>
                  <Input type="number" required value={formData.duration} onChange={e => setFormData({...formData, duration: Number(e.target.value)})} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">Profit (%)</label>
                  <Input type="number" required value={formData.profitPercentage} onChange={e => setFormData({...formData, profitPercentage: Number(e.target.value)})} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Form Charges (Rs)</label>
                <Input 
                  type="number" 
                  value={formData.formCharges || ""} 
                  onChange={e => setFormData({...formData, formCharges: Number(e.target.value)})} 
                  placeholder="Enter form charges (e.g. 500, 1000)"
                />
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 space-y-4">
              <h4 className="font-bold text-sm text-gray-400 uppercase">Summary</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total Payable:</span>
                  <span className="font-bold">Rs. {calculations.totalPayable.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Monthly Installment:</span>
                  <span className="font-bold text-indigo-600">Rs. {Math.round(calculations.monthlyInstallment).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Remaining Balance:</span>
                  <span className="font-bold">Rs. {calculations.remainingBalance.toLocaleString()}</span>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-200">
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  * Monthly installment is calculated by adding profit to the total price, subtracting the advance payment, and dividing by the duration.
                </p>
              </div>
            </div>
          </div>
          <div className="pt-8 flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700" disabled={loading}>
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Saving...
                </div>
              ) : success ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Saved Successfully!
                </div>
              ) : (
                "Create Plan"
              )}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
});

function InstallmentDetailsModal({ installment, customer, salespeople, payments, onClose, businessProfile }: { installment: Installment; customer: Customer; salespeople: Salesperson[]; payments: Payment[]; onClose: () => void; businessProfile: BusinessProfile | null }) {
  const [isPaying, setIsPaying] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(Math.round(installment.monthlyInstallment));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handlePayment = async () => {
    if (paymentAmount <= 0) return;
    
    setLoading(true);
    setError(null);
    setSuccess(false);
    
    try {
      const newRemaining = installment.remainingBalance - paymentAmount;
      const status = newRemaining <= 0 ? "completed" : "active";

      const currentDueDate = toDate(installment.nextDueDate);
      const nextDate = addMonths(currentDueDate, 1);

      console.log("handlePayment: Starting optimistic payment update");

      // 1. Record the payment (Optimistic - don't await)
      addDoc(collection(db, "payments"), {
        installmentId: installment.id,
        amount: paymentAmount,
        paymentDate: serverTimestamp(),
        userId: auth.currentUser?.uid,
        createdAt: serverTimestamp(),
      }).catch(err => console.error("Background payment record failed", err));

      // 2. Update installment balance (Optimistic - don't await)
      updateDoc(doc(db, "installments", installment.id), {
        remainingBalance: newRemaining,
        status: status,
        nextDueDate: nextDate,
      }).catch(err => console.error("Background installment update failed", err));

      // Small delay to show success/processing state before closing
      setSuccess(true);
      setTimeout(() => {
        setIsPaying(false);
        setLoading(false);
        setSuccess(false);
      }, 1500);
      
    } catch (err: any) {
      console.error("Payment failed", err);
      setError("Payment failed. " + (err.message || "Please try again."));
      setLoading(false);
    }
  };

  const generateReceipt = async (payment?: Payment, forceDownload: boolean = false) => {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    
    const doc = new jsPDF();
    const isSlip = !!payment;
    const title = isSlip ? "PAYMENT RECEIPT" : "ACCOUNT STATEMENT";
    const businessName = businessProfile?.businessName.toUpperCase() || "SMART INSTALLMENT MANAGER";
    const tagline = businessProfile?.tagline || "Quality Products on Easy Installments";
    const receiptNo = payment ? `REC-${payment.id.substring(0, 8).toUpperCase()}` : `STMT-${installment.id.substring(0, 8).toUpperCase()}`;
    
    // --- Colors & Styles ---
    const primaryColor: [number, number, number] = [30, 41, 59]; // Slate 800 (Professional Dark)
    const accentColor: [number, number, number] = [79, 70, 229]; // Indigo 600
    const lightGray: [number, number, number] = [248, 250, 252]; // Slate 50
    
    // --- Header Section (Clean & Minimalist) ---
    doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.text(businessName, 20, 25);
    
    doc.setTextColor(100, 116, 139); // Slate 500
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(tagline, 20, 32);
    
    // Title Badge
    doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.rect(140, 15, 55, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(title, 167.5, 21.5, { align: "center" });
    
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFontSize(9);
    doc.text(`Receipt #: ${receiptNo}`, 140, 30);
    
    const displayDate = toDate(payment?.paymentDate || payment?.createdAt);
      
    doc.text(`Date: ${format(displayDate, 'PPP')}`, 140, 35);

    // Horizontal Line
    doc.setDrawColor(226, 232, 240); // Slate 200
    doc.setLineWidth(0.5);
    doc.line(20, 45, 190, 45);
    
    // --- Info Section ---
    // Customer Details
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("BILL TO:", 20, 55);
    
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(customer.name, 20, 62);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Phone: ${customer.phone}`, 20, 68);
    doc.text(`CNIC: ${customer.cnic}`, 20, 73);
    doc.text(`Address: ${customer.address}`, 20, 78);
    
    // Product Details
    doc.setTextColor(100, 116, 139);
    doc.text("PRODUCT DETAILS:", 120, 55);
    
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${installment.brand} ${installment.model}`, 120, 62);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Product: ${installment.productName}`, 120, 68);
    if (installment.imei) doc.text(`IMEI: ${installment.imei}`, 120, 73);
    doc.text(`Plan Duration: ${installment.duration} Months`, 120, 78);
    
    const salesperson = salespeople.find(s => s.id === installment.salespersonId);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.text(`Dealt By: ${salesperson ? salesperson.name : "Shop Owner"}`, 120, 83);
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    // Hide form charges from the total shown to customer if requested
    const displayTotal = installment.totalPayable - (installment.formCharges || 0);
    doc.text(`Total Payable: Rs. ${displayTotal.toLocaleString()}`, 120, 88);
    
    doc.setFont("helvetica", "bold");
    doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    
    const displayRemaining = installment.remainingBalance - (installment.formCharges || 0);
    doc.text(`Remaining: Rs. ${Math.max(0, displayRemaining).toLocaleString()}`, 120, 93);

    // --- Payment Table ---
    const tablePayments = payment ? [payment] : [...payments].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    const tableData = tablePayments.map((p, index) => [
      payment ? "1" : (index + 1).toString(),
      safeFormat(p.paymentDate, 'MMM dd, yyyy'),
      `Rs. ${p.amount.toLocaleString()}`,
      "Payment Received"
    ]);

    autoTable(doc, {
      startY: 95,
      head: [['Sr#', 'Transaction Date', 'Amount', 'Description']],
      body: tableData,
      headStyles: { 
        fillColor: [241, 245, 249], 
        textColor: primaryColor, 
        fontStyle: 'bold',
        halign: 'center' 
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        1: { halign: 'center' },
        2: { halign: 'right' },
        3: { halign: 'left' }
      },
      styles: { 
        fontSize: 9, 
        cellPadding: 4,
        lineColor: [226, 232, 240],
        lineWidth: 0.1
      },
      alternateRowStyles: { fillColor: [255, 255, 255] }
    });

    const finalY = (doc as any).lastAutoTable?.finalY || 90;
    
    // --- Summary Section ---
    const summaryX = 130;
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    
    doc.text("Total Amount Paid:", summaryX, finalY + 15);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(`Rs. ${(installment.totalPayable - installment.remainingBalance).toLocaleString()}`, 190, finalY + 15, { align: "right" });
    
    doc.setDrawColor(226, 232, 240);
    doc.line(summaryX, finalY + 18, 190, finalY + 18);
    
    doc.setFont("helvetica", "bold");
    doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.text("Remaining Balance:", summaryX, finalY + 25);
    const displayRemainingSummary = Math.max(0, installment.remainingBalance - (installment.formCharges || 0));
    doc.text(`Rs. ${displayRemainingSummary.toLocaleString()}`, 190, finalY + 25, { align: "right" });
    
    // --- Footer Section ---
    const footerY = 250;
    doc.setDrawColor(226, 232, 240);
    doc.line(20, footerY, 190, footerY);
    
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(businessName, 20, footerY + 10);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(businessProfile?.address || "", 20, footerY + 15);
    doc.text(`Contact: ${businessProfile?.phone || ""}`, 20, footerY + 20);
    
    // Signature Area
    doc.setDrawColor(203, 213, 225);
    doc.line(140, footerY + 25, 190, footerY + 25);
    doc.text("Authorized Signature", 165, footerY + 30, { align: "center" });
    
    // Watermark/System Info
    doc.setFontSize(7);
    doc.setTextColor(203, 213, 225);
    doc.text(`Generated by Smart Installment Manager • ${format(new Date(), 'PPP p')}`, 105, 285, { align: "center" });
    
    const fileName = isSlip 
      ? `Slip_${customer.name.replace(/\s+/g, '_')}_${format(displayDate, 'yyyyMMdd')}.pdf`
      : `Statement_${customer.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`;
      
    if (!forceDownload && navigator.share && navigator.canShare && navigator.canShare({ files: [new File([doc.output('blob')], fileName, { type: 'application/pdf' })] })) {
      try {
        const pdfBlob = doc.output('blob');
        const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
        await navigator.share({
          files: [file],
          title: title,
          text: `${title} from ${businessName}`,
        });
      } catch (err) {
        console.error("Share failed, falling back to download", err);
        doc.save(fileName);
      }
    } else {
      // Robust download for mobile and desktop
      const pdfBlob = doc.output('blob');
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <motion.div 
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 50, opacity: 0 }}
        className="bg-white rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl h-[90vh] flex flex-col"
      >
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-indigo-600 text-white">
          <div>
            <h3 className="text-xl font-bold">{installment.productName}</h3>
            <p className="text-sm opacity-80">{customer.name}</p>
          </div>
          <Button variant="ghost" onClick={onClose} className="text-white hover:bg-white/10">&times;</Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 text-sm rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Total Price</p>
              <p className="font-bold">Rs. {installment.totalPrice.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">Advance</p>
              <p className="font-bold">Rs. {installment.advancePayment.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-indigo-50 rounded-xl">
              <p className="text-[10px] text-indigo-400 uppercase font-bold mb-1">Monthly</p>
              <p className="font-bold text-indigo-600">Rs. {Math.round(installment.monthlyInstallment).toLocaleString()}</p>
            </div>
            <div className="p-4 bg-orange-50 rounded-xl">
              <p className="text-[10px] text-orange-400 uppercase font-bold mb-1">Remaining</p>
              <p className="font-bold text-orange-600">Rs. {installment.remainingBalance.toLocaleString()}</p>
            </div>
            {installment.imei && (
              <div className="p-4 bg-slate-50 rounded-xl">
                <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">IMEI</p>
                <p className="font-bold truncate">{installment.imei}</p>
              </div>
            )}
            {installment.salespersonId && (
              <div className="p-4 bg-indigo-50/30 rounded-xl border border-indigo-100/50">
                <p className="text-[10px] text-indigo-400 uppercase font-bold mb-1">Salesperson</p>
                <p className="font-bold text-indigo-700 truncate">{salespeople.find(s => s.id === installment.salespersonId)?.name || 'Worker'}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 border border-slate-100 rounded-xl space-y-3">
              <h4 className="text-xs font-bold text-gray-400 uppercase">Guarantor 1</h4>
              <div>
                <p className="text-sm font-bold">{customer.guarantor1?.name || 'N/A'}</p>
                <p className="text-xs text-gray-500">{customer.guarantor1?.phone || 'N/A'}</p>
                <p className="text-xs text-gray-500">CNIC: {customer.guarantor1?.cnic || 'N/A'}</p>
              </div>
            </div>
            <div className="p-4 border border-slate-100 rounded-xl space-y-3">
              <h4 className="text-xs font-bold text-gray-400 uppercase">Guarantor 2</h4>
              <div>
                <p className="text-sm font-bold">{customer.guarantor2?.name || 'N/A'}</p>
                <p className="text-xs text-gray-500">{customer.guarantor2?.phone || 'N/A'}</p>
                <p className="text-xs text-gray-500">CNIC: {customer.guarantor2?.cnic || 'N/A'}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold flex items-center gap-2">
                <div className="w-5 h-5 bg-green-100 text-green-700 rounded flex items-center justify-center text-[10px] font-bold">Rs</div>
                Payment History
              </h4>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => generateReceipt()}>
                  <Share2 className="w-4 h-4" />
                  Share Statement
                </Button>
                {installment.status === 'active' && (
                  <Button size="sm" className="gap-2" onClick={() => setIsPaying(true)}>
                    <Plus className="w-4 h-4" />
                    Add Payment
                  </Button>
                )}
              </div>
            </div>

            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 font-bold text-gray-500">Date</th>
                    <th className="px-4 py-3 font-bold text-gray-500">Amount</th>
                    <th className="px-4 py-3 font-bold text-gray-500 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...payments].sort((a, b) => {
                    const timeA = a.createdAt?.seconds || 0;
                    const timeB = b.createdAt?.seconds || 0;
                    return timeB - timeA;
                  }).map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-slate-700 font-medium">
                        {safeFormat(p.paymentDate || p.createdAt, 'MMM dd, yyyy')}
                      </td>
                      <td className="px-4 py-3 font-bold text-slate-900">Rs. {p.amount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button 
                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-2"
                            onClick={() => generateReceipt(p, false)}
                            title="Share PDF Receipt"
                          >
                            <Share2 className="w-4 h-4" />
                            <span className="text-xs hidden sm:inline">Share</span>
                          </button>
                          <button 
                            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-2"
                            onClick={() => generateReceipt(p, true)}
                            title="Download PDF Receipt"
                          >
                            <Download className="w-4 h-4" />
                            <span className="text-xs hidden sm:inline">Download</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-400">No payments recorded yet</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {isPaying && (
          <div className="p-6 bg-gray-50 border-t border-gray-100 animate-in slide-in-from-bottom-4">
            <div className="flex items-end gap-4 max-w-md mx-auto">
              <div className="flex-1 space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">Payment Amount (Rs)</label>
                <Input type="number" value={paymentAmount} onChange={e => setPaymentAmount(Number(e.target.value))} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsPaying(false)}>Cancel</Button>
                <Button onClick={handlePayment} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 min-w-[100px]">
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Saving...
                    </div>
                  ) : success ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3" />
                      Success
                    </div>
                  ) : 'Confirm'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function TrashView({ customers, salespeople, installments, payments }: { 
  customers: Customer[]; 
  salespeople: Salesperson[]; 
  installments: Installment[];
  payments: Payment[];
}) {
  const [loading, setLoading] = useState<string | null>(null);

  // Filter items deleted within the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const validTrashCustomers = customers.filter(c => {
    if (!c.deletedAt) return true;
    const deletedDate = toDate(c.deletedAt);
    return deletedDate >= thirtyDaysAgo;
  });

  const validTrashSalespeople = salespeople.filter(s => {
    if (!s.deletedAt) return true;
    const deletedDate = toDate(s.deletedAt);
    return deletedDate >= thirtyDaysAgo;
  });

  const handleRestoreCustomer = async (customer: Customer) => {
    setLoading(customer.id);
    try {
      await updateDoc(doc(db, "customers", customer.id), {
        isDeleted: false,
        deletedAt: null
      });

      // Restore associated installments
      const customerInstallments = installments.filter(i => i.customerId === customer.id && i.isDeleted);
      for (const inst of customerInstallments) {
        await updateDoc(doc(db, "installments", inst.id), {
          isDeleted: false,
          deletedAt: null
        });

        // Restore associated payments
        const instPayments = payments.filter(p => p.installmentId === inst.id && p.isDeleted);
        for (const pay of instPayments) {
          await updateDoc(doc(db, "payments", pay.id), {
            isDeleted: false,
            deletedAt: null
          });
        }
      }
    } catch (err) {
      console.error("Failed to restore customer:", err);
    } finally {
      setLoading(null);
    }
  };

  const handleRestoreSalesperson = async (salesperson: Salesperson) => {
    setLoading(salesperson.id);
    try {
      await updateDoc(doc(db, "salespeople", salesperson.id), {
        isDeleted: false,
        deletedAt: null
      });
    } catch (err) {
      console.error("Failed to restore salesperson:", err);
    } finally {
      setLoading(null);
    }
  };

  const handlePermanentDelete = async (id: string, collectionName: string) => {
    if (!confirm("Are you sure? This action cannot be undone.")) return;
    setLoading(id);
    try {
      await deleteDoc(doc(db, collectionName, id));
    } catch (err) {
      console.error(`Failed to permanently delete from ${collectionName}:`, err);
    } finally {
      setLoading(null);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
        <div>
          <h4 className="font-bold text-amber-900 text-sm">Recycle Bin</h4>
          <p className="text-amber-700 text-xs mt-1">
            Items in the trash will be automatically removed after 30 days. You can restore them anytime before then.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <section>
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            Deleted Customers ({validTrashCustomers.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {validTrashCustomers.map(customer => (
              <Card key={customer.id} className="p-4 bg-white border-slate-100">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-bold text-slate-900">{customer.name}</h4>
                    <p className="text-xs text-slate-500">Deleted: {safeFormat(customer.deletedAt, 'PPP')}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50"
                      onClick={() => handleRestoreCustomer(customer)}
                      disabled={!!loading}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                      onClick={() => handlePermanentDelete(customer.id, "customers")}
                      disabled={!!loading}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
            {validTrashCustomers.length === 0 && (
              <div className="col-span-full py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-slate-400 text-sm">No deleted customers found.</p>
              </div>
            )}
          </div>
        </section>

        <section>
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            Deleted Salespeople ({validTrashSalespeople.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {validTrashSalespeople.map(person => (
              <Card key={person.id} className="p-4 bg-white border-slate-100">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-bold text-slate-900">{person.name}</h4>
                    <p className="text-xs text-slate-500">Deleted: {safeFormat(person.deletedAt, 'PPP')}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50"
                      onClick={() => handleRestoreSalesperson(person)}
                      disabled={!!loading}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                      onClick={() => handlePermanentDelete(person.id, "salespeople")}
                      disabled={!!loading}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
            {validTrashSalespeople.length === 0 && (
              <div className="col-span-full py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-slate-400 text-sm">No deleted salespeople found.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </motion.div>
  );
}
