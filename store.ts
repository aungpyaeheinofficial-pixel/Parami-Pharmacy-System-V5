import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  CartItem, Product, User, Role, Transaction, Customer, Branch, 
  DistributionOrder, PurchaseOrder, Expense, Payable, Receivable, Supplier, AppSettings,
  ScannedItem, SyncLog, SyncStatus, UNIT_TYPES
} from './types';
import { 
  mockProducts, mockUsers, mockTransactions, mockCustomers, 
  mockDistributionOrders, mockPurchaseOrders, mockExpenses, mockPayables, mockReceivables, mockSuppliers 
} from './data';
import { GS1ParsedData } from './utils/gs1Parser';
import { api } from './utils/apiClient';

// --- Shared Helper for Persistence ---
const getInitialBranchId = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('currentBranchId') || 'b1';
  }
  return 'b1';
};

const initialBranchId = getInitialBranchId();

// --- Branch Management Store ---
interface BranchState {
  branches: Branch[];
  currentBranchId: string;
  setBranch: (id: string) => void;
  getCurrentBranch: () => Branch | undefined;
  addBranch: (branch: Branch) => void;
  updateBranch: (id: string, updates: Partial<Branch>) => void;
  deleteBranch: (id: string) => void;
}

export const useBranchStore = create<BranchState>((set, get) => ({
  branches: [
    { 
      id: 'b1', 
      name: 'ပါရမီ(၁) ထားဝယ်', 
      code: 'parami-1', 
      address: 'No. 45, Arzarni Road, Dawei', 
      phone: '09-420012345',
      managerName: 'U Mg Mg',
      email: 'branch1@parami.com',
      status: 'active' 
    }, 
    { 
      id: 'b2', 
      name: 'ပါရမီ(၂) ရန်ကုန်', 
      code: 'parami-2', 
      address: 'No. 12, Pyay Road, Yangon',
      phone: '09-420098765', 
      managerName: 'Daw Hla',
      email: 'branch2@parami.com',
      status: 'active'
    } 
  ],
  currentBranchId: initialBranchId,
  
  setBranch: (id: string) => {
    localStorage.setItem('currentBranchId', id);
    set({ currentBranchId: id });
    
    // Trigger sync in other stores
    useProductStore.getState().syncWithBranch(id);
    useCustomerStore.getState().syncWithBranch(id);
    useTransactionStore.getState().syncWithBranch(id);
    useCartStore.getState().clearCart(); // Clear cart on branch switch
    useDistributionStore.getState().syncWithBranch(id);
    usePurchaseStore.getState().syncWithBranch(id);
    useFinanceStore.getState().syncWithBranch(id);
    useSupplierStore.getState().syncWithBranch(id);
  },
  
  getCurrentBranch: () => get().branches.find(b => b.id === get().currentBranchId),

  addBranch: (branch) => set((state) => ({ 
    branches: [...state.branches, branch] 
  })),

  updateBranch: (id, updates) => set((state) => ({
    branches: state.branches.map(b => b.id === id ? { ...b, ...updates } : b)
  })),

  deleteBranch: (id) => set((state) => {
    const newBranches = state.branches.filter(b => b.id !== id);

    // Cascade Delete Effect
    setTimeout(() => {
        useProductStore.setState(s => ({
            allProducts: s.allProducts.filter(p => p.branchId !== id),
            products: s.products.filter(p => p.branchId !== id)
        }));
        useCustomerStore.setState(s => ({
            allCustomers: s.allCustomers.filter(c => c.branchId !== id),
            customers: s.customers.filter(c => c.branchId !== id)
        }));
        useTransactionStore.setState(s => ({
            allTransactions: s.allTransactions.filter(t => t.branchId !== id),
            transactions: s.transactions.filter(t => t.branchId !== id)
        }));
        useDistributionStore.setState(s => ({
             allOrders: s.allOrders.filter(o => o.branchId !== id),
             orders: s.orders.filter(o => o.branchId !== id)
        }));
        usePurchaseStore.setState(s => ({
             allPOs: s.allPOs.filter(p => p.branchId !== id),
             purchaseOrders: s.purchaseOrders.filter(p => p.branchId !== id)
        }));
        useFinanceStore.setState(s => ({
             allExpenses: s.allExpenses.filter(e => e.branchId !== id),
             expenses: s.expenses.filter(e => e.branchId !== id),
             allPayables: s.allPayables.filter(p => p.branchId !== id),
             payables: s.payables.filter(p => p.branchId !== id),
             allReceivables: s.allReceivables.filter(r => r.branchId !== id),
             receivables: s.receivables.filter(r => r.branchId !== id),
        }));
        useSupplierStore.setState(s => ({
             allSuppliers: s.allSuppliers.filter(supplier => supplier.branchId !== id),
             suppliers: s.suppliers.filter(supplier => supplier.branchId !== id)
        }));
    }, 0);
    
    if (state.currentBranchId === id) {
       const newId = newBranches.length > 0 ? newBranches[0].id : '';
       localStorage.setItem('currentBranchId', newId);
       
       if (newId) {
         setTimeout(() => {
            useBranchStore.getState().setBranch(newId);
         }, 0);
       }
       return { branches: newBranches, currentBranchId: newId };
    }
    return { branches: newBranches };
  })
}));

