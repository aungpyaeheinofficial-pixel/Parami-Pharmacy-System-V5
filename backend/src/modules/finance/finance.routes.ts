import { AgingStatus, ExpenseStatus, PaymentMethod, TransactionType } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { requireAuth } from '../../middleware/auth';

const transactionSchema = z.object({
  branchId: z.string().uuid(),
  type: z.nativeEnum(TransactionType),
  category: z.string().min(2),
  amount: z.number().int(),
  date: z.string().optional(),
  description: z.string().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
});

const expenseSchema = z.object({
  branchId: z.string().uuid(),
  category: z.string().min(2),
  amount: z.number().int(),
  date: z.string(),
  description: z.string().optional(),
  status: z.nativeEnum(ExpenseStatus).default(ExpenseStatus.PENDING),
});

const agingSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().min(2),
  reference: z.string().min(2),
  amount: z.number().int(),
  dueDate: z.string(),
  status: z.nativeEnum(AgingStatus).default(AgingStatus.NORMAL),
});

export const financeRouter = Router();

financeRouter.use(requireAuth);

financeRouter.get('/transactions', async (req, res, next) => {
  try {
    const { branchId } = req.query;
    const transactions = await prisma.transaction.findMany({
      where: branchId ? { branchId: String(branchId) } : undefined,
      orderBy: { date: 'desc' },
    });
    res.json({ transactions });
  } catch (error) {
    next(error);
  }
});

financeRouter.post('/transactions', async (req, res, next) => {
  try {
    const input = transactionSchema.parse(req.body);
    const transaction = await prisma.transaction.create({
      data: {
        ...input,
        date: input.date ? new Date(input.date) : undefined,
      },
    });
    res.status(201).json({ transaction });
  } catch (error) {
    next(error);
  }
});

financeRouter.get('/expenses', async (req, res, next) => {
  try {
    const { branchId } = req.query;
    const expenses = await prisma.expense.findMany({
      where: branchId ? { branchId: String(branchId) } : undefined,
      orderBy: { date: 'desc' },
    });
    res.json({ expenses });
  } catch (error) {
    next(error);
  }
});

financeRouter.post('/expenses', async (req, res, next) => {
  try {
    const input = expenseSchema.parse(req.body);
    const expense = await prisma.expense.create({
      data: {
        ...input,
        date: new Date(input.date),
      },
    });
    res.status(201).json({ expense });
  } catch (error) {
    next(error);
  }
});

financeRouter.delete('/expenses/:id', async (req, res, next) => {
  try {
    await prisma.expense.delete({
      where: { id: req.params.id },
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

financeRouter.get('/payables', async (req, res, next) => {
  try {
    const { branchId } = req.query;
    const payables = await prisma.payable.findMany({
      where: branchId ? { branchId: String(branchId) } : undefined,
      orderBy: { dueDate: 'asc' },
      include: { supplier: true },
    });
    res.json({ payables });
  } catch (error) {
    next(error);
  }
});

financeRouter.post('/payables', async (req, res, next) => {
  try {
    const input = agingSchema.extend({ supplierId: z.string().uuid().optional() }).parse(req.body);
    const payable = await prisma.payable.create({
      data: {
        branchId: input.branchId,
        supplierId: input.supplierId,
        supplierName: input.name,
        invoiceNo: input.reference,
        amount: input.amount,
        dueDate: new Date(input.dueDate),
        status: input.status,
      },
    });
    res.status(201).json({ payable });
  } catch (error) {
    next(error);
  }
});

financeRouter.delete('/payables/:id', async (req, res, next) => {
  try {
    await prisma.payable.delete({
      where: { id: req.params.id },
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

financeRouter.get('/receivables', async (req, res, next) => {
  try {
    const { branchId } = req.query;
    const receivables = await prisma.receivable.findMany({
      where: branchId ? { branchId: String(branchId) } : undefined,
      orderBy: { dueDate: 'asc' },
    });
    res.json({ receivables });
  } catch (error) {
    next(error);
  }
});

financeRouter.post('/receivables', async (req, res, next) => {
  try {
    const input = agingSchema.parse(req.body);
    const receivable = await prisma.receivable.create({
      data: {
        branchId: input.branchId,
        customerName: input.name,
        orderRef: input.reference,
        amount: input.amount,
        dueDate: new Date(input.dueDate),
        status: input.status,
      },
    });
    res.status(201).json({ receivable });
  } catch (error) {
    next(error);
  }
});

financeRouter.delete('/receivables/:id', async (req, res, next) => {
  try {
    await prisma.receivable.delete({
      where: { id: req.params.id },
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

