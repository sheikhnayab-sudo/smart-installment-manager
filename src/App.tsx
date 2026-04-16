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
import { translations, Language } from "./translations";

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

const fileToBase64 = async (file: File, maxWidth: number = 400, quality: number = 0.4): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Use a small delay to prevent UI freezing on mobile
    setTimeout(() => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      
      img.src = objectUrl;
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = (maxWidth / width) * height;
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'medium';
          ctx.drawImage(img, 0, 0, width, height);
        }

        const base64 = canvas.toDataURL('image/jpeg', quality);
        resolve(base64);
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      };
    }, 100);
  });
};

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number = 180000): Promise<T> => {
  let timeoutId: any;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Operation timed out. Please check your internet connection and try again.")), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
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
  photoUrl?: string;
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
  photoUrl?: string;
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
  ownerPhotoUrl?: string;
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

function handleFirestoreError(error: any, operationType: OperationType, path: string | null) {
  // 1. Get a safe string representation of the error without triggering circular toString()
  let errorMessage = "Unknown error";
  
  if (error) {
    if (typeof error === 'string') {
      errorMessage = error;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'object') {
      // Safely extract message or code if they exist
      if (error.message) errorMessage = String(error.message);
      else if (error.code) errorMessage = `Error code: ${error.code}`;
      else errorMessage = "Complex error object";
    } else {
      errorMessage = String(error);
    }
  }

  console.error(`Firestore Error [${operationType}] at ${path}:`, errorMessage);
  
  // 2. Construct a safe, flat object for serialization
  const errInfo = {
    error: String(errorMessage).substring(0, 1000),
    operationType: String(operationType),
    path: path ? String(path) : null,
    userId: auth.currentUser?.uid || null
  };
  
  // 3. Safely stringify
  let stringifiedInfo: string;
  try {
    stringifiedInfo = JSON.stringify(errInfo);
  } catch (e) {
    // Ultimate fallback if JSON.stringify fails
    stringifiedInfo = `{"error": "Serialization failed", "operationType": "${operationType}", "path": "${path}"}`;
  }
  
  throw new Error(stringifiedInfo);
}

// --- Components ---

function DeleteConfirmModal({ title, message, onConfirm, onCancel, t }: { title: string; message: string; onConfirm: () => void; onCancel: () => void; t: any }) {
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
            {t.cancel}
          </Button>
          <Button 
            className="flex-1 bg-rose-600 hover:bg-rose-700 text-white" 
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? t.deleting : t.delete}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function ProfileSetup({ user, onComplete, onLogout, t }: { user: FirebaseUser; onComplete: () => void; onLogout: () => void; t: any }) {
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
    if (!navigator.onLine) return setError("No internet connection. Please check your network.");
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
      }));
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
          <h2 className="text-2xl font-bold text-gray-900">{t.setupBusiness}</h2>
          <p className="text-gray-600">{t.setupBusinessDesc}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 text-sm rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">{t.businessName}</label>
            <Input 
              required 
              placeholder={t.businessNamePlaceholder} 
              value={formData.businessName}
              onChange={e => setFormData({...formData, businessName: e.target.value})}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">{t.ownerName}</label>
            <Input 
              required 
              placeholder={t.fullNamePlaceholder} 
              value={formData.ownerName}
              onChange={e => setFormData({...formData, ownerName: e.target.value})}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">{t.contactPhone}</label>
              <Input 
                required 
                placeholder={t.phonePlaceholder} 
                value={formData.phone}
                onChange={e => {
                  let val = e.target.value;
                  if (!val.startsWith('+92')) val = '+92' + val.replace(/^\+?92?/, '');
                  setFormData({...formData, phone: val});
                }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">{t.taglineOptional}</label>
              <Input 
                placeholder={t.taglinePlaceholder} 
                value={formData.tagline}
                onChange={e => setFormData({...formData, tagline: e.target.value})}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">{t.businessAddress}</label>
            <Input 
              required 
              placeholder={t.addressPlaceholder} 
              value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
            />
          </div>
          
          <Button type="submit" className="w-full py-6 text-lg" disabled={loading}>
            {loading ? t.saving : t.completeSetup}
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

const Login = ({ onLogin, error, t, lang, setLang }: { onLogin: () => void; error: string | null; t: any; lang: Language; setLang: (l: Language) => void }) => {
  const [loading, setLoading] = useState(false);

  return (
    <div className="h-full flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="absolute top-4 right-4 flex gap-2">
        <select 
          value={lang} 
          onChange={(e) => setLang(e.target.value as Language)}
          className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="en">English</option>
          <option value="ur">اردو</option>
          <option value="ar">العربية</option>
          <option value="fa">فارسی</option>
          <option value="hi">हिन्दी</option>
          <option value="ps">پښتو</option>
        </select>
      </div>

      <Card className="max-w-md w-full p-8 text-center">
        <div className="mb-6 flex justify-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <CreditCard className="w-8 h-8 text-indigo-600" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.appName}</h1>
        <p className="text-gray-600 mb-8">{t.loginDesc}</p>
        
        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-xl text-sm flex items-center gap-3 text-left">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <Button 
            onClick={async (e) => { 
              e.preventDefault(); 
              setLoading(true);
              try {
                await onLogin();
              } finally {
                setLoading(false);
              }
            }} 
            disabled={loading}
            variant="outline" 
            className="w-full py-6 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="" />
            )}
            {t.loginWithGoogle}
          </Button>
        </div>
        
        <p className="mt-6 text-xs text-gray-400">
          {t.termsPrivacy}
        </p>
      </Card>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('app_lang');
    return (saved as Language) || 'en';
  });
  const t = translations[lang];

  useEffect(() => {
    localStorage.setItem('app_lang', lang);
    // Handle RTL
    if (['ur', 'ar', 'fa', 'ps'].includes(lang)) {
      document.documentElement.dir = 'rtl';
    } else {
      document.documentElement.dir = 'ltr';
    }
  }, [lang]);

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
              const docSnap = await withTimeout(getDoc(profileDoc));
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
      <Login 
        onLogin={handleLogin} 
        error={loginError} 
        t={t} 
        lang={lang} 
        setLang={setLang} 
      />
    );
  }

  if (!businessProfile) {
    return (
      <div className="h-full overflow-y-auto">
        <ProfileSetup 
          user={user} 
          onComplete={() => setProfileLoading(true)} 
          onLogout={handleLogout}
          t={t}
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
          {t.workingOffline}
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
            label={t.dashboard}
          />
          <NavButton 
            active={activeTab === "customers"} 
            onClick={() => setActiveTab("customers")}
            icon={<Users className="w-5 h-5" />}
            label={t.customers}
          />
          <NavButton 
            active={activeTab === "installments"} 
            onClick={() => setActiveTab("installments")}
            icon={<FileText className="w-5 h-5" />}
            label={t.installments}
          />
          <NavButton 
            active={activeTab === "reminders"} 
            onClick={() => setActiveTab("reminders")}
            icon={<Bell className="w-5 h-5" />}
            label={t.reminders}
            badge={reminderCount}
          />
          <NavButton 
            active={activeTab === "salespeople"} 
            onClick={() => setActiveTab("salespeople")}
            icon={<Users className="w-5 h-5" />}
            label={t.salespeople}
          />
          <NavButton 
            active={activeTab === "trash"} 
            onClick={() => setActiveTab("trash")}
            icon={<Trash2 className="w-5 h-5" />}
            label={t.trash}
            badge={trashCustomers.length + trashSalespeople.length}
          />
          <NavButton 
            active={activeTab === "settings"} 
            onClick={() => setActiveTab("settings")}
            icon={<Settings className="w-5 h-5" />}
            label={t.settings}
          />

          <div className="mt-auto hidden md:block">
            <div className="flex items-center gap-3 p-2 mb-4">
              <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || user.phoneNumber || 'User'}`} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.displayName || user.phoneNumber}</p>
                <p className="text-xs text-gray-500 truncate">{user.email || 'Phone Login'}</p>
              </div>
            </div>
            <Button variant="ghost" onClick={handleLogout} className="w-full justify-start gap-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50">
              <LogOut className="w-4 h-4" />
              {t.logout}
            </Button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto order-1 md:order-2 relative">
        <header className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 md:px-8 py-4 md:py-4 pt-[calc(1rem+env(safe-area-inset-top))] flex items-center justify-between z-40">
          <h2 className="text-xl font-bold capitalize">{t[activeTab as keyof typeof t] || activeTab}</h2>
          <div className="flex items-center gap-4">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input 
                placeholder={t.search} 
                className="pl-9 w-64" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <select 
                value={lang} 
                onChange={(e) => setLang(e.target.value as Language)}
                className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="en">EN</option>
                <option value="ur">اردو</option>
                <option value="ar">عربي</option>
                <option value="fa">فارسی</option>
                <option value="hi">हिन्दी</option>
                <option value="ps">پښتو</option>
              </select>
              <div className="md:hidden flex items-center gap-2">
                <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || user.phoneNumber || 'User'}`} alt="" className="w-8 h-8 rounded-full" referrerPolicy="no-referrer" />
                <Button variant="danger" size="sm" onClick={handleLogout} className="px-3 py-1 text-xs flex items-center gap-1">
                  <LogOut className="w-3 h-3" />
                  {t.logout}
                </Button>
              </div>
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
                onLogout={handleLogout}
                t={t}
              />
            )}
            {activeTab === "customers" && (
              <CustomersView 
                customers={activeCustomers} 
                salespeople={activeSalespeople}
                installments={installments}
                payments={payments}
                searchQuery={searchQuery}
                t={t}
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
                t={t}
              />
            )}
            {activeTab === "reminders" && (
              <RemindersView 
                installments={activeInstallments} 
                customers={activeCustomers}
                businessProfile={businessProfile}
                t={t}
              />
            )}
            {activeTab === "salespeople" && (
              <SalespeopleView 
                salespeople={activeSalespeople}
                installments={activeInstallments}
                customers={activeCustomers}
                t={t}
              />
            )}
            {activeTab === "trash" && (
              <TrashView 
                customers={trashCustomers}
                salespeople={trashSalespeople}
                installments={installments}
                payments={payments}
                t={t}
              />
            )}
            {activeTab === "settings" && (
              <SettingsView 
                profile={businessProfile}
                user={user}
                t={t}
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
              t={t}
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
              t={t}
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

const DashboardView = React.memo(({ customers, installments, payments, salespeople, onAddCustomer, onAddInstallment, businessProfile, onNavigate, onLogout, t }: { 
  customers: Customer[]; 
  installments: Installment[]; 
  payments: Payment[];
  salespeople: Salesperson[];
  onAddCustomer: () => void;
  onAddInstallment: () => void;
  businessProfile: BusinessProfile | null;
  onNavigate: (tab: any) => void;
  onLogout: () => void;
  t: any;
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
          <h2 className="text-2xl font-bold text-slate-900">{businessProfile?.businessName || t.businessOverview}</h2>
          <p className="text-slate-500">{t.welcomeBack}, {businessProfile?.ownerName || t.welcomeDesc}.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onAddCustomer} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
            <Plus className="w-4 h-4" />
            {t.addCustomer}
          </Button>
          <Button onClick={onAddInstallment} variant="outline" className="gap-2 border-indigo-200 text-indigo-600 hover:bg-indigo-50">
            <CreditCard className="w-4 h-4" />
            {t.newPlan}
          </Button>
          <Button onClick={onLogout} variant="ghost" className="md:hidden text-rose-600 hover:bg-rose-50">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard 
          label={t.totalCustomers} 
          value={stats.totalCustomers} 
          icon={<Users className="text-indigo-600" />} 
          color="indigo" 
          onClick={() => onNavigate('customers')}
        />
        <StatCard 
          label={t.totalSalesValue} 
          value={`Rs. ${stats.totalSalesValue.toLocaleString()}`} 
          icon={<Store className="text-slate-600" />} 
          color="slate" 
          onClick={() => onNavigate('installments')}
        />
        <StatCard 
          label={t.totalOutstanding} 
          value={`Rs. ${stats.totalOutstanding.toLocaleString()}`} 
          icon={<AlertCircle className="text-amber-600" />} 
          color="amber" 
          onClick={() => onNavigate('installments')}
        />
        <StatCard 
          label={t.totalReceived} 
          value={`Rs. ${stats.totalReceived.toLocaleString()}`} 
          icon={<CheckCircle2 className="text-emerald-600" />} 
          color="emerald" 
          onClick={() => onNavigate('installments')}
        />
        <StatCard 
          label={t.monthlyEarnings} 
          value={`Rs. ${stats.monthlyEarnings.toLocaleString()}`} 
          icon={<TrendingUp className="text-violet-600" />} 
          color="violet" 
          onClick={() => onNavigate('installments')}
        />
        <StatCard 
          label={t.dueReminders} 
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
            {t.upcomingPayments}
          </h3>
          <div className="space-y-4">
            {installments.filter(i => i.status === 'active').slice(0, 5).map(inst => {
              const customer = customers.find(c => c.id === inst.customerId);
              const salesperson = salespeople.find(s => s.id === inst.salespersonId);
              if (!customer) return null;
              return (
                <div key={inst.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <div>
                    <p className="font-semibold text-sm text-slate-900">{customer.name}</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs text-slate-500">{inst.productName}</p>
                      <span className="text-[9px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded font-bold uppercase tracking-tighter">
                        {t.by} {salesperson?.name || t.owner}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm text-indigo-600">Rs. {inst.monthlyInstallment.toLocaleString()}</p>
                    <p className="text-[10px] text-slate-400">{t.due}: {safeFormat(inst.nextDueDate, 'MMM dd')}</p>
                  </div>
                </div>
              );
            })}
            {installments.filter(i => i.status === 'active').length === 0 && <p className="text-sm text-slate-400 text-center py-4">{t.noActiveInstallments}</p>}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-bold mb-4 flex items-center gap-2 text-slate-800">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            {t.recentActivity}
          </h3>
          <div className="space-y-4">
            {payments.slice(0, 5).map(pay => {
              const inst = installments.find(i => i.id === pay.installmentId);
              const customer = customers.find(c => c.id === inst?.customerId);
              const salesperson = salespeople.find(s => s.id === inst?.salespersonId);
              if (!customer || !inst) return null;
              return (
                <div key={pay.id} className="flex items-center gap-3 p-3 border-b border-slate-50 last:border-0">
                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <div className="text-[10px] font-bold text-emerald-600">Rs</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{customer.name}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-slate-500">{t.paymentFor} {inst.productName}</p>
                      <span className="text-[8px] px-1 bg-slate-100 text-slate-500 rounded font-bold uppercase">
                        {t.by} {salesperson?.name || t.owner}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-emerald-600">+Rs. {pay.amount.toLocaleString()}</p>
                </div>
              );
            })}
            {payments.length === 0 && <p className="text-sm text-slate-400 text-center py-4">{t.noRecentPayments}</p>}
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

const SettingsView = React.memo(({ profile, user, t }: { profile: BusinessProfile | null; user: FirebaseUser; t: any }) => {
  const [formData, setFormData] = useState<BusinessProfile>(profile || {
    businessName: "",
    ownerName: user.displayName || "",
    phone: "+92",
    address: "",
    tagline: "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(profile?.logoUrl || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!photo) return;
    const objectUrl = URL.createObjectURL(photo);
    setPhotoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!navigator.onLine) {
      setError("No internet connection. Please check your network.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let logoUrl = profile?.logoUrl || "";
      if (photo) {
        logoUrl = await fileToBase64(photo);
      }

      // Optimistic update
      setDoc(doc(db, "profiles", user.uid), {
        ...formData,
        logoUrl,
        updatedAt: serverTimestamp(),
      }).catch(err => {
        console.error("Background profile update failed", err);
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      console.error("Profile update failed", err);
      setError(err.message || "Failed to update profile. Please try again.");
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
            <h3 className="text-xl font-bold">{t.businessSettings}</h3>
            <p className="text-sm text-gray-500">{t.businessSettingsDesc}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <div className="p-3 bg-rose-50 text-rose-600 text-sm rounded-lg">{error}</div>}
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 rounded-2xl overflow-hidden border-2 border-dashed border-gray-200 flex items-center justify-center relative hover:border-indigo-400 transition-colors cursor-pointer">
              <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setPhoto(e.target.files?.[0] || null)} />
              {photoPreview ? (
                <img src={photoPreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-8 h-8 text-gray-400" />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">{t.businessName}</label>
              <Input 
                required 
                value={formData.businessName}
                onChange={e => setFormData({...formData, businessName: e.target.value})}
                placeholder={t.businessNamePlaceholder}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">{t.ownerName}</label>
              <Input 
                required 
                value={formData.ownerName}
                onChange={e => setFormData({...formData, ownerName: e.target.value})}
                placeholder={t.fullNamePlaceholder}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">{t.phone}</label>
              <Input 
                required 
                value={formData.phone}
                onChange={e => {
                  let val = e.target.value;
                  if (!val.startsWith('+92')) val = '+92' + val.replace(/^\+?92?/, '');
                  setFormData({...formData, phone: val});
                }}
                placeholder={t.phonePlaceholder}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">{t.tagline}</label>
              <Input 
                value={formData.tagline}
                onChange={e => setFormData({...formData, tagline: e.target.value})}
                placeholder={t.taglinePlaceholder}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">{t.address}</label>
            <Input 
              required 
              value={formData.address}
              onChange={e => setFormData({...formData, address: e.target.value})}
              placeholder={t.addressPlaceholder}
            />
          </div>

          <div className="pt-4 flex items-center gap-4">
            <Button type="submit" disabled={loading} className="px-8">
              {loading ? t.saving : t.saveChanges}
            </Button>
            {saved && (
              <motion.p 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-emerald-600 text-sm font-medium flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {t.settingsSaved}
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
          <h4 className="font-bold text-indigo-900 text-sm">{t.proTip}</h4>
          <p className="text-indigo-700 text-sm mt-1">
            {t.proTipDesc}
          </p>
        </div>
      </div>
    </motion.div>
  );
});

const CustomersView = React.memo(({ customers, salespeople, installments, payments, searchQuery, t }: { 
  customers: Customer[]; 
  salespeople: Salesperson[]; 
  installments: Installment[];
  payments: Payment[];
  searchQuery: string;
  t: any;
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
        <p className="text-sm text-slate-500 font-medium">{filteredCustomers.length} {t.customersFound}</p>
        <Button onClick={() => setIsAdding(true)} className="bg-indigo-600 hover:bg-indigo-700 gap-2 shadow-sm">
          <Plus className="w-4 h-4" />
          {t.addCustomer}
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
                  title={t.deleteCustomer}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 transition-all group-hover:translate-x-1" />
              </div>
            </div>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-indigo-50 border border-indigo-100 flex-shrink-0">
                {customer.photoUrl ? (
                  <img src={customer.photoUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-indigo-600 font-bold text-lg">
                    {customer.name.charAt(0)}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-slate-900 text-lg truncate">{customer.name}</h4>
                <p className="text-sm text-slate-500 truncate">{customer.phone}</p>
              </div>
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
            t={t}
          />
        )}
        {customerToDelete && (
          <DeleteConfirmModal 
            title={t.deleteCustomer}
            message={`${t.deleteCustomerConfirm} ${customerToDelete.name}?`}
            onConfirm={confirmDelete}
            onCancel={() => setCustomerToDelete(null)}
            t={t}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
});

const CustomerModal = React.memo(({ customer, salespeople, onClose, onSuccess, t }: { customer: Customer | null; salespeople: Salesperson[]; onClose: () => void; onSuccess?: (customerId: string) => void; t: any }) => {
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
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (customer?.cnicPhotoUrl) setPhotoPreview(customer.cnicPhotoUrl);
    if (customer?.photoUrl) setProfilePhotoPreview(customer.photoUrl);
  }, [customer]);

  useEffect(() => {
    if (!photo) return;
    const objectUrl = URL.createObjectURL(photo);
    setPhotoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);

  useEffect(() => {
    if (!profilePhoto) return;
    const objectUrl = URL.createObjectURL(profilePhoto);
    setProfilePhotoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [profilePhoto]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return setError("User not authenticated.");
    if (!navigator.onLine) return setError("No internet connection. Please check your network.");
    
    setLoading(true);
    setError(null);
    setSuccess(false);
    setStatusMessage(t.saving || "Saving...");
    
    try {
      let cnicPhotoUrl = customer?.cnicPhotoUrl || "";
      let photoUrl = customer?.photoUrl || "";
      
      if (photo) {
        setStatusMessage("Processing CNIC...");
        cnicPhotoUrl = await fileToBase64(photo);
        // Small delay to let UI update
        await new Promise(r => setTimeout(r, 200));
      }
      
      if (profilePhoto) {
        setStatusMessage("Processing Profile Photo...");
        photoUrl = await fileToBase64(profilePhoto);
        // Small delay to let UI update
        await new Promise(r => setTimeout(r, 200));
      }

      setStatusMessage("Saving data...");
      const data = {
        ...formData,
        cnicPhotoUrl,
        photoUrl,
        userId: auth.currentUser.uid,
        updatedAt: serverTimestamp(),
      };

      if (customer) {
        // Optimistic update
        updateDoc(doc(db, "customers", customer.id), data).catch(err => {
          console.error("Background customer update failed", err);
        });
      } else {
        // Optimistic add with pre-generated ID
        const newDocRef = doc(collection(db, "customers"));
        const newId = newDocRef.id;
        
        setDoc(newDocRef, {
          ...data,
          createdAt: serverTimestamp(),
        }).catch(err => {
          console.error("Background customer add failed", err);
        });
        
        if (onSuccess) onSuccess(newId);
      }
      
      setStatusMessage(null);
      setSuccess(true);
      setLoading(false);
      setTimeout(() => onClose(), 1000);
    } catch (err: any) {
      console.error("Error saving customer:", err);
      setError(err.message || "Failed to save customer.");
      setStatusMessage(null);
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
          <h3 className="text-xl font-bold">{customer ? t.editCustomer : t.addNewCustomer}</h3>
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
              {t.customerSaved}
            </div>
          )}

          {statusMessage && !error && !success && (
            <div className="p-3 bg-indigo-50 border border-indigo-100 text-indigo-600 text-sm rounded-lg flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                {statusMessage}
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">{t.salesperson}</label>
            <select 
              className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={formData.salespersonId}
              onChange={e => setFormData({...formData, salespersonId: e.target.value})}
            >
              <option value="">{t.directSale}</option>
              {salespeople.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">{t.profilePhoto}</label>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-dashed border-gray-200 flex items-center justify-center relative hover:border-indigo-400 transition-colors cursor-pointer">
                  <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setProfilePhoto(e.target.files?.[0] || null)} />
                  {profilePhotoPreview ? (
                    <img src={profilePhotoPreview} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-6 h-6 text-gray-400" />
                  )}
                </div>
                <div className="text-xs text-gray-500">{t.optional}</div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">{t.fullName}</label>
              <Input 
                required 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                placeholder={t.fullNamePlaceholder} 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">{t.phone}</label>
              <Input 
                required 
                value={formData.phone} 
                onChange={e => {
                  let val = e.target.value;
                  if (!val.startsWith('+92')) val = '+92' + val.replace(/^\+?92?/, '');
                  setFormData({...formData, phone: val});
                }} 
                placeholder={t.phonePlaceholder} 
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-500 uppercase">{t.cnic}</label>
              <Input required value={formData.cnic} onChange={e => setFormData({...formData, cnic: e.target.value})} placeholder={t.cnicPlaceholder} />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">{t.address}</label>
            <Input required value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder={t.addressPlaceholder} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-indigo-600 uppercase">{t.guarantor1}</h4>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">{t.name}</label>
                <Input required value={formData.guarantor1.name} onChange={e => setFormData({...formData, guarantor1: {...formData.guarantor1, name: e.target.value}})} placeholder={t.guarantorNamePlaceholder} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">{t.phone}</label>
                <Input 
                  required 
                  value={formData.guarantor1.phone} 
                  onChange={e => {
                    let val = e.target.value;
                    if (!val.startsWith('+92')) val = '+92' + val.replace(/^\+?92?/, '');
                    setFormData({...formData, guarantor1: {...formData.guarantor1, phone: val}});
                  }} 
                  placeholder={t.phonePlaceholder} 
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">{t.cnic}</label>
                <Input required value={formData.guarantor1.cnic} onChange={e => setFormData({...formData, guarantor1: {...formData.guarantor1, cnic: e.target.value}})} placeholder={t.cnicPlaceholder} />
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold text-indigo-600 uppercase">{t.guarantor2}</h4>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">{t.name}</label>
                <Input required value={formData.guarantor2.name} onChange={e => setFormData({...formData, guarantor2: {...formData.guarantor2, name: e.target.value}})} placeholder={t.guarantorNamePlaceholder} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">{t.phone}</label>
                <Input 
                  required 
                  value={formData.guarantor2.phone} 
                  onChange={e => {
                    let val = e.target.value;
                    if (!val.startsWith('+92')) val = '+92' + val.replace(/^\+?92?/, '');
                    setFormData({...formData, guarantor2: {...formData.guarantor2, phone: val}});
                  }} 
                  placeholder={t.phonePlaceholder} 
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">{t.cnic}</label>
                <Input required value={formData.guarantor2.cnic} onChange={e => setFormData({...formData, guarantor2: {...formData.guarantor2, cnic: e.target.value}})} placeholder={t.cnicPlaceholder} />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">{t.cnicPhoto}</label>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-4">
                <div className="flex-1 border-2 border-dashed border-slate-200 rounded-lg p-4 text-center hover:border-indigo-400 transition-colors cursor-pointer relative">
                  <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setPhoto(e.target.files?.[0] || null)} />
                  <Camera className="w-6 h-6 text-gray-400 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">{photo ? photo.name : t.clickToUpload}</p>
                </div>
                {photoPreview && (
                  <div className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                    <img src={photoPreview} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="pt-4 flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>{t.cancel}</Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? t.saving : t.saveCustomer}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
});

const InstallmentsView = React.memo(({ installments, customers, salespeople, payments, searchQuery, businessProfile, t }: { installments: Installment[]; customers: Customer[]; salespeople: Salesperson[]; payments: Payment[]; searchQuery: string; businessProfile: BusinessProfile | null; t: any }) => {
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
        <p className="text-sm text-gray-500">{filteredInstallments.length} {t.installmentsFound}</p>
        <Button onClick={() => setIsAdding(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          {t.newInstallment}
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
                      <p className="text-sm text-gray-500">{customer?.name || t.unknownCustomer}</p>
                      {inst.salespersonId && (
                        <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-md font-medium">
                          {t.soldBy}: {salespeople.find(s => s.id === inst.salespersonId)?.name || t.worker}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-gray-400 uppercase font-bold">{t.remaining}</p>
                    <p className="font-bold text-indigo-600">Rs. {inst.remainingBalance.toLocaleString()}</p>
                  </div>
                  <div className="w-32 hidden sm:block">
                    <div className="flex justify-between text-[10px] mb-1">
                      <span>{t.progress}</span>
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
                      title={t.deleteInstallment}
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
            t={t}
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
            t={t}
          />
        )}
        {installmentToDelete && (
          <DeleteConfirmModal 
            title={t.deleteInstallment}
            message={`${t.deleteInstallmentConfirm} ${installmentToDelete.productName}?`}
            onConfirm={confirmDelete}
            onCancel={() => setInstallmentToDelete(null)}
            t={t}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
});

const RemindersView = React.memo(({ installments, customers, businessProfile, t }: { installments: Installment[]; customers: Customer[]; businessProfile: BusinessProfile | null; t: any }) => {
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
  
${t.reminderGreeting} *${businessProfile?.businessName || t.ourShop}* ${t.reminderRegarding} *${item.productName}*.

*${t.nextDue}:* ${safeFormat(item.dueDate, 'PPP')}
*${t.amountDue}:* Rs. ${Math.round(item.monthlyInstallment).toLocaleString()}
${item.daysRemaining < 0 ? `*${t.status}:* ${t.overdueBy} ${Math.abs(item.daysRemaining)} ${t.days}` : item.daysRemaining === 0 ? `*${t.status}:* ${t.dueToday}` : `*${t.status}:* ${t.dueIn} ${item.daysRemaining} ${t.days}`}

${t.reminderClosing}
*${businessProfile?.ownerName || businessProfile?.businessName || t.owner}*`;

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
          <h2 className="text-xl font-bold">{t.paymentReminders}</h2>
          <p className="text-sm text-gray-500">{t.paymentRemindersDesc}</p>
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
                    {item.daysRemaining === 0 ? t.dueToday : 
                     item.daysRemaining < 0 ? `${t.overdueBy} ${Math.abs(item.daysRemaining)} ${t.days}` : 
                     `${t.dueIn} ${item.daysRemaining} ${t.days}`}
                  </p>
                  <p className="text-xs text-gray-400">{t.nextDue}: {safeFormat(item.dueDate, 'MMM dd, yyyy')}</p>
                </div>
                
                <Button 
                  onClick={() => handleSendReminder(item)}
                  className="bg-emerald-600 hover:bg-emerald-700 gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  {t.sendWhatsApp}
                </Button>
              </div>
            </div>
          </Card>
        ))}
        
        {dueInstallments.length === 0 && (
          <div className="text-center py-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-200">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-gray-900">{t.allCaughtUp}</h3>
            <p className="text-gray-500">{t.noInstallmentsDue}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
});

function SalespeopleView({ salespeople, installments, customers, t }: { salespeople: Salesperson[]; installments: Installment[]; customers: Customer[]; t: any }) {
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
            <h2 className="text-xl font-bold">{t.salespeopleManagement}</h2>
            <p className="text-sm text-gray-500">{t.salespeopleManagementDesc}</p>
          </div>
        </div>
        <Button onClick={() => setIsAdding(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
          <Plus className="w-4 h-4" />
          {t.addSalesperson}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Self Stats */}
        <Card 
          className="p-6 border-l-4 border-l-slate-400 bg-slate-50/30 cursor-pointer hover:shadow-md transition-all"
          onClick={() => setViewingClients({ id: "self", name: t.directSales, phone: "", userId: "", createdAt: null })}
        >
          <div className="flex items-start justify-between mb-4">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-100">
              <Store className="w-6 h-6 text-slate-600" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.ownerSelf}</span>
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-1">{t.directSales}</h3>
          <p className="text-sm text-slate-500 mb-6">{t.directSalesDesc}</p>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-white rounded-xl border border-slate-100">
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">{t.totalSold}</p>
              <p className="text-sm font-bold">Rs. {installments.filter(i => !i.salespersonId).reduce((s, i) => s + i.totalPrice, 0).toLocaleString()}</p>
            </div>
            <div className="p-3 bg-white rounded-xl border border-slate-100">
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">{t.activePlans}</p>
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
                <div className="w-12 h-12 rounded-full overflow-hidden bg-indigo-50 border border-indigo-100 flex-shrink-0">
                  {person.photoUrl ? (
                    <img src={person.photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-indigo-600 font-bold text-lg">
                      {person.name.charAt(0)}
                    </div>
                  )}
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
                  <p className="text-[10px] text-indigo-400 font-bold uppercase mb-1">{t.totalSold}</p>
                  <p className="text-sm font-bold text-indigo-700">Rs. {stats.totalSales.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">{t.activePlans}</p>
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
          t={t}
        />
      )}

      {viewingClients && (
        <SalespersonClientsModal 
          salesperson={viewingClients}
          customers={customers}
          installments={installments}
          onClose={() => setViewingClients(null)}
          t={t}
        />
      )}
    </motion.div>
  );
}

function SalespersonClientsModal({ salesperson, customers, installments, onClose, t }: { 
  salesperson: Salesperson; 
  customers: Customer[]; 
  installments: Installment[];
  onClose: () => void;
  t: any;
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
              <h3 className="text-xl font-bold">{salesperson.name} {t.clients}</h3>
              <p className="text-sm text-gray-500">{workerClients.length} {t.customersAssigned}</p>
            </div>
          </div>
          <Button variant="ghost" onClick={onClose} className="text-2xl">&times;</Button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {workerClients.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
              <Users className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400 font-medium">{t.noClientsFound}</p>
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
                        {activePlans} {t.activePlans}
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

function SalespersonModal({ salesperson, onClose, t }: { salesperson: Salesperson | null; onClose: () => void; t: any }) {
  const [name, setName] = useState(salesperson?.name || "");
  const [phone, setPhone] = useState(salesperson?.phone || "+92");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (salesperson?.photoUrl) setPhotoPreview(salesperson.photoUrl);
  }, [salesperson]);

  useEffect(() => {
    if (!photo) return;
    const objectUrl = URL.createObjectURL(photo);
    setPhotoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    if (!navigator.onLine) return setError("No internet connection. Please check your network.");
    
    setLoading(true);
    setError(null);
    setSuccess(false);
    setStatusMessage(t.saving || "Saving...");

    try {
      let photoUrl = salesperson?.photoUrl || "";
      if (photo) {
        setStatusMessage("Processing photo...");
        photoUrl = await fileToBase64(photo);
        // Small delay to let UI update
        await new Promise(r => setTimeout(r, 200));
      }

      const data = {
        name,
        phone,
        photoUrl,
        userId: auth.currentUser.uid,
        updatedAt: serverTimestamp(),
      };

      setStatusMessage("Saving data...");
      if (salesperson) {
        // Optimistic update
        updateDoc(doc(db, "salespeople", salesperson.id), data).catch(err => {
          console.error("Background salesperson update failed", err);
        });
      } else {
        // Optimistic add
        addDoc(collection(db, "salespeople"), {
          ...data,
          createdAt: serverTimestamp(),
        }).catch(err => {
          console.error("Background salesperson add failed", err);
        });
      }
      
      setStatusMessage(null);
      setSuccess(true);
      setLoading(false);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error("Error saving salesperson", err);
      setError(err.message || "Failed to save salesperson. Please try again.");
      setStatusMessage(null);
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
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xl font-bold">{salesperson ? t.editWorker : t.addNewWorker}</h3>
          <Button variant="ghost" onClick={onClose}>&times;</Button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 bg-rose-50 text-rose-600 text-sm rounded-lg">{error}</div>}
          {success && <div className="p-3 bg-emerald-50 text-emerald-600 text-sm rounded-lg">{t.workerSaved}</div>}
          
          {statusMessage && !error && !success && (
            <div className="p-3 bg-indigo-50 border border-indigo-100 text-indigo-600 text-sm rounded-lg flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                {statusMessage}
              </div>
            </div>
          )}
          
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-dashed border-gray-200 flex items-center justify-center relative hover:border-indigo-400 transition-colors cursor-pointer">
              <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setPhoto(e.target.files?.[0] || null)} />
              {photoPreview ? (
                <img src={photoPreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <Camera className="w-8 h-8 text-gray-400" />
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">{t.fullName}</label>
            <Input required value={name} onChange={e => setName(e.target.value)} placeholder={t.fullNamePlaceholder} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-gray-500 uppercase">{t.phone}</label>
            <Input 
              required 
              value={phone} 
              onChange={e => {
                let val = e.target.value;
                if (!val.startsWith('+92')) val = '+92' + val.replace(/^\+?92?/, '');
                setPhone(val);
              }} 
              placeholder={t.phonePlaceholder} 
            />
          </div>
          <div className="pt-4 flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>{t.cancel}</Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? t.saving : t.saveWorker}
            </Button>
          </div>
          {salesperson && (
            <Button 
              type="button" 
              variant="ghost" 
              onClick={() => setShowDeleteConfirm(true)} 
              className="w-full text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              disabled={loading}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t.deleteWorker}
            </Button>
          )}
        </form>

        <AnimatePresence>
          {showDeleteConfirm && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl"
              >
                <h4 className="text-lg font-bold mb-2">{t.deleteWorker}?</h4>
                <p className="text-slate-600 text-sm mb-6">
                  {t.deleteWorkerConfirm} {salesperson?.name}?
                </p>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setShowDeleteConfirm(false)}>{t.cancel}</Button>
                  <Button variant="danger" className="flex-1" onClick={handleDelete} disabled={loading}>
                    {loading ? t.deleting : t.delete}
                  </Button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

const InstallmentModal = React.memo(({ customers, salespeople, onClose, initialCustomerId, initialSalespersonId, t }: { 
  customers: Customer[]; 
  salespeople: Salesperson[]; 
  onClose: () => void;
  initialCustomerId?: string;
  initialSalespersonId?: string;
  t: any;
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
          <h3 className="text-xl font-bold">{t.newInstallmentPlan}</h3>
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
                <label className="text-xs font-bold text-gray-500 uppercase">{t.selectCustomer}</label>
                <select 
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={formData.customerId}
                  onChange={e => setFormData({...formData, customerId: e.target.value})}
                  required
                >
                  <option value="">{t.chooseCustomer}</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">{t.salespersonWorker}</label>
                <select 
                  className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={formData.salespersonId}
                  onChange={e => setFormData({...formData, salespersonId: e.target.value})}
                >
                  <option value="">{t.directSaleOwner}</option>
                  {salespeople.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">{t.productName}</label>
                <Input 
                  required 
                  value={formData.productName} 
                  onChange={e => setFormData({...formData, productName: e.target.value})} 
                  placeholder={t.productPlaceholder} 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">{t.brand}</label>
                  <Input 
                    required 
                    value={formData.brand} 
                    onChange={e => setFormData({...formData, brand: e.target.value})} 
                    placeholder={t.brandPlaceholder} 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">{t.model}</label>
                  <Input 
                    required 
                    value={formData.model} 
                    onChange={e => setFormData({...formData, model: e.target.value})} 
                    placeholder={t.modelPlaceholder} 
                  />
                </div>
              </div>
              {(formData.productName.toLowerCase().includes('phone') || formData.productName.toLowerCase().includes('mobile') || formData.productName.toLowerCase().includes('smartphone')) && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="space-y-1"
                >
                  <label className="text-xs font-bold text-gray-500 uppercase">{t.imeiNumber}</label>
                  <Input 
                    value={formData.imei} 
                    onChange={e => setFormData({...formData, imei: e.target.value})} 
                    placeholder={t.imeiPlaceholder} 
                    className="border-indigo-200 focus:ring-indigo-500"
                  />
                </motion.div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">{t.totalPriceRs}</label>
                  <Input type="number" required value={formData.totalPrice} onChange={e => setFormData({...formData, totalPrice: Number(e.target.value)})} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">{t.advanceRs}</label>
                  <Input type="number" required value={formData.advancePayment} onChange={e => setFormData({...formData, advancePayment: Number(e.target.value)})} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">{t.durationMonths}</label>
                  <Input type="number" required value={formData.duration} onChange={e => setFormData({...formData, duration: Number(e.target.value)})} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-gray-500 uppercase">{t.profitPercentage}</label>
                  <Input type="number" required value={formData.profitPercentage} onChange={e => setFormData({...formData, profitPercentage: Number(e.target.value)})} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-500 uppercase">{t.formChargesRs}</label>
                <Input 
                  type="number" 
                  value={formData.formCharges || ""} 
                  onChange={e => setFormData({...formData, formCharges: Number(e.target.value)})} 
                  placeholder={t.formChargesPlaceholder}
                />
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 space-y-4">
              <h4 className="font-bold text-sm text-gray-400 uppercase">{t.summary}</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">{t.totalPayable}:</span>
                  <span className="font-bold">Rs. {calculations.totalPayable.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">{t.monthlyInstallment}:</span>
                  <span className="font-bold text-indigo-600">Rs. {Math.round(calculations.monthlyInstallment).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">{t.remainingBalance}:</span>
                  <span className="font-bold">Rs. {calculations.remainingBalance.toLocaleString()}</span>
                </div>
              </div>
              <div className="pt-4 border-t border-gray-200">
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  * {t.installmentCalculationNote}
                </p>
              </div>
            </div>
          </div>
          <div className="pt-8 flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={loading}>{t.cancel}</Button>
            <Button type="submit" className="flex-1 bg-indigo-600 hover:bg-indigo-700" disabled={loading}>
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  {t.saving}
                </div>
              ) : success ? (
                <div className="flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  {t.savedSuccessfully}
                </div>
              ) : (
                t.createPlan
              )}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
});

function InstallmentDetailsModal({ installment, customer, salespeople, payments, onClose, businessProfile, t }: { installment: Installment; customer: Customer; salespeople: Salesperson[]; payments: Payment[]; onClose: () => void; businessProfile: BusinessProfile | null; t: any }) {
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
    const title = isSlip ? t.paymentReceipt : t.accountStatement;
    const businessName = businessProfile?.businessName.toUpperCase() || t.businessNamePlaceholder;
    const tagline = businessProfile?.tagline || t.taglinePlaceholder;
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
    doc.text(`${t.receiptNo}: ${receiptNo}`, 140, 30);
    
    const displayDate = toDate(payment?.paymentDate || payment?.createdAt);
      
    doc.text(`${t.date}: ${format(displayDate, 'PPP')}`, 140, 35);

    // Horizontal Line
    doc.setDrawColor(226, 232, 240); // Slate 200
    doc.setLineWidth(0.5);
    doc.line(20, 45, 190, 45);
    
    // --- Info Section ---
    // Customer Details
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(t.billTo + ":", 20, 55);
    
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(customer.name, 20, 62);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${t.phone}: ${customer.phone}`, 20, 68);
    doc.text(`${t.cnic}: ${customer.cnic}`, 20, 73);
    doc.text(`${t.address}: ${customer.address}`, 20, 78);
    
    // Product Details
    doc.setTextColor(100, 116, 139);
    doc.text(t.productDetails + ":", 120, 55);
    
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`${installment.brand} ${installment.model}`, 120, 62);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${t.product}: ${installment.productName}`, 120, 68);
    if (installment.imei) doc.text(`${t.imei}: ${installment.imei}`, 120, 73);
    doc.text(`${t.planDuration}: ${installment.duration} ${t.months}`, 120, 78);
    
    const salesperson = salespeople.find(s => s.id === installment.salespersonId);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.text(`${t.dealtBy}: ${salesperson ? salesperson.name : t.shopOwner}`, 120, 83);
    
    doc.setFont("helvetica", "normal");
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    // Hide form charges from the total shown to customer if requested
    const displayTotal = installment.totalPayable - (installment.formCharges || 0);
    doc.text(`${t.totalPayable}: Rs. ${displayTotal.toLocaleString()}`, 120, 88);
    
    doc.setFont("helvetica", "bold");
    doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    
    const displayRemaining = installment.remainingBalance - (installment.formCharges || 0);
    doc.text(`${t.remaining}: Rs. ${Math.max(0, displayRemaining).toLocaleString()}`, 120, 93);

    // --- Payment Table ---
    const tablePayments = payment ? [payment] : [...payments].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    const tableData = tablePayments.map((p, index) => [
      payment ? "1" : (index + 1).toString(),
      safeFormat(p.paymentDate, 'MMM dd, yyyy'),
      `Rs. ${p.amount.toLocaleString()}`,
      t.paymentReceived
    ]);

    autoTable(doc, {
      startY: 95,
      head: [[t.srNo, t.transactionDate, t.amount, t.description]],
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
    
    doc.text(t.totalAmountPaid + ":", summaryX, finalY + 15);
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
    doc.text(`Rs. ${(installment.totalPayable - installment.remainingBalance).toLocaleString()}`, 190, finalY + 15, { align: "right" });
    
    doc.setDrawColor(226, 232, 240);
    doc.line(summaryX, finalY + 18, 190, finalY + 18);
    
    doc.setFont("helvetica", "bold");
    doc.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    doc.text(t.remainingBalance + ":", summaryX, finalY + 25);
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
    doc.text(`${t.authorizedSignature}`, 165, footerY + 30, { align: "center" });
    
    // Watermark/System Info
    doc.setFontSize(7);
    doc.setTextColor(203, 213, 225);
    doc.text(`${t.generatedBy} • ${format(new Date(), 'PPP p')}`, 105, 285, { align: "center" });
    
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
              <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">{t.totalPrice}</p>
              <p className="font-bold">Rs. {installment.totalPrice.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">{t.advance}</p>
              <p className="font-bold">Rs. {installment.advancePayment.toLocaleString()}</p>
            </div>
            <div className="p-4 bg-indigo-50 rounded-xl">
              <p className="text-[10px] text-indigo-400 uppercase font-bold mb-1">{t.monthly}</p>
              <p className="font-bold text-indigo-600">Rs. {Math.round(installment.monthlyInstallment).toLocaleString()}</p>
            </div>
            <div className="p-4 bg-orange-50 rounded-xl">
              <p className="text-[10px] text-orange-400 uppercase font-bold mb-1">{t.remaining}</p>
              <p className="font-bold text-orange-600">Rs. {installment.remainingBalance.toLocaleString()}</p>
            </div>
            {installment.imei && (
              <div className="p-4 bg-slate-50 rounded-xl">
                <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">{t.imei}</p>
                <p className="font-bold truncate">{installment.imei}</p>
              </div>
            )}
            {installment.salespersonId && (
              <div className="p-4 bg-indigo-50/30 rounded-xl border border-indigo-100/50">
                <p className="text-[10px] text-indigo-400 uppercase font-bold mb-1">{t.salesperson}</p>
                <p className="font-bold text-indigo-700 truncate">{salespeople.find(s => s.id === installment.salespersonId)?.name || t.worker}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 border border-slate-100 rounded-xl space-y-3">
              <h4 className="text-xs font-bold text-gray-400 uppercase">{t.guarantor1}</h4>
              <div>
                <p className="text-sm font-bold">{customer.guarantor1?.name || t.na}</p>
                <p className="text-xs text-gray-500">{customer.guarantor1?.phone || t.na}</p>
                <p className="text-xs text-gray-500">{t.cnic}: {customer.guarantor1?.cnic || t.na}</p>
              </div>
            </div>
            <div className="p-4 border border-slate-100 rounded-xl space-y-3">
              <h4 className="text-xs font-bold text-gray-400 uppercase">{t.guarantor2}</h4>
              <div>
                <p className="text-sm font-bold">{customer.guarantor2?.name || t.na}</p>
                <p className="text-xs text-gray-500">{customer.guarantor2?.phone || t.na}</p>
                <p className="text-xs text-gray-500">{t.cnic}: {customer.guarantor2?.cnic || t.na}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold flex items-center gap-2">
                <div className="w-5 h-5 bg-green-100 text-green-700 rounded flex items-center justify-center text-[10px] font-bold">Rs</div>
                {t.paymentHistory}
              </h4>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => generateReceipt()}>
                  <Share2 className="w-4 h-4" />
                  {t.shareStatement}
                </Button>
                {installment.status === 'active' && (
                  <Button size="sm" className="gap-2" onClick={() => setIsPaying(true)}>
                    <Plus className="w-4 h-4" />
                    {t.addPayment}
                  </Button>
                )}
              </div>
            </div>

            <div className="border border-gray-100 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 font-bold text-gray-500">{t.date}</th>
                    <th className="px-4 py-3 font-bold text-gray-500">{t.amount}</th>
                    <th className="px-4 py-3 font-bold text-gray-500 text-right">{t.action}</th>
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
                            title={t.sharePdfReceipt}
                          >
                            <Share2 className="w-4 h-4" />
                            <span className="text-xs hidden sm:inline">{t.share}</span>
                          </button>
                          <button 
                            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-2"
                            onClick={() => generateReceipt(p, true)}
                            title={t.downloadPdfReceipt}
                          >
                            <Download className="w-4 h-4" />
                            <span className="text-xs hidden sm:inline">{t.download}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-400">{t.noPaymentsRecorded}</td>
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
                <label className="text-xs font-bold text-gray-500 uppercase">{t.paymentAmountRs}</label>
                <Input type="number" value={paymentAmount} onChange={e => setPaymentAmount(Number(e.target.value))} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setIsPaying(false)}>{t.cancel}</Button>
                <Button onClick={handlePayment} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 min-w-[100px]">
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      {t.saving}
                    </div>
                  ) : success ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3" />
                      {t.success}
                    </div>
                  ) : t.confirm}
                </Button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function TrashView({ customers, salespeople, installments, payments, t }: { 
  customers: Customer[]; 
  salespeople: Salesperson[]; 
  installments: Installment[];
  payments: Payment[];
  t: any;
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
    if (!confirm(t.permanentDeleteConfirm)) return;
    setLoading(id);
    try {
      if (collectionName === "customers") {
        // Delete associated installments and payments first
        const customerInstallments = installments.filter(i => i.customerId === id);
        for (const inst of customerInstallments) {
          const instPayments = payments.filter(p => p.installmentId === inst.id);
          for (const pay of instPayments) {
            await deleteDoc(doc(db, "payments", pay.id));
          }
          await deleteDoc(doc(db, "installments", inst.id));
        }
      }
      
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
          <h4 className="font-bold text-amber-900 text-sm">{t.recycleBin}</h4>
          <p className="text-amber-700 text-xs mt-1">
            {t.recycleBinDesc}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <section>
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            {t.deletedCustomers} ({validTrashCustomers.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {validTrashCustomers.map(customer => (
              <Card key={customer.id} className="p-4 bg-white border-slate-100">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-bold text-slate-900">{customer.name}</h4>
                    <p className="text-xs text-slate-500">{t.deleted}: {safeFormat(customer.deletedAt, 'PPP')}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50"
                      onClick={() => handleRestoreCustomer(customer)}
                      disabled={!!loading}
                      title={t.restore}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                      onClick={() => handlePermanentDelete(customer.id, "customers")}
                      disabled={!!loading}
                      title={t.permanentDelete}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
            {validTrashCustomers.length === 0 && (
              <div className="col-span-full py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-slate-400 text-sm">{t.noDeletedCustomers}</p>
              </div>
            )}
          </div>
        </section>

        <section>
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Store className="w-5 h-5 text-indigo-600" />
            {t.deletedWorkers} ({validTrashSalespeople.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {validTrashSalespeople.map(person => (
              <Card key={person.id} className="p-4 bg-white border-slate-100">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-bold text-slate-900">{person.name}</h4>
                    <p className="text-xs text-slate-500">{t.deleted}: {safeFormat(person.deletedAt, 'PPP')}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50"
                      onClick={() => handleRestoreSalesperson(person)}
                      disabled={!!loading}
                      title={t.restore}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                      onClick={() => handlePermanentDelete(person.id, "salespeople")}
                      disabled={!!loading}
                      title={t.permanentDelete}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
            {validTrashSalespeople.length === 0 && (
              <div className="col-span-full py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-slate-400 text-sm">{t.noDeletedWorkers}</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </motion.div>
  );
}