// --- Auth Store ---
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password?: string) => Promise<void>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null, 
  isAuthenticated: false,
  login: async (email: string, password?: string) => {
    try {
       if (password) {
          const { token, user } = await api.post('/auth/login', { email, password });
          localStorage.setItem('token', token);
          set({ user, isAuthenticated: true });
       } else {
          // Legacy mock fallback
          const user = mockUsers.find(u => u.email === email) || mockUsers[0];
          set({ user, isAuthenticated: true });
       }
    } catch (e) {
       console.error("Login failed", e);
       throw e;
    }
  },
  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, isAuthenticated: false });
  },
  updateUser: (updates) => set((state) => ({
    user: state.user ? { ...state.user, ...updates } : null
  })),
}));

// --- Cart Store ---
interface AddItemOptions {
  batchId?: string;
  transactionData?: CartItem['transaction_data'];
  warnings?: string[];
  override?: boolean;
}

interface CartState {
  items: CartItem[];
  customer: any | null;
  setCustomer: (customer: any) => void;
  addItem: (product: Product, options?: AddItemOptions) => void;
  removeItem: (cartId: string) => void;
  updateQuantity: (cartId: string, qty: number) => void;
  clearCart: () => void;
  total: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  customer: null,
  setCustomer: (customer) => set({ customer }),
  addItem: (product, options) => {
    const { batchId, transactionData, warnings, override } = options || {};

    const existing = get().items.find(i => {
      const productMatch = i.id === product.id;
      const scannedBatchMatch = transactionData?.scanned_batch 
          ? i.transaction_data?.scanned_batch === transactionData.scanned_batch
          : i.selectedBatchId === batchId;
      const overrideMatch = i.manager_override === override;

      return productMatch && scannedBatchMatch && overrideMatch;
    });

    if (existing) {
      set({
        items: get().items.map(i => 
          i.cartId === existing.cartId ? { ...i, quantity: i.quantity + 1 } : i
        )
      });
    } else {
      set({ 
        items: [...get().items, { 
          ...product, 
          cartId: Math.random().toString(), 
          quantity: 1, 
          discount: 0,
          selectedBatchId: batchId || product.batches[0]?.id,
          transaction_data: transactionData,
          warning_flags: warnings,
          manager_override: override
        }] 
      });
    }
  },
  removeItem: (cartId) => set({ items: get().items.filter(i => i.cartId !== cartId) }),
  updateQuantity: (cartId, qty) => set({
    items: get().items.map(i => i.cartId === cartId ? { ...i, quantity: Math.max(1, qty) } : i)
  }),
  clearCart: () => set({ items: [], customer: null }),
  total: () => get().items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
}));

// --- Global UI Store ---
interface GlobalState {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}

export const useGlobalStore = create<GlobalState>((set) => ({
  isSidebarOpen: true,
  toggleSidebar: () => set(state => ({ isSidebarOpen: !state.isSidebarOpen })),
}));

// --- Inventory / Product Management Store ---
interface ProductState {
  allProducts: Product[]; // Master DB
  products: Product[];    // Filtered View
  syncWithBranch: (branchId: string) => Promise<void>;
  setProducts: (products: Product[]) => void;
  addProduct: (product: Product) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  incrementStock: (id: string, batchNumber: string | null, quantity: number, unit?: string, location?: string, expiryDate?: string, costPrice?: number) => Promise<void>;
  removeBatchStock: (productId: string, batchNumber: string, quantity: number, reason?: string) => Promise<void>;
}

