import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { requireAuth } from '../../middleware/auth';

const supplierSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().min(2),
  contact: z.string().optional(),
  email: z.string().email().optional(),
  creditLimit: z.number().int().nonnegative().default(0),
  outstanding: z.number().int().nonnegative().default(0),
});

export const supplierRouter = Router();

supplierRouter.use(requireAuth);

supplierRouter.get('/', async (req, res, next) => {
  try {
    const { branchId } = req.query;
    const suppliers = await prisma.supplier.findMany({
      where: branchId ? { branchId: String(branchId) } : undefined,
      orderBy: { name: 'asc' },
    });
    res.json({ suppliers });
  } catch (error) {
    next(error);
  }
});

supplierRouter.post('/', async (req, res, next) => {
  try {
    const input = supplierSchema.parse(req.body);
    const supplier = await prisma.supplier.create({
      data: input,
    });
    res.status(201).json({ supplier });
  } catch (error) {
    next(error);
  }
});

supplierRouter.patch('/:id', async (req, res, next) => {
  try {
    const input = supplierSchema.partial().parse(req.body);
    const supplier = await prisma.supplier.update({
      where: { id: req.params.id },
      data: input,
    });
    res.json({ supplier });
  } catch (error) {
    next(error);
  }
});

supplierRouter.delete('/:id', async (req, res, next) => {
  try {
    await prisma.supplier.delete({
      where: { id: req.params.id },
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});


