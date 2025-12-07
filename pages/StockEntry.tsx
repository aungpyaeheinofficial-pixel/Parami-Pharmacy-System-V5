
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Plus, Save, Search, Calendar, MapPin, 
  ScanLine, CheckCircle2, ChevronDown, 
  FileSpreadsheet, Eraser, Camera, Loader2, Clipboard, Tag, X
} from 'lucide-react';
import { Card, Button, Input } from '../components/UI';
import CameraScanner from '../components/CameraScanner';
import { useProductStore, useSupplierStore, useAuthStore } from '../store';
import { UNIT_TYPES, ScannedItem } from '../types';
import { parseBarcode } from '../utils/gs1Parser';

type ViewMode = 'SINGLE' | 'BULK';

interface BulkRow {
  id: string;
  gtin: string;
  productName: string;
  category: string;
  batchNumber: string;
  expiryDate: string; // YYYY-MM-DD
  quantity: string; // Keep as string for input handling
  unit: string;
  costPrice: string;
  sellingPrice: string;
}

const StockEntry = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const prefillData = location.state?.scannedData as ScannedItem | undefined;

  // Stores
  const { allProducts, incrementStock, addProduct } = useProductStore();
  const { suppliers } = useSupplierStore();
  const { user } = useAuthStore();

  // View State
  const [viewMode, setViewMode] = useState<ViewMode>('SINGLE');
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  // Computed Categories
  const categories = useMemo<string[]>(() => {
    const cats = new Set(allProducts.map(p => p.category).filter(c => c && c !== 'Uncategorized'));
    return Array.from(cats).sort();
  }, [allProducts]);
  
  // --- SINGLE ENTRY STATE ---
  const [searchTerm, setSearchTerm] = useState('');
  const qtyRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    gtin: '',
    productName: '',
    category: '',
    batchNumber: '',
    expiryDate: '',
    quantity: '',
    unit: 'STRIP',
    location: '',
    costPrice: '',
    sellingPrice: '',
    supplierId: '',
    invoiceNo: '',
    notes: ''
  });

  // --- BULK IMPORT STATE ---
  const [gridData, setGridData] = useState<BulkRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Initialize grid with some empty rows
  useEffect(() => {
    if (viewMode === 'BULK' && gridData.length === 0) {
        addEmptyRows(5);
    }
  }, [viewMode]);

  // Global Paste Listener for Bulk Mode
  useEffect(() => {
    if (viewMode !== 'BULK') return;
    
    const handleWindowPaste = (e: ClipboardEvent) => {
      // Avoid interfering if user is editing a specific input
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

      const clipboardText = e.clipboardData?.getData('text');
      if (clipboardText) {
         e.preventDefault();
         processPasteData(clipboardText);
      }
    };

    window.addEventListener('paste', handleWindowPaste);
    return () => window.removeEventListener('paste', handleWindowPaste);
  }, [viewMode]);

  // --- INITIALIZATION ---
  useEffect(() => {
    if (prefillData) {
      populateForm(prefillData);
    }
  }, [prefillData]);

  // --- GLOBAL SCANNER LISTENER (For Single Entry) ---
  useEffect(() => {
    if (viewMode !== 'SINGLE') return;

    let buffer = '';
    let lastKeyTime = Date.now();

    const handleGlobalKey = (e: KeyboardEvent) => {
      const now = Date.now();
      // If time between keys is long, it's manual typing, reset buffer
      if (now - lastKeyTime > 50) {
        buffer = '';
      }
      lastKeyTime = now;

      if (e.key === 'Enter') {
        // If buffer looks like a barcode (length > 5), process it
        if (buffer.length > 5) {
           const result = parseBarcode(buffer);
           
           if (result.success || (buffer.includes('01') && buffer.includes('10'))) {
              e.preventDefault(); 
              
              const scannedItem: Partial<ScannedItem> = {
                  gtin: result.gtin || buffer, 
                  rawData: buffer,
                  batchNumber: result.batchNumber,
                  expiryDate: result.expiryDate,
              };
              populateForm(scannedItem as ScannedItem);
              setSuccessMsg('Scanned: ' + buffer);
              setTimeout(() => setSuccessMsg(''), 2000);
           }
        }
        buffer = '';
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };

    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [viewMode, allProducts]);


  // --- HELPERS ---
  const populateForm = (data: ScannedItem) => {
      // Find existing product to auto-fill details
      const existingProduct = allProducts.find(p => p.gtin === data.gtin || p.id === data.rawData);
      
      setFormData(prev => ({
          ...prev,
          gtin: data.gtin || data.rawData || '',
          productName: existingProduct?.nameEn || data.productName || '',
          category: existingProduct?.category || '',
          batchNumber: data.batchNumber || '',
          expiryDate: data.expiryDate || '',
          unit: existingProduct?.unit || 'STRIP',
          location: existingProduct?.location || '',
          sellingPrice: existingProduct?.price.toString() || '',
          costPrice: existingProduct?.batches?.[0]?.costPrice.toString() || '',
          quantity: ''
      }));

      setTimeout(() => qtyRef.current?.focus(), 100);
  };

  const handleProductSearch = (term: string) => {
      setSearchTerm(term);
      const found = allProducts.find(p => p.sku === term || p.nameEn.toLowerCase().includes(term.toLowerCase()));
      if (found) {
          populateForm({ 
              gtin: found.gtin, 
              rawData: found.id, 
              productName: found.nameEn 
          } as ScannedItem);
      }
  };

  const saveStockEntry = async (data: any) => {
       // IMPORTANT: Fetch latest state directly to ensure bulk imports see previous iterations' new products
       const currentProducts = useProductStore.getState().allProducts;
       
       // Try to find product by GTIN first, then exact name match
       let product = null;
       if (data.gtin) {
           product = currentProducts.find(p => p.gtin === data.gtin);
       }
       if (!product) {
           product = currentProducts.find(p => p.nameEn.toLowerCase() === data.productName.toLowerCase());
       }
       
       const qty = parseInt(data.quantity) || 0;
       const cost = Number(data.costPrice) || 0;
       const selling = Number(data.sellingPrice) || 0;
       const unit = data.unit || 'STRIP';
       
       if (product) {
          // Operation A & B: Update Inventory & Batch
          await incrementStock(
              product.id,
              data.batchNumber,
              qty,
              unit,
              data.location || '',
              data.expiryDate,
              cost
          );
      } else {
         // Create New Product & Batch (Operation A & B)
         const newId = `p-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
         
         await addProduct({
             id: newId,
             nameEn: data.productName,
             nameMm: data.productName, 
             gtin: data.gtin,
             sku: data.gtin || `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
             category: data.category || 'Uncategorized',
             price: selling,
             stockLevel: qty,
             unit: unit,
             minStockLevel: 10,
             requiresPrescription: false,
             branchId: user?.branchId || 'b1',
             location: data.location || '',
             image: '',
             batches: [{
                 id: `b-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                 batchNumber: data.batchNumber || 'DEFAULT',
                 expiryDate: data.expiryDate || new Date(Date.now() + 31536000000).toISOString().split('T')[0],
                 quantity: qty,
                 costPrice: cost
             }]
         });
      }
  };

  // --- SINGLE ENTRY HANDLERS ---
  const handleSingleSave = async (createAnother: boolean = false) => {
      if (!formData.productName || !formData.quantity || !formData.unit) {
          alert("Please fill in Product Name, Quantity, and Unit.");
          return;
      }

      try {
          await saveStockEntry(formData);
          
          setSuccessMsg(`Stock Updated: ${formData.quantity} ${formData.unit} of ${formData.productName}`);
          setTimeout(() => setSuccessMsg(''), 3000);

          if (createAnother) {
              setFormData(prev => ({
                  ...prev,
                  gtin: '',
                  productName: '',
                  category: '',
                  batchNumber: '',
                  expiryDate: '',
                  quantity: '',
                  costPrice: '',
                  sellingPrice: ''
              }));
              setSearchTerm('');
          } else {
              navigate('/inventory');
          }
      } catch (e) {
          alert("Failed to save: " + e);
      }
  };

  const handleCameraScan = (raw: string) => {
      const result = parseBarcode(raw);
      populateForm({
          gtin: result.gtin,
          rawData: result.rawData,
          batchNumber: result.batchNumber,
          expiryDate: result.expiryDate,
      } as ScannedItem);
      setIsScannerOpen(false);
  };

  // --- BULK GRID HANDLERS ---
  
  const addEmptyRows = (count: number) => {
      const newRows: BulkRow[] = Array(count).fill(null).map(() => ({
          id: Math.random().toString(36).substr(2, 9),
          gtin: '',
          productName: '',
          category: '',
          batchNumber: '',
          expiryDate: '',
          quantity: '',
          unit: 'STRIP',
          costPrice: '',
          sellingPrice: ''
      }));
      setGridData(prev => [...prev, ...newRows]);
  };

  const processPasteData = (text: string) => {
      // Split rows by newline
      const rows = text.split(/\r\n|\n|\r/).filter(row => row.trim() !== '');
      
      const newRows: BulkRow[] = rows.map(row => {
          // Split columns by tab
          const cols = row.split('\t');
          
          return {
              id: Math.random().toString(36).substr(2, 9),
              gtin: cols[0]?.trim() || '',
              productName: cols[1]?.trim() || '',
              category: cols[2]?.trim() || '',
              batchNumber: cols[3]?.trim() || '',
              expiryDate: cols[4]?.trim() || '',
              quantity: cols[5]?.trim() || '',
              unit: cols[6]?.trim() || 'STRIP',
              costPrice: cols[7]?.trim() || '',
              sellingPrice: cols[8]?.trim() || '' 
          };
      });

      // Append parsed rows to grid
      setGridData(prev => [...prev, ...newRows]);
      setSuccessMsg(`Pasted ${newRows.length} rows successfully.`);
      setTimeout(() => setSuccessMsg(''), 3000);
  };

  const updateGridCell = (id: string, field: keyof BulkRow, value: string) => {
      setGridData(prev => prev.map(row => 
          row.id === id ? { ...row, [field]: value } : row
      ));
  };

  const deleteGridRow = (id: string) => {
      setGridData(prev => prev.filter(r => r.id !== id));
  };

  const clearGrid = () => {
      if (window.confirm("Clear all rows in the grid?")) {
          setGridData([]);
          addEmptyRows(5);
      }
  };

  const isValidDate = (dateString: string) => {
      // Simple ISO YYYY-MM-DD check
      const regex = /^\d{4}-\d{2}-\d{2}$/;
      if(!dateString) return false; 
      return regex.test(dateString) && !isNaN(Date.parse(dateString));
  };

  const handleBulkProcess = () => {
      // Filter out completely empty rows
      const validRows = gridData.filter(row => row.productName || row.quantity || row.gtin);
      
      if (validRows.length === 0) {
          alert("No data to import.");
          return;
      }

      // Validation
      const hasErrors = validRows.some(row => 
          !row.gtin || !isValidDate(row.expiryDate)
      );
      
      if (hasErrors) {
          if (!window.confirm("Some rows have missing Barcodes or invalid Expiry Dates (marked in RED). These may be skipped or cause errors. Proceed?")) {
              return;
          }
      }

      setIsProcessing(true);
      
      setTimeout(async () => {
          try {
              let importCount = 0;
              const validDataRows = validRows.filter(row => row.productName && row.quantity && row.gtin);
              
              for (const row of validDataRows) {
                  await saveStockEntry({
                      gtin: row.gtin,
                      productName: row.productName,
                      category: row.category,
                      batchNumber: row.batchNumber,
                      expiryDate: row.expiryDate,
                      quantity: row.quantity,
                      unit: row.unit,
                      costPrice: row.costPrice,
                      sellingPrice: row.sellingPrice,
                      location: ''
                  });
                  importCount++;
              }

              setSuccessMsg(`Stock Updated for ${importCount} items!`);
              setGridData([]);
              addEmptyRows(1);
          } catch (e) {
              console.error(e);
              alert("Error processing import: " + e);
          } finally {
              setIsProcessing(false);
          }
      }, 500);
  };


  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 pb-20">
       {/* Shared Datalist for Categories */}
       <datalist id="category-options">
          {categories.map((c: string) => <option key={c} value={c} />)}
       </datalist>

       <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                Stock Entry
                <span className="text-base font-normal text-slate-400 font-mm ml-2">ပစ္စည်း ထည့်သွင်းရန်</span>
            </h1>
            <p className="text-slate-500 text-sm">Update inventory via barcode scanner or bulk excel upload.</p>
          </div>
          
          {/* VIEW SWITCHER TABS */}
          <div className="bg-slate-100 p-1 rounded-xl flex">
              <button 
                  onClick={() => setViewMode('SINGLE')}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${viewMode === 'SINGLE' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                  <ScanLine size={16} /> Single Scan
              </button>
              <button 
                  onClick={() => setViewMode('BULK')}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${viewMode === 'BULK' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                  <FileSpreadsheet size={16} /> Bulk Grid
              </button>
          </div>
       </div>

       {successMsg && (
          <div className="bg-emerald-100 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
              <CheckCircle2 size={20} />
              <span className="font-medium">{successMsg}</span>
          </div>
       )}

       {/* ================= SINGLE ENTRY VIEW ================= */}
       {viewMode === 'SINGLE' && (
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-left-4">
               {/* Left Column: Product Search & Details */}
               <div className="lg:col-span-2 space-y-6">
                   <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
                       <ScanLine className="text-blue-500 mt-1" size={20} />
                       <div>
                           <p className="font-bold text-blue-900 text-sm">Scanner Ready</p>
                           <p className="text-blue-700 text-xs mt-1">
                               System is listening for barcode input. Just point and scan GS1 or EAN codes anywhere on this page.
                           </p>
                       </div>
                   </div>

                   <Card title="1. Product Identification">
                       <div className="space-y-4">
                           <div className="flex gap-2">
                               <div className="relative flex-1">
                                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                   <input 
                                       className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                       placeholder="Search Product Name or SKU..."
                                       value={searchTerm}
                                       onChange={e => handleProductSearch(e.target.value)}
                                   />
                               </div>
                               <Button variant="outline" onClick={() => setIsScannerOpen(true)}>
                                  <Camera size={18} />
                               </Button>
                           </div>
                           
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <div className="md:col-span-2">
                                  <Input 
                                      label="Product Name" 
                                      value={formData.productName} 
                                      onChange={(e: any) => setFormData({...formData, productName: e.target.value})}
                                      required
                                      placeholder="e.g. Paracetamol 500mg"
                                  />
                               </div>
                               
                               <div>
                                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Category</label>
                                  <div className="relative">
                                    <input 
                                        list="category-options"
                                        className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                                        value={formData.category}
                                        onChange={e => setFormData({...formData, category: e.target.value})}
                                        placeholder="e.g. Antibiotics"
                                    />
                                    <Tag className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                                  </div>
                               </div>

                               <Input 
                                   label="GTIN / Barcode" 
                                   value={formData.gtin} 
                                   onChange={(e: any) => setFormData({...formData, gtin: e.target.value})}
                                   placeholder="Scanned code..."
                                   className="font-mono"
                               />
                           </div>
                       </div>
                   </Card>

                   <Card title="2. Batch & Expiry">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                           <Input 
                               label="Batch Number" 
                               value={formData.batchNumber}
                               onChange={(e: any) => setFormData({...formData, batchNumber: e.target.value})}
                               placeholder="Enter Batch No."
                           />
                           <div>
                               <label className="block text-sm font-medium text-slate-700 mb-1.5">Expiry Date</label>
                               <div className="relative">
                                   <input 
                                       type="date"
                                       className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none"
                                       value={formData.expiryDate}
                                       onChange={e => setFormData({...formData, expiryDate: e.target.value})}
                                   />
                                   <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                               </div>
                           </div>
                       </div>
                   </Card>

                   <Card className="border-l-4 border-l-blue-500 shadow-md">
                       <div className="flex items-center justify-between mb-4">
                           <h3 className="font-bold text-slate-800 text-lg">3. Quantity & Unit <span className="text-red-500">*</span></h3>
                       </div>
                       <div className="flex gap-4 items-start">
                           <div className="flex-1">
                               <label className="block text-sm font-medium text-slate-700 mb-1.5">Quantity</label>
                               <input 
                                   ref={qtyRef}
                                   type="number"
                                   min="1"
                                   className="w-full text-2xl font-bold p-3 bg-white border border-slate-300 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 text-center text-slate-900 placeholder:text-slate-300"
                                   value={formData.quantity}
                                   onChange={e => setFormData({...formData, quantity: e.target.value})}
                                   placeholder="0"
                               />
                           </div>
                           <div className="flex-1">
                               <label className="block text-sm font-medium text-slate-700 mb-1.5">Unit Type</label>
                               <div className="relative">
                                   <select 
                                       className="w-full p-3.5 bg-slate-50 border border-slate-300 rounded-xl appearance-none font-bold text-slate-700 focus:border-blue-500 focus:outline-none"
                                       value={formData.unit}
                                       onChange={e => setFormData({...formData, unit: e.target.value})}
                                   >
                                       {UNIT_TYPES.map(u => (
                                           <option key={u.code} value={u.code}>{u.nameMm} ({u.nameEn})</option>
                                       ))}
                                   </select>
                                   <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                               </div>
                           </div>
                       </div>
                   </Card>
               </div>

               {/* Right Column: Additional Info */}
               <div className="space-y-6">
                   <Card title="4. Location & Pricing">
                       <div className="space-y-4">
                           <Input 
                               label="Storage Location" 
                               value={formData.location}
                               onChange={(e: any) => setFormData({...formData, location: e.target.value})}
                               placeholder="e.g. Shelf A-12"
                               icon={MapPin}
                           />
                           <div className="grid grid-cols-2 gap-4">
                               <Input 
                                   label="Cost Price" 
                                   type="number"
                                   value={formData.costPrice}
                                   onChange={(e: any) => setFormData({...formData, costPrice: e.target.value})}
                                   placeholder="0"
                               />
                               <Input 
                                   label="Selling Price" 
                                   type="number"
                                   value={formData.sellingPrice}
                                   onChange={(e: any) => setFormData({...formData, sellingPrice: e.target.value})}
                                   placeholder="0"
                               />
                           </div>
                       </div>
                   </Card>

                   <Card title="5. Supplier Info">
                       <div className="space-y-4">
                           <div>
                               <label className="block text-sm font-medium text-slate-700 mb-1.5">Supplier</label>
                               <select 
                                   className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none"
                                   value={formData.supplierId}
                                   onChange={e => setFormData({...formData, supplierId: e.target.value})}
                               >
                                   <option value="">-- Select Supplier --</option>
                                   {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                               </select>
                           </div>
                           <Input 
                               label="Invoice No."
                               value={formData.invoiceNo}
                               onChange={(e: any) => setFormData({...formData, invoiceNo: e.target.value})}
                               placeholder="INV-..."
                           />
                           <div>
                               <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
                               <textarea 
                                   rows={3}
                                   className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none text-sm"
                                   value={formData.notes}
                                   onChange={e => setFormData({...formData, notes: e.target.value})}
                               />
                           </div>
                       </div>
                   </Card>
               </div>
           </div>
       )}

       {/* ================= BULK IMPORT VIEW ================= */}
       {viewMode === 'BULK' && (
           <div className="animate-in fade-in slide-in-from-right-4 space-y-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <FileSpreadsheet className="text-green-600" size={20} /> Bulk Spreadsheet Import
                      </h3>
                      <p className="text-xs text-slate-500 mt-1 max-w-2xl">
                          Copy rows from Excel or Google Sheets (Ctrl+C) and paste anywhere in the grid below (Ctrl+V).
                          <br/>Expected Columns: <span className="font-mono bg-slate-100 px-1 rounded">Barcode | Name | Category | Batch | Expiry | Qty | Unit | Cost | Price</span>
                      </p>
                  </div>
                  <div className="flex gap-2">
                      <Button variant="outline" className="text-xs" onClick={() => addEmptyRows(1)}>
                          <Plus size={14} className="mr-1"/> Add Row
                      </Button>
                      <Button variant="outline" className="text-xs" onClick={clearGrid}>
                          <Eraser size={14} className="mr-1"/> Clear
                      </Button>
                  </div>
              </div>

              <Card className="p-0 overflow-hidden border border-slate-300 shadow-md">
                  <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse min-w-[1000px]">
                          <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-300">
                              <tr>
                                  <th className="px-2 py-3 border-r border-slate-200 w-12 text-center">#</th>
                                  <th className="px-2 py-3 border-r border-slate-200 w-40">Barcode <span className="text-red-500">*</span></th>
                                  <th className="px-2 py-3 border-r border-slate-200 w-64">Product Name <span className="text-red-500">*</span></th>
                                  <th className="px-2 py-3 border-r border-slate-200 w-32">Category</th>
                                  <th className="px-2 py-3 border-r border-slate-200 w-32">Batch No.</th>
                                  <th className="px-2 py-3 border-r border-slate-200 w-32">Expiry (Y-M-D) <span className="text-red-500">*</span></th>
                                  <th className="px-2 py-3 border-r border-slate-200 w-24">Qty <span className="text-red-500">*</span></th>
                                  <th className="px-2 py-3 border-r border-slate-200 w-24">Unit</th>
                                  <th className="px-2 py-3 border-r border-slate-200 w-24">Cost</th>
                                  <th className="px-2 py-3 border-r border-slate-200 w-24">Price</th>
                                  <th className="px-2 py-3 w-12 text-center"></th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 bg-white">
                              {gridData.map((row, index) => {
                                  const hasContent = row.productName || row.batchNumber || row.quantity;
                                  const isBarcodeMissing = hasContent && (!row.gtin || row.gtin.trim() === '');
                                  const isExpiryInvalid = hasContent && (!row.expiryDate || !/^\d{4}-\d{2}-\d{2}$/.test(row.expiryDate));

                                  return (
                                    <tr key={row.id} className="group hover:bg-slate-50">
                                        <td className="px-2 py-2 text-center text-slate-400 text-xs border-r border-slate-100">
                                            {index + 1}
                                        </td>
                                        
                                        {/* Barcode */}
                                        <td className={`p-0 border-r border-slate-100 ${isBarcodeMissing ? 'bg-red-50 ring-2 ring-inset ring-red-500' : ''}`}>
                                            <input 
                                                className="w-full h-full px-3 py-2 bg-transparent focus:outline-none focus:bg-blue-50 font-mono text-xs"
                                                value={row.gtin}
                                                placeholder={isBarcodeMissing ? "Required" : ""}
                                                onChange={(e) => updateGridCell(row.id, 'gtin', e.target.value)}
                                            />
                                        </td>
                                        
                                        {/* Name */}
                                        <td className="p-0 border-r border-slate-100">
                                            <input 
                                                className="w-full h-full px-3 py-2 bg-transparent focus:outline-none focus:bg-blue-50"
                                                value={row.productName}
                                                onChange={(e) => updateGridCell(row.id, 'productName', e.target.value)}
                                            />
                                        </td>

                                        {/* Category */}
                                        <td className="p-0 border-r border-slate-100">
                                            <input 
                                                className="w-full h-full px-3 py-2 bg-transparent focus:outline-none focus:bg-blue-50"
                                                value={row.category}
                                                onChange={(e) => updateGridCell(row.id, 'category', e.target.value)}
                                                list="category-options"
                                            />
                                        </td>

                                        {/* Batch */}
                                        <td className="p-0 border-r border-slate-100">
                                            <input 
                                                className="w-full h-full px-3 py-2 bg-transparent focus:outline-none focus:bg-blue-50"
                                                value={row.batchNumber}
                                                onChange={(e) => updateGridCell(row.id, 'batchNumber', e.target.value)}
                                            />
                                        </td>

                                        {/* Expiry */}
                                        <td className={`p-0 border-r border-slate-100 ${isExpiryInvalid ? 'bg-red-50 ring-2 ring-inset ring-red-500' : ''}`}>
                                            <input 
                                                className={`w-full h-full px-3 py-2 bg-transparent focus:outline-none focus:bg-blue-50 ${isExpiryInvalid ? 'text-red-700 font-bold placeholder:text-red-400' : ''}`}
                                                value={row.expiryDate}
                                                placeholder="YYYY-MM-DD"
                                                onChange={(e) => updateGridCell(row.id, 'expiryDate', e.target.value)}
                                            />
                                        </td>

                                        {/* Qty */}
                                        <td className="p-0 border-r border-slate-100">
                                            <input 
                                                type="number"
                                                className="w-full h-full px-3 py-2 bg-transparent focus:outline-none focus:bg-blue-50 text-center font-bold"
                                                value={row.quantity}
                                                onChange={(e) => updateGridCell(row.id, 'quantity', e.target.value)}
                                            />
                                        </td>

                                        {/* Unit */}
                                        <td className="p-0 border-r border-slate-100">
                                            <select 
                                                className="w-full h-full px-1 py-2 bg-transparent focus:outline-none focus:bg-blue-50 text-xs"
                                                value={row.unit}
                                                onChange={(e) => updateGridCell(row.id, 'unit', e.target.value)}
                                            >
                                                {UNIT_TYPES.map(u => <option key={u.code} value={u.code}>{u.nameEn}</option>)}
                                            </select>
                                        </td>

                                        {/* Cost */}
                                        <td className="p-0 border-r border-slate-100">
                                            <input 
                                                type="number"
                                                className="w-full h-full px-3 py-2 bg-transparent focus:outline-none focus:bg-blue-50 text-right text-xs"
                                                value={row.costPrice}
                                                onChange={(e) => updateGridCell(row.id, 'costPrice', e.target.value)}
                                            />
                                        </td>

                                        {/* Price */}
                                        <td className="p-0 border-r border-slate-100">
                                            <input 
                                                type="number"
                                                className="w-full h-full px-3 py-2 bg-transparent focus:outline-none focus:bg-blue-50 text-right text-xs"
                                                value={row.sellingPrice}
                                                onChange={(e) => updateGridCell(row.id, 'sellingPrice', e.target.value)}
                                            />
                                        </td>

                                        {/* Delete */}
                                        <td className="p-0 text-center">
                                            <button 
                                                tabIndex={-1}
                                                onClick={() => deleteGridRow(row.id)}
                                                className="text-slate-300 hover:text-red-500 transition-colors p-2"
                                            >
                                                <X size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                  );
                              })}
                          </tbody>
                      </table>
                  </div>
                  {/* Empty State / Prompt */}
                  {gridData.length === 0 && (
                      <div className="p-8 text-center text-slate-400">
                          <Clipboard className="mx-auto mb-2 opacity-20" size={48} />
                          <p>Grid is empty. Paste data (Ctrl+V) or add rows manually.</p>
                      </div>
                  )}
              </Card>

              {/* Action Bar */}
              <div className="flex justify-end pt-4 border-t border-slate-200">
                  <Button 
                    variant="primary" 
                    className="px-8 py-3 shadow-lg shadow-blue-500/20"
                    onClick={handleBulkProcess}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                        <><Loader2 className="animate-spin mr-2" size={18} /> Processing...</>
                    ) : (
                        <><CheckCircle2 className="mr-2" size={18} /> Confirm Import</>
                    )}
                  </Button>
              </div>
           </div>
       )}

       {/* ================= FOOTER ACTIONS (SINGLE ONLY) ================= */}
       {viewMode === 'SINGLE' && (
           <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.1)] z-10 md:pl-[280px]">
               <div className="max-w-6xl mx-auto flex justify-between items-center">
                    <Button variant="outline" onClick={() => navigate('/inventory')}>
                        Cancel (ESC)
                    </Button>
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={() => handleSingleSave(true)}>
                            <Plus size={18} className="mr-2"/> Save & New
                        </Button>
                        <Button variant="primary" onClick={() => handleSingleSave(false)} className="px-8 shadow-lg shadow-blue-500/20">
                            <Save size={18} className="mr-2"/> Save & Close
                        </Button>
                    </div>
               </div>
           </div>
       )}

       {/* Scanner Modal */}
       {isScannerOpen && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col animate-in fade-in duration-300">
           <div className="p-4 flex justify-between items-center text-white bg-black/50 backdrop-blur-md absolute top-0 left-0 right-0 z-10">
              <span className="font-bold text-lg">Scan GS1 Barcode</span>
              <button onClick={() => setIsScannerOpen(false)} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X size={24} /></button>
           </div>
           <div className="flex-1 bg-black relative flex items-center justify-center">
               <CameraScanner onScan={handleCameraScan} className="w-full max-w-lg aspect-square" />
               <div className="absolute inset-0 border-[40px] border-black/50 pointer-events-none"></div>
           </div>
        </div>
       )}
    </div>
  );
};

export default StockEntry;
