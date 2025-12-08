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
    return localStorage.getItem('currentBranchId') || '550e8400-e29b-41d4-a716-446655440001';
  }
  return '550e8400-e29b-41d4-a716-446655440001';
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
      id: '550e8400-e29b-41d4-a716-446655440001', 
      name: 'ပါရမီ(၁) ထားဝယ်', 
      code: 'parami-1', 
      address: 'No. 45, Arzarni Road, Dawei', 
      phone: '09-420012345',
      managerName: 'U Mg Mg',
      email: 'branch1@parami.com',
      status: 'active' 
    }, 
    { 
      id: '550e8400-e29b-41d4-a716-446655440002', 
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

// --- Customer Store ---
interface CustomerState {
  customers: Customer[];
  allCustomers: Customer[];
  syncWithBranch: (branchId: string) => Promise<void>;
  addCustomer: (customer: Omit<Customer, 'id'>) => Promise<void>;
  updateCustomer: (id: string, updates: Partial<Customer>) => Promise<void>;
  deleteCustomer: (id: string) => Promise<void>;
}

export const useCustomerStore = create<CustomerState>((set, get) => ({
  customers: [],
  allCustomers: [],

  syncWithBranch: async (branchId: string) => {
    try {
      const { customers } = await api.get(`/customers?branchId=${branchId}`);
      const mapped: Customer[] = customers.map((c: any) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        points: c.points,
        tier: c.tier,
        branchId: c.branchId,
      }));
      set({ customers: mapped, allCustomers: mapped });
    } catch (e) {
      console.error('Failed to fetch customers', e);
    }
  },

  addCustomer: async (customer) => {
    try {
      const branchId = customer.branchId || useBranchStore.getState().currentBranchId;
      const payload = {
        branchId,
        name: customer.name,
        phone: customer.phone,
        points: customer.points ?? 0,
        tier: customer.tier ?? 'Silver',
      };
      const { customer: created } = await api.post('/customers', payload);
      const mapped: Customer = {
        id: created.id,
        name: created.name,
        phone: created.phone,
        points: created.points,
        tier: created.tier,
        branchId: created.branchId,
      };
      set((state) => ({
        customers: [mapped, ...state.customers],
        allCustomers: [mapped, ...state.allCustomers],
      }));
    } catch (e) {
      console.error('Failed to add customer', e);
      throw e;
    }
  },

  updateCustomer: async (id, updates) => {
    try {
      const payload: any = {
        name: updates.name,
        phone: updates.phone,
        points: updates.points,
        tier: updates.tier,
      };
      const { customer } = await api.patch(`/customers/${id}`, payload);
      const mapped: Customer = {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        points: customer.points,
        tier: customer.tier,
        branchId: customer.branchId,
      };
      set((state) => ({
        customers: state.customers.map((c) => (c.id === id ? mapped : c)),
        allCustomers: state.allCustomers.map((c) => (c.id === id ? mapped : c)),
      }));
    } catch (e) {
      console.error('Failed to update customer', e);
      throw e;
    }
  },

  deleteCustomer: async (id) => {
    try {
      await api.delete(`/customers/${id}`);
      set((state) => ({
        customers: state.customers.filter((c) => c.id !== id),
        allCustomers: state.allCustomers.filter((c) => c.id !== id),
      }));
    } catch (e) {
      console.error('Failed to delete customer', e);
      throw e;
    }
  },
}));

// --- Transaction Store ---
interface TransactionState {
  transactions: Transaction[];
  allTransactions: Transaction[];
  syncWithBranch: (branchId: string) => Promise<void>;
  addTransaction: (tx: Omit<Transaction, 'id'>) => Promise<void>;
  getTransactionsByDateRange: (start: string, end: string) => Transaction[];
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  transactions: [],
  allTransactions: [],

