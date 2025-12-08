import { DistributionStatus } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { createError } from '../../lib/http-error';
import { requireAuth } from '../../middleware/auth';

const distributionItemSchema = z.object({
  productId: z.string().uuid().optional(),
  name: z.string().min(2),
  quantity: z.number().int().positive(),
  price: z.number().int().nonnegative(),
});

const orderSchema = z.object({
  branchId: z.string().uuid(),
  customerName: z.string().min(2),
  address: z.string().min(2),
  paymentType: z.enum(['CASH', 'CARD', 'KBZ_PAY', 'CREDIT']),
  status: z.nativeEnum(DistributionStatus).default(DistributionStatus.PENDING),
  deliveryTime: z.string().optional(),
  total: z.number().int().nonnegative(),
  items: z.array(distributionItemSchema).min(1),
});

export const distributionRouter = Router();

distributionRouter.use(requireAuth);

distributionRouter.get('/', async (req, res, next) => {
  try {
    const { branchId } = req.query;
    const orders = await prisma.distributionOrder.findMany({
      where: branchId ? { branchId: String(branchId) } : undefined,
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ orders });
  } catch (error) {
    next(error);
  }
});

distributionRouter.post('/', async (req, res, next) => {
  try {
    const input = orderSchema.parse(req.body);
    const order = await prisma.distributionOrder.create({
      data: {
        ...input,
        items: { create: input.items },
      },
      include: { items: true },
    });
    res.status(201).json({ order });
  } catch (error) {
    next(error);
  }
});

distributionRouter.patch('/:id', async (req, res, next) => {
  try {
    const input = orderSchema.partial().parse(req.body);
    const existing = await prisma.distributionOrder.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      throw createError(404, 'Order not found');
    }
    const order = await prisma.distributionOrder.update({
      where: { id: req.params.id },
      data: {
        ...input,
        items: input.items
          ? {
              deleteMany: {},
              create: input.items,
            }
          : undefined,
      },
      include: { items: true },
    });
    res.json({ order });
  } catch (error) {
    next(error);
  }
});

distributionRouter.post('/:id/status', async (req, res, next) => {
  try {
    const payload = z
      .object({
        status: z.nativeEnum(DistributionStatus),
      })
      .parse(req.body);

    const order = await prisma.distributionOrder.update({
      where: { id: req.params.id },
      data: { status: payload.status },
    });

    res.json({ order });
  } catch (error) {
    next(error);
  }
});

distributionRouter.delete('/:id', async (req, res, next) => {
  try {
    const existing = await prisma.distributionOrder.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      throw createError(404, 'Order not found');
    }

    await prisma.distributionOrder.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

