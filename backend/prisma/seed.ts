import bcrypt from 'bcryptjs';
import {
  AgingStatus,
  DistributionStatus,
  ExpenseStatus,
  PaymentMethod,
  PrismaClient,
  PurchaseStatus,
  Role,
  TransactionType,
} from '@prisma/client';

const prisma = new PrismaClient();

async function seed() {
  const passwordHash = await bcrypt.hash('password', 10);

  const branches = [
    {
      id: '550e8400-e29b-41d4-a716-446655440001', // Valid UUID
      name: 'Parami (1) Dawei',
      code: 'parami-1',
      address: 'No. 45, Arzarni Road, Dawei',
      phone: '09-420012345',
      managerName: 'U Mg Mg',
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002', // Valid UUID
      name: 'Parami (2) Yangon',
      code: 'parami-2',
      address: 'No. 12, Pyay Road, Yangon',
      phone: '09-420098765',
      managerName: 'Daw Hla',
    },
  ];

  for (const branch of branches) {
    await prisma.branch.upsert({
      where: { id: branch.id },
      update: branch,
      create: branch,
    });
  }

  await prisma.user.upsert({
    where: { email: 'admin@parami.com' },
    update: {},
    create: {
      id: 'u1',
      name: 'Kaung Kaung',
      email: 'admin@parami.com',
      passwordHash,
      role: Role.ADMIN,
      branchId: '550e8400-e29b-41d4-a716-446655440001',
    },
  });

  await prisma.user.upsert({
    where: { email: 'pos@parami.com' },
    update: {},
    create: {
      id: 'u2',
      name: 'Kyaw Kyaw',
      email: 'pos@parami.com',
      passwordHash,
      role: Role.CASHIER,
      branchId: '550e8400-e29b-41d4-a716-446655440001',
    },
  });

  const products = [
    {
      id: 'p1',
      branchId: '550e8400-e29b-41d4-a716-446655440001',
      sku: '8850123456789',
      gtin: '08850123456789',
      nameEn: 'Paracetamol 500mg',
      nameMm: 'ပါရာစီတမော ၅၀၀ မီလီဂရမ်',
      genericName: 'Paracetamol',
      category: 'Analgesics',
      description: 'Relieves pain and fever',
      price: 500,
      unit: 'STRIP',
      minStockLevel: 50,
      requiresPrescription: false,
      imageUrl: 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&q=80&w=200',
      stockLevel: 150,
      batches: [
        {
          id: 'batch1',
          batchNumber: 'B001',
          expiryDate: new Date('2025-12-31'),
          quantity: 100,
          costPrice: 300,
        },
        {
          id: 'batch2',
          batchNumber: 'B002',
          expiryDate: new Date('2024-06-30'),
          quantity: 50,
          costPrice: 320,
        },
      ],
    },
    {
      id: 'p2',
      branchId: '550e8400-e29b-41d4-a716-446655440001',
      sku: '8859876543210',
      gtin: '08859876543210',
      nameEn: 'Amoxicillin 250mg',
      nameMm: 'အမောက်စီဆလင် ၂၅၀ မီလီဂရမ်',
      genericName: 'Amoxicillin',
      category: 'Antibiotics',
      description: 'Antibiotic for bacterial infections',
      price: 1500,
      unit: 'STRIP',
      minStockLevel: 30,
      requiresPrescription: true,
      stockLevel: 20,
      batches: [
        {
          id: 'batch3',
          batchNumber: 'B003',
          expiryDate: new Date('2024-03-15'),
          quantity: 20,
          costPrice: 1000,
        },
      ],
    },
    {
      id: 'p3',
      branchId: '550e8400-e29b-41d4-a716-446655440002',
      sku: '8851111111111',
      gtin: '08851111111111',
      nameEn: 'Vitamin C 1000mg',
      nameMm: 'ဗီတာမင် စီ ၁၀၀၀ မီလီဂရမ်',
      category: 'Vitamins',
      description: 'Immune system support',
      price: 3500,
      unit: 'BOTTLE',
      minStockLevel: 20,
      stockLevel: 200,
      batches: [
        {
          id: 'batch4',
          batchNumber: 'B004',
          expiryDate: new Date('2026-01-01'),
          quantity: 200,
          costPrice: 2000,
        },
      ],
    },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: {
        ...product,
        batches: {
          deleteMany: {},
          create: product.batches,
        },
      },
      create: {
        ...product,
        batches: {
          create: product.batches,
        },
      },
    });
  }

  const customers = [
    { id: 'c1', branchId: '550e8400-e29b-41d4-a716-446655440001', name: 'U Ba Maung', phone: '095123456', points: 1250, tier: 'Gold' },
    { id: 'c2', branchId: '550e8400-e29b-41d4-a716-446655440001', name: 'Daw Hla', phone: '097987654', points: 450, tier: 'Silver' },
    { id: 'c3', branchId: '550e8400-e29b-41d4-a716-446655440002', name: 'Ko Aung', phone: '092500112', points: 2100, tier: 'Platinum' },
  ];

  for (const customer of customers) {
    await prisma.customer.upsert({
      where: { id: customer.id },
      update: customer,
      create: customer,
    });
  }

  const suppliers = [
    { id: 's1', branchId: '550e8400-e29b-41d4-a716-446655440001', name: 'AA Medical', contact: '091234567', email: 'sales@aamedical.com', creditLimit: 1_000_000, outstanding: 300_000 },
    { id: 's2', branchId: '550e8400-e29b-41d4-a716-446655440001', name: 'Shwe Mi', contact: '098765432', email: 'info@shwemi.com', creditLimit: 500_000, outstanding: 0 },
  ];

  for (const supplier of suppliers) {
    await prisma.supplier.upsert({
      where: { id: supplier.id },
      update: supplier,
      create: supplier,
    });
  }

  await prisma.purchaseOrder.upsert({
    where: { id: 'po1' },
    update: {},
    create: {
      id: 'po1',
      branchId: '550e8400-e29b-41d4-a716-446655440001',
      supplierId: 's1',
      status: PurchaseStatus.RECEIVED,
      paymentType: PaymentMethod.CREDIT,
      totalAmount: 300_000,
      notes: 'Monthly restock',
      items: {
        create: [
          { id: 'pi1', productId: 'p1', name: 'Paracetamol 500mg', quantity: 1000, unitCost: 300 },
        ],
      },
    },
  });

  await prisma.distributionOrder.upsert({
    where: { id: 'ord1' },
    update: {},
    create: {
      id: 'ord1',
      branchId: '550e8400-e29b-41d4-a716-446655440001',
      customerName: 'City Mart',
      address: 'No 1, Pyay Rd',
      status: DistributionStatus.PENDING,
      total: 150_000,
      paymentType: PaymentMethod.CREDIT,
      items: {
        create: [
          { id: 'di1', productId: 'p1', name: 'Paracetamol', quantity: 100, price: 400 },
          { id: 'di2', productId: 'p3', name: 'Vitamin C', quantity: 50, price: 2200 },
        ],
      },
    },
  });

  await prisma.transaction.createMany({
    data: [
      { id: 't1', branchId: '550e8400-e29b-41d4-a716-446655440001', type: TransactionType.INCOME, category: 'Sales', amount: 15_000, date: new Date('2024-03-10'), description: 'Daily sales', paymentMethod: PaymentMethod.CASH },
      { id: 't2', branchId: '550e8400-e29b-41d4-a716-446655440001', type: TransactionType.EXPENSE, category: 'Utilities', amount: 50_000, date: new Date('2024-03-08'), description: 'Electricity Bill' },
      { id: 't3', branchId: '550e8400-e29b-41d4-a716-446655440002', type: TransactionType.INCOME, category: 'Sales', amount: 25_000, date: new Date('2024-03-11'), description: 'Daily sales', paymentMethod: PaymentMethod.KBZ_PAY },
    ],
    skipDuplicates: true,
  });

  await prisma.expense.createMany({
    data: [
      { id: 'e1', branchId: '550e8400-e29b-41d4-a716-446655440001', category: 'Rent', amount: 300_000, date: new Date('2024-03-01'), description: 'Shop rent', status: ExpenseStatus.PAID },
      { id: 'e2', branchId: '550e8400-e29b-41d4-a716-446655440001', category: 'Salary', amount: 150_000, date: new Date('2024-03-01'), description: 'Staff salary', status: ExpenseStatus.PAID },
      { id: 'e3', branchId: '550e8400-e29b-41d4-a716-446655440001', category: 'Maintenance', amount: 25_000, date: new Date('2024-03-10'), description: 'AC Repair', status: ExpenseStatus.PENDING },
    ],
    skipDuplicates: true,
  });

  await prisma.payable.create({
    data: {
      id: 'py1',
      branchId: '550e8400-e29b-41d4-a716-446655440001',
      supplierId: 's1',
      supplierName: 'AA Medical',
      invoiceNo: 'INV-001',
      amount: 300_000,
      dueDate: new Date('2024-03-31'),
      status: AgingStatus.DUE_SOON,
    },
  });

  await prisma.receivable.create({
    data: {
      id: 'rc1',
      branchId: '550e8400-e29b-41d4-a716-446655440001',
      customerName: 'City Mart',
      orderRef: 'ord1',
      amount: 150_000,
      dueDate: new Date('2024-03-20'),
      status: AgingStatus.NORMAL,
    },
  });

  await prisma.appSetting.upsert({
    where: { id: 1 },
    update: {},
    create: {},
  });

  console.info('✅ Seed data inserted');
}

seed()
  .catch((error) => {
    console.error('❌ Seed error', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