  syncWithBranch: async (branchId: string) => {
    try {
      const { transactions } = await api.get(`/finance/transactions?branchId=${branchId}`);
      const mapped: Transaction[] = transactions.map((t: any) => ({
        id: t.id,
        type: t.type,
        category: t.category,
        amount: t.amount,
        date: new Date(t.date).toISOString().split('T')[0],
        description: t.description || '',
        paymentMethod: t.paymentMethod || undefined,
        branchId: t.branchId,
      }));
      set({ transactions: mapped, allTransactions: mapped });
    } catch (e) {
      console.error('Failed to fetch transactions', e);
    }
  },

  addTransaction: async (tx) => {
    try {
      const branchId = tx.branchId || useBranchStore.getState().currentBranchId;
      const payload = {
        branchId,
        type: tx.type,
        category: tx.category,
        amount: tx.amount,
        date: tx.date,
        description: tx.description,
        paymentMethod: tx.paymentMethod,
      };
      const { transaction } = await api.post('/finance/transactions', payload);
      const mapped: Transaction = {
        id: transaction.id,
        type: transaction.type,
        category: transaction.category,
        amount: transaction.amount,
        date: new Date(transaction.date).toISOString().split('T')[0],
        description: transaction.description || '',
        paymentMethod: transaction.paymentMethod || undefined,
        branchId: transaction.branchId,
      };
      set((state) => ({
        transactions: [mapped, ...state.transactions],
        allTransactions: [mapped, ...state.allTransactions],
      }));
    } catch (e) {
      console.error('Failed to add transaction', e);
      throw e;
    }
  },

  getTransactionsByDateRange: (start, end) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return get().allTransactions.filter((t) => {
      const d = new Date(t.date);
      return d >= startDate && d <= endDate;
    });
  },
}));

// --- Distribution Store ---
interface DistributionStoreState {
  orders: DistributionOrder[];
  allOrders: DistributionOrder[];
  syncWithBranch: (branchId: string) => Promise<void>;
  addOrder: (order: DistributionOrder) => Promise<void>;
  updateOrder: (order: DistributionOrder) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
}

export const useDistributionStore = create<DistributionStoreState>((set, get) => ({
  orders: [],
  allOrders: [],

  syncWithBranch: async (branchId: string) => {
    try {
      const { orders } = await api.get(`/distribution?branchId=${branchId}`);
      const mapped: DistributionOrder[] = orders.map((o: any) => ({
        id: o.id,
        customer: o.customerName,
        address: o.address,
        status: o.status,
        total: o.total,
        date: new Date(o.date).toISOString().split('T')[0],
        deliveryTime: o.deliveryTime || '09:00',
        paymentType: o.paymentType === 'CREDIT' ? 'CREDIT' : 'CASH',
        itemsList: (o.items || []).map((i: any) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
        })),
        branchId: o.branchId,
      }));
      set({ orders: mapped, allOrders: mapped });
    } catch (e) {
      console.error('Failed to fetch distribution orders', e);
    }
  },

  addOrder: async (order) => {
    try {
      const branchId = order.branchId || useBranchStore.getState().currentBranchId;
      const productStore = useProductStore.getState();
      const items = order.itemsList.map((item) => {
        const product = productStore.allProducts.find((p) => p.nameEn === item.name);
        return {
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          productId: product?.id,
        };
      });
      const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
      const payload = {
        branchId,
        customerName: order.customer,
        address: order.address,
        paymentType: order.paymentType,
        status: order.status,
        deliveryTime: order.deliveryTime,
        total,
        items,
      };
      const { order: created } = await api.post('/distribution', payload);
      // Refresh from backend to keep mapping logic in one place
      await get().syncWithBranch(branchId);
      return created;
    } catch (e) {
      console.error('Failed to add distribution order', e);
      throw e;
    }
  },

  updateOrder: async (order) => {
    try {
      const branchId = order.branchId || useBranchStore.getState().currentBranchId;
      const productStore = useProductStore.getState();
      const items = order.itemsList.map((item) => {
        const product = productStore.allProducts.find((p) => p.nameEn === item.name);
        return {
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          productId: product?.id,
        };
      });
      const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
      const payload = {
        branchId,
        customerName: order.customer,
        address: order.address,
        paymentType: order.paymentType,
        status: order.status,
        deliveryTime: order.deliveryTime,
        total,
        items,
      };
      await api.patch(`/distribution/${order.id}`, payload);
      await get().syncWithBranch(branchId);
    } catch (e) {
      console.error('Failed to update distribution order', e);
      throw e;
    }
  },

  deleteOrder: async (id) => {
    try {
      await api.delete(`/distribution/${id}`);
      set((state) => ({
        orders: state.orders.filter((o) => o.id !== id),
        allOrders: state.allOrders.filter((o) => o.id !== id),
      }));
    } catch (e) {
      console.error('Failed to delete distribution order', e);
      throw e;
    }
  },
}));