export const useProductStore = create<ProductState>((set, get) => ({
  allProducts: [],
  products: [], 
  
  syncWithBranch: async (branchId) => {
    try {
        const { products } = await api.get(`/products?branchId=${branchId}`);
        const mappedProducts = products.map((p: any) => ({
            ...p,
            image: p.imageUrl || '',
        }));
        set({ 
            allProducts: mappedProducts, 
            products: mappedProducts
        });
    } catch (e) {
        console.error("Failed to fetch products", e);
    }
  },

  setProducts: (products) => set({ products }),
  
  addProduct: async (product) => {
    try {
        const payload = {
            ...product,
            imageUrl: product.image || undefined,
        };
        const { product: newProduct } = await api.post('/products', payload);
        const mappedProduct = {
            ...newProduct,
            image: newProduct.imageUrl || ''
        };
        set((state) => ({ 
          allProducts: [mappedProduct, ...state.allProducts],
          products: [mappedProduct, ...state.products] 
        }));
    } catch (e) {
        console.error("Failed to add product", e);
        throw e;
    }
  },
  
  updateProduct: async (id, updates) => {
    try {
       await api.patch(`/products/${id}`, updates);
       const currentBranchId = useBranchStore.getState().currentBranchId;
       await get().syncWithBranch(currentBranchId);
    } catch (e) {
       console.error("Failed to update product", e);
       throw e;
    }
  },
  
  deleteProduct: async (id) => {
     try {
       await api.delete(`/products/${id}`);
       const currentBranchId = useBranchStore.getState().currentBranchId;
       await get().syncWithBranch(currentBranchId);
     } catch (e) {
       console.error("Failed to delete product", e);
       throw e;
     }
  },

  incrementStock: async (id, batchNumber, quantity, unit, location, expiryDate, costPrice) => {
     try {
       await api.post(`/products/${id}/stock-adjust`, {
           quantity,
           batchNumber,
           expiryDate,
           costPrice,
           location,
           unit
       });
       
       const currentBranchId = useBranchStore.getState().currentBranchId;
       await get().syncWithBranch(currentBranchId);
     } catch (e) {
       console.error("Failed to increment stock", e);
       throw e;
     }
  },

  removeBatchStock: async (productId, batchNumber, quantity, reason) => {
     try {
       await api.post(`/products/${productId}/stock-adjust`, {
           quantity: -quantity,
           batchNumber,
       });
       const currentBranchId = useBranchStore.getState().currentBranchId;
       await get().syncWithBranch(currentBranchId);
     } catch (e) {
       console.error("Failed to remove stock", e);
       throw e;
     }
  }
}));

// --- Scanner History Store & Sync Logic (Persisted) ---

interface ScannerState {
    scannedItems: ScannedItem[];
    syncLogs: SyncLog[];
    
    // Verification Stage State
    activeScan: ScannedItem | null;
    setActiveScan: (item: ScannedItem | null) => void;
    
    // Core Actions
    startScan: (record: GS1ParsedData) => void;
    confirmAndSync: (verifiedItem: ScannedItem) => Promise<boolean>;
    
    addToQueue: (record: GS1ParsedData, manual: boolean) => void; // Legacy compatibility
    clearHistory: () => void;
    retrySync: (id: string) => void;
}

