import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { createError } from '../../lib/http-error';
import { requireAuth } from '../../middleware/auth';

const productSchema = z.object({
  branchId: z.string().uuid(),
  sku: z.string().min(4),
  gtin: z.string().min(4).optional(),
  nameEn: z.string().min(2),
  nameMm: z.string().min(2),
  genericName: z.string().optional(),
  category: z.string().min(2),
  description: z.string().optional(),
  price: z.number().int().nonnegative(),
  unit: z.string().min(1),
  minStockLevel: z.number().int().nonnegative().default(0),
  requiresPrescription: z.boolean().default(false),
  imageUrl: z.string().url().optional(),
  location: z.string().optional(),
});

const batchSchema = z.object({
  batchNumber: z.string().min(1),
  expiryDate: z.string().transform((val) => new Date(val)),
  quantity: z.number().int(),
  costPrice: z.number().int().nonnegative(),
});

export const productRouter = Router();

productRouter.use(requireAuth);

productRouter.get('/', async (req, res, next) => {
  try {
    const { branchId } = req.query;
    const products = await prisma.product.findMany({
      where: branchId ? { branchId: String(branchId) } : undefined,
      include: { batches: true },
      orderBy: { nameEn: 'asc' },
    });
    res.json({ products });
  } catch (error) {
    next(error);
  }
});

productRouter.post('/', async (req, res, next) => {
  try {
    const input = productSchema.parse(req.body);
    const product = await prisma.product.create({
      data: input,
    });
    res.status(201).json({ product });
  } catch (error) {
    next(error);
  }
});

productRouter.patch('/:id', async (req, res, next) => {
  try {
    const input = productSchema.partial().parse(req.body);
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: input,
    });
    res.json({ product });
  } catch (error) {
    next(error);
  }
});

productRouter.delete('/:id', async (req, res, next) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

productRouter.post('/:id/batches', async (req, res, next) => {
  try {
    const input = batchSchema.parse(req.body);
    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) {
      throw createError(404, 'Product not found');
    }

    const batch = await prisma.productBatch.upsert({
      where: {
        productId_batchNumber: {
          productId: req.params.id,
          batchNumber: input.batchNumber,
        },
      },
      update: {
        ...input,
      },
      create: {
        productId: req.params.id,
        ...input,
      },
    });

    res.status(201).json({ batch });
  } catch (error) {
    next(error);
  }
});

productRouter.post('/:id/stock-adjust', async (req, res, next) => {
  try {
    const payload = z
      .object({
        quantity: z.number().int(),
        batchNumber: z.string().optional(),
        expiryDate: z.string().optional(),
        costPrice: z.number().int().nonnegative().optional(),
        location: z.string().optional(),
        unit: z.string().optional(),
      })
      .parse(req.body);

    const product = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) {
      throw createError(404, 'Product not found');
    }

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: req.params.id },
        data: {
          stockLevel: product.stockLevel + payload.quantity,
          location: payload.location ?? undefined,
          unit: payload.unit ?? undefined,
        },
      });

      if (payload.batchNumber) {
        await tx.productBatch.upsert({
          where: {
            productId_batchNumber: {
              productId: req.params.id,
              batchNumber: payload.batchNumber,
            },
          },
          update: {
            quantity: { increment: payload.quantity },
            expiryDate: payload.expiryDate ? new Date(payload.expiryDate) : undefined,
            costPrice: payload.costPrice ?? undefined,
          },
          create: {
            productId: req.params.id,
            batchNumber: payload.batchNumber,
            expiryDate: payload.expiryDate ? new Date(payload.expiryDate) : new Date(new Date().setFullYear(new Date().getFullYear() + 1)), // Default 1 year expiry if not provided
            quantity: payload.quantity,
            costPrice: payload.costPrice ?? 0,
          },
        });
      }
    });

    res.json({ message: 'Stock updated' });
  } catch (error) {
    next(error);
  }
});