// --- Purchase Store ---
interface PurchaseStoreState {
  purchaseOrders: PurchaseOrder[];
  allPOs: PurchaseOrder[];
  syncWithBranch: (branchId: string) => Promise<void>;
  addPO: (po: PurchaseOrder) => Promise<void>;
  updatePO: (po: PurchaseOrder) => Promise<void>;
  deletePO: (id: string) => Promise<void>;
}

export const usePurchaseStore = create<PurchaseStoreState>((set, get) => ({
  purchaseOrders: [],
  allPOs: [],

  syncWithBranch: async (branchId: string) => {
    try {
      const { purchaseOrders } = await api.get(`/purchase?branchId=${branchId}`);
      const mapped: PurchaseOrder[] = purchaseOrders.map((po: any) => ({
        id: po.id,
        supplierId: po.supplierId,
        supplierName: po.supplier?.name || '',
        date: new Date(po.date).toISOString().split('T')[0],
        status: po.status,
        paymentType: po.paymentType,
        items: (po.items || []).map((i: any) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
          unitCost: i.unitCost,
        })),
        totalAmount: po.totalAmount,
        notes: po.notes || '',
        branchId: po.branchId,
      }));
      set({ purchaseOrders: mapped, allPOs: mapped });
    } catch (e) {
      console.error('Failed to fetch purchase orders', e);
    }
  },

  addPO: async (po) => {
    try {
      const branchId = po.branchId || useBranchStore.getState().currentBranchId;
      const productStore = useProductStore.getState();
      const items = po.items.map((item) => {
        const product = productStore.allProducts.find((p) => p.nameEn === item.name);
        return {
          name: item.name,
          quantity: item.quantity,
          unitCost: item.unitCost,
          productId: product?.id,
        };
      });
      const payload = {
        branchId,
        supplierId: po.supplierId,
        status: po.status,
        paymentType: po.paymentType,
        date: po.date,
        notes: po.notes,
        totalAmount: po.totalAmount,
        items,
      };
      await api.post('/purchase', payload);
      await get().syncWithBranch(branchId);
    } catch (e) {
      console.error('Failed to add purchase order', e);
      throw e;
    }
  },

  updatePO: async (po) => {
    try {
      const branchId = po.branchId || useBranchStore.getState().currentBranchId;
      const productStore = useProductStore.getState();
      const items = po.items.map((item) => {
        const product = productStore.allProducts.find((p) => p.nameEn === item.name);
        return {
          name: item.name,
          quantity: item.quantity,
          unitCost: item.unitCost,
          productId: product?.id,
        };
      });
      const payload = {
        branchId,
        supplierId: po.supplierId,
        status: po.status,
        paymentType: po.paymentType,
        date: po.date,
        notes: po.notes,
        totalAmount: po.totalAmount,
        items,
      };
      await api.patch(`/purchase/${po.id}`, payload);
      await get().syncWithBranch(branchId);
    } catch (e) {
      console.error('Failed to update purchase order', e);
      throw e;
    }
  },

  deletePO: async (id) => {
    try {
      await api.delete(`/purchase/${id}`);
      set((state) => ({
        purchaseOrders: state.purchaseOrders.filter((po) => po.id !== id),
        allPOs: state.allPOs.filter((po) => po.id !== id),
      }));
    } catch (e) {
      console.error('Failed to delete purchase order', e);
      throw e;
    }
  },
}));