export const useScannerStore = create<ScannerState>()(
    persist(
        (set, get) => ({
            scannedItems: [],
            syncLogs: [],
            activeScan: null,

            setActiveScan: (item) => set({ activeScan: item }),

            // Step 1: Initialize Scan (Move to Step 2)
            startScan: (record) => {
                const user = useAuthStore.getState().user;
                const newItem: ScannedItem = {
                    id: Math.random().toString(36).substr(2, 9),
                    gtin: record.gtin || null,
                    productName: '', // Will look up later
                    batchNumber: record.batchNumber || null,
                    expiryDate: record.expiryDate || null,
                    serialNumber: record.serialNumber || null,
                    quantity: 0, // Pending Verification
                    unit: 'STRIP', // Default
                    timestamp: Date.now(),
                    syncStatus: 'PENDING',
                    rawData: record.rawData,
                    type: record.type,
                    scannedBy: user?.name || 'Unknown',
                    verified: false
                };
                
                // Check if product exists to pre-fill name
                const products = useProductStore.getState().allProducts;
                const match = products.find(p => p.gtin === newItem.gtin);
                if (match) {
                    newItem.productName = match.nameEn;
                    newItem.unit = match.unit; // Default to existing product unit
                }

                set({ activeScan: newItem });
            },

            // Step 3: Confirm & Sync
            confirmAndSync: async (verifiedItem) => {
                const productStore = useProductStore.getState();
                const user = useAuthStore.getState().user;

                // 1. Identify Product
                let product = productStore.allProducts.find(p => p.gtin === verifiedItem.gtin);
                
                // Fallback search
                if (!product && !verifiedItem.gtin) {
                     product = productStore.allProducts.find(p => p.sku === verifiedItem.rawData || p.id === verifiedItem.rawData);
                }

                if (product) {
                    // Update Inventory
                    await productStore.incrementStock(
                        product.id, 
                        verifiedItem.batchNumber, 
                        verifiedItem.quantity,
                        verifiedItem.unit,
                        verifiedItem.location,
                        verifiedItem.expiryDate || undefined,
                        verifiedItem.costPrice
                    );

                    const finalItem: ScannedItem = {
                        ...verifiedItem,
                        productName: product.nameEn,
                        syncStatus: 'SYNCED',
                        syncMessage: 'Verified & Added',
                        verified: true
                    };

                    set(state => ({
                        activeScan: null,
                        scannedItems: [finalItem, ...state.scannedItems].slice(0, 500),
                        syncLogs: [{
                            id: `log-${Date.now()}`,
                            scanId: finalItem.id,
                            action: 'UPDATE',
                            productName: product ? product.nameEn : 'Unknown',
                            oldQuantity: product ? product.stockLevel : 0,
                            newQuantity: product ? product.stockLevel + finalItem.quantity : finalItem.quantity,
                            timestamp: new Date().toISOString(),
                            status: 'SUCCESS'
                        }, ...state.syncLogs].slice(0, 200)
                    }));
                    
                    return true;
                } else {
                    const errorItem: ScannedItem = {
                        ...verifiedItem,
                        syncStatus: 'ERROR',
                        syncMessage: 'Product not found. Please add to master list first.',
                        verified: true
                    };
                    
                    set(state => ({
                        activeScan: null,
                        scannedItems: [errorItem, ...state.scannedItems].slice(0, 500)
                    }));
                    return false;
                }
            },

            // Legacy / Direct queue logic (kept for compatibility if needed)
            addToQueue: (record, manual) => {
                 get().startScan(record);
            },
            
            retrySync: (id) => {
                // Logic to retry failed syncs (omitted for brevity in this step)
            },

            clearHistory: () => set({ scannedItems: [], syncLogs: [] })
        }),
        {
            name: 'scanner-store-v2',
        }
    )
);

// Other stores
export const useCustomerStore = create<any>((set) => ({ customers: mockCustomers, allCustomers: mockCustomers, syncWithBranch: () => {}, addCustomer: () => {}, updateCustomer: () => {}, deleteCustomer: () => {} }));
export const useTransactionStore = create<any>((set) => ({ transactions: mockTransactions, allTransactions: mockTransactions, syncWithBranch: () => {}, addTransaction: () => {}, getTransactionsByDateRange: () => [] }));
export const useDistributionStore = create<any>((set) => ({ orders: mockDistributionOrders, allOrders: mockDistributionOrders, syncWithBranch: () => {}, addOrder: () => {}, updateOrder: () => {}, deleteOrder: () => {} }));
export const usePurchaseStore = create<any>((set) => ({ purchaseOrders: mockPurchaseOrders, allPOs: mockPurchaseOrders, syncWithBranch: () => {}, addPO: () => {}, updatePO: () => {}, deletePO: () => {} }));
export const useFinanceStore = create<any>((set) => ({ expenses: mockExpenses, allExpenses: mockExpenses, payables: mockPayables, allPayables: mockPayables, receivables: mockReceivables, allReceivables: mockReceivables, syncWithBranch: () => {}, addExpense: () => {}, removeExpense: () => {}, markPayablePaid: () => {}, markReceivableCollected: () => {} }));
export const useSupplierStore = create<any>((set) => ({ suppliers: mockSuppliers, allSuppliers: mockSuppliers, syncWithBranch: () => {}, addSupplier: () => {}, updateSupplier: () => {}, deleteSupplier: () => {} }));
export const useSettingsStore = create<any>((set) => ({ settings: { companyName: 'Parami Pharmacy' }, updateSettings: () => {} }));
