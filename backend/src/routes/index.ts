import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { branchRouter } from '../modules/branches/branch.routes';
import { customerRouter } from '../modules/customers/customer.routes';
import { distributionRouter } from '../modules/distribution/distribution.routes';
import { financeRouter } from '../modules/finance/finance.routes';
import { inventoryRouter } from '../modules/inventory/inventory.routes';
import { productRouter } from '../modules/products/product.routes';
import { purchaseRouter } from '../modules/purchase/purchase.routes';
import { salesRouter } from '../modules/sales/sales.routes';
import { scannerRouter } from '../modules/scanner/scanner.routes';
import { settingsRouter } from '../modules/settings/settings.routes';
import { supplierRouter } from '../modules/suppliers/supplier.routes';

export const router = Router();

router.use('/auth', authRouter);
router.use('/branches', branchRouter);
router.use('/products', productRouter);
router.use('/inventory', inventoryRouter);
router.use('/sales', salesRouter);
router.use('/customers', customerRouter);
router.use('/distribution', distributionRouter);
router.use('/purchase', purchaseRouter);
router.use('/finance', financeRouter);
router.use('/settings', settingsRouter);
router.use('/scanner', scannerRouter);
router.use('/suppliers', supplierRouter);