// --- Finance Store ---
interface FinanceStoreState {
  expenses: Expense[];
  allExpenses: Expense[];
  payables: Payable[];
  allPayables: Payable[];
  receivables: Receivable[];
  allReceivables: Receivable[];
  syncWithBranch: (branchId: string) => Promise<void>;
  addExpense: (expense: Expense) => Promise<void>;
  removeExpense: (id: string) => Promise<void>;
  markPayablePaid: (id: string) => Promise<void>;
  markReceivableCollected: (id: string) => Promise<void>;
}

export const useFinanceStore = create<FinanceStoreState>((set, get) => ({
  expenses: [],
  allExpenses: [],
  payables: [],
  allPayables: [],
  receivables: [],
  allReceivables: [],

  syncWithBranch: async (branchId: string) => {
    try {
      const [expensesRes, payablesRes, receivablesRes] = await Promise.all([
        api.get(`/finance/expenses?branchId=${branchId}`),
        api.get(`/finance/payables?branchId=${branchId}`),
        api.get(`/finance/receivables?branchId=${branchId}`),
      ]);

      const expenses: Expense[] = expensesRes.expenses.map((e: any) => ({
        id: e.id,
        category: e.category,
        amount: e.amount,
        date: new Date(e.date).toISOString().split('T')[0],
        description: e.description || '',
        status: e.status,
        branchId: e.branchId,
      }));

      const payables: Payable[] = payablesRes.payables.map((p: any) => ({
        id: p.id,
        supplierName: p.supplierName,
        invoiceNo: p.invoiceNo,
        amount: p.amount,
        dueDate: new Date(p.dueDate).toISOString().split('T')[0],
        status: p.status,
        branchId: p.branchId,
      }));

      const receivables: Receivable[] = receivablesRes.receivables.map((r: any) => ({
        id: r.id,
        customerName: r.customerName,
        orderId: r.orderRef,
        amount: r.amount,
        dueDate: new Date(r.dueDate).toISOString().split('T')[0],
        status: r.status,
        branchId: r.branchId,
      }));

      set({
        expenses,
        allExpenses: expenses,
        payables,
        allPayables: payables,
        receivables,
        allReceivables: receivables,
      });
    } catch (e) {
      console.error('Failed to fetch finance data', e);
    }
  },

  addExpense: async (expense) => {
    try {
      const branchId = expense.branchId || useBranchStore.getState().currentBranchId;
      const payload = {
        branchId,
        category: expense.category,
        amount: expense.amount,
        date: expense.date,
        description: expense.description,
        status: expense.status,
      };
      const { expense: created } = await api.post('/finance/expenses', payload);
      const mapped: Expense = {
        id: created.id,
        category: created.category,
        amount: created.amount,
        date: new Date(created.date).toISOString().split('T')[0],
        description: created.description || '',
        status: created.status,
        branchId: created.branchId,
      };
      set((state) => ({
        expenses: [mapped, ...state.expenses],
        allExpenses: [mapped, ...state.allExpenses],
      }));
    } catch (e) {
      console.error('Failed to add expense', e);
      throw e;
    }
  },

  removeExpense: async (id) => {
    try {
      await api.delete(`/finance/expenses/${id}`);
      set((state) => ({
        expenses: state.expenses.filter((e) => e.id !== id),
        allExpenses: state.allExpenses.filter((e) => e.id !== id),
      }));
    } catch (e) {
      console.error('Failed to remove expense', e);
      throw e;
    }
  },

  markPayablePaid: async (id) => {
    try {
      await api.delete(`/finance/payables/${id}`);
      set((state) => ({
        payables: state.payables.filter((p) => p.id !== id),
        allPayables: state.allPayables.filter((p) => p.id !== id),
      }));
    } catch (e) {
      console.error('Failed to mark payable paid', e);
      throw e;
    }
  },

  markReceivableCollected: async (id) => {
    try {
      await api.delete(`/finance/receivables/${id}`);
      set((state) => ({
        receivables: state.receivables.filter((r) => r.id !== id),
        allReceivables: state.allReceivables.filter((r) => r.id !== id),
      }));
    } catch (e) {
      console.error('Failed to mark receivable collected', e);
      throw e;
    }
  },
}));

