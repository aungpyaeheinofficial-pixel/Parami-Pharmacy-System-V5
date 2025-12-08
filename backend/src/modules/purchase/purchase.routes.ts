import { PaymentMethod, PurchaseStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { createError } from '../../lib/http-error';
import { requireAuth } from '../../middleware/auth';

const purchaseItemSchema = z.object({
  productId: z.string().uuid().optional(),
  name: z.string().min(2),
  quantity: z.number().int().positive(),
  unitCost: z.number().int().nonnegative(),
});

const purchaseSchema = z.object({
  branchId: z.string().uuid(),
  supplierId: z.string().uuid(),
  status: z.nativeEnum(PurchaseStatus).default(PurchaseStatus.PENDING),
  paymentType: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
  date: z.string().optional(),
  notes: z.string().optional(),
  totalAmount: z.number().int().nonnegative(),
  items: z.array(purchaseItemSchema).min(1),
});

export const purchaseRouter = Router();

purchaseRouter.use(requireAuth);

purchaseRouter.get('/', async (req, res, next) => {
  try {
    const { branchId } = req.query;
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      where: branchId ? { branchId: String(branchId) } : undefined,
      include: { supplier: true, items: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ purchaseOrders });
  } catch (error) {
    next(error);
  }
});

purchaseRouter.post('/', async (req, res, next) => {
  try {
    const input = purchaseSchema.parse(req.body);
    const po = await prisma.purchaseOrder.create({
      data: {
        ...input,
        date: input.date ? new Date(input.date) : undefined,
        items: { create: input.items },
      },
      include: { items: true },
    });
    res.status(201).json({ purchaseOrder: po });
  } catch (error) {
    next(error);
  }
});

purchaseRouter.patch('/:id', async (req, res, next) => {
  try {
    const input = purchaseSchema.partial().parse(req.body);
    const existing = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      throw createError(404, 'Purchase order not found');
    }
    const po = await prisma.purchaseOrder.update({
      where: { id: req.params.id },
      data: {
        ...input,
        date: input.date ? new Date(input.date) : undefined,
        items: input.items
          ? {
              deleteMany: {},
              create: input.items,
            }
          : undefined,
      },
      include: { items: true },
    });
    res.json({ purchaseOrder: po });
  } catch (error) {
    next(error);
  }
});

purchaseRouter.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      throw createError(404, 'Purchase order not found');
    }

    await prisma.purchaseOrder.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