// --- Supplier Store ---
interface SupplierStoreState {
  suppliers: Supplier[];
  allSuppliers: Supplier[];
  syncWithBranch: (branchId: string) => Promise<void>;
  addSupplier: (supplier: Supplier) => Promise<void>;
  updateSupplier: (id: string, supplier: Partial<Supplier>) => Promise<void>;
  deleteSupplier: (id: string) => Promise<void>;
}

export const useSupplierStore = create<SupplierStoreState>((set, get) => ({
  suppliers: [],
  allSuppliers: [],

  syncWithBranch: async (branchId: string) => {
    try {
      const { suppliers } = await api.get(`/suppliers?branchId=${branchId}`);
      const mapped: Supplier[] = suppliers.map((s: any) => ({
        id: s.id,
        name: s.name,
        contact: s.contact || '',
        email: s.email || '',
        credit: s.creditLimit ?? 0,
        outstanding: s.outstanding ?? 0,
        branchId: s.branchId,
      }));
      set({ suppliers: mapped, allSuppliers: mapped });
    } catch (e) {
      console.error('Failed to fetch suppliers', e);
    }
  },

  addSupplier: async (supplier) => {
    try {
      const branchId = supplier.branchId || useBranchStore.getState().currentBranchId;
      const payload = {
        branchId,
        name: supplier.name,
        contact: supplier.contact,
        email: supplier.email,
        creditLimit: supplier.credit ?? 0,
        outstanding: supplier.outstanding ?? 0,
      };
      const { supplier: created } = await api.post('/suppliers', payload);
      const mapped: Supplier = {
        id: created.id,
        name: created.name,
        contact: created.contact || '',
        email: created.email || '',
        credit: created.creditLimit ?? 0,
        outstanding: created.outstanding ?? 0,
        branchId: created.branchId,
      };
      set((state) => ({
        suppliers: [mapped, ...state.suppliers],
        allSuppliers: [mapped, ...state.allSuppliers],
      }));
    } catch (e) {
      console.error('Failed to add supplier', e);
      throw e;
    }
  },

  updateSupplier: async (id, supplier) => {
    try {
      const payload: any = {
        name: supplier.name,
        contact: supplier.contact,
        email: supplier.email,
        creditLimit: supplier.credit,
        outstanding: supplier.outstanding,
      };
      const { supplier: updated } = await api.patch(`/suppliers/${id}`, payload);
      const mapped: Supplier = {
        id: updated.id,
        name: updated.name,
        contact: updated.contact || '',
        email: updated.email || '',
        credit: updated.creditLimit ?? 0,
        outstanding: updated.outstanding ?? 0,
        branchId: updated.branchId,
      };
      set((state) => ({
        suppliers: state.suppliers.map((s) => (s.id === id ? mapped : s)),
        allSuppliers: state.allSuppliers.map((s) => (s.id === id ? mapped : s)),
      }));
    } catch (e) {
      console.error('Failed to update supplier', e);
      throw e;
    }
  },

  deleteSupplier: async (id) => {
    try {
      await api.delete(`/suppliers/${id}`);
      set((state) => ({
        suppliers: state.suppliers.filter((s) => s.id !== id),
        allSuppliers: state.allSuppliers.filter((s) => s.id !== id),
      }));
    } catch (e) {
      console.error('Failed to delete supplier', e);
      throw e;
    }
  },
}));

export const useSettingsStore = create<any>((set) => ({ settings: { companyName: 'Parami Pharmacy' }, updateSettings: () => {} }));
