import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from './db';
import { requireAuth } from './auth';
import { createAuthorizeOrder, authorizeOrder } from './paypal';

export const jobsRouter = Router();

const money = (cents: number) => (cents / 100).toFixed(2);

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  workerEmail: z.string().email(),
  siteLat: z.number().optional(),
  siteLng: z.number().optional(),
  currency: z.string().length(3).default('USD'),
  autoApproveLimit: z.number().min(0).default(0),
  milestones: z
    .array(z.object({ title: z.string().min(1), amount: z.number().positive(), criteria: z.string().min(1) }))
    .min(1),
});

// Client creates a job. Total is computed from the milestones, never taken from the client.
jobsRouter.post('/', requireAuth(Role.CLIENT), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid job', details: parsed.error.issues });
  const d = parsed.data;

  const worker = await prisma.user.findUnique({ where: { email: d.workerEmail } });
  if (!worker || worker.role !== Role.WORKER) {
    return res.status(400).json({ error: 'workerEmail must belong to a worker account' });
  }

  const cents = d.milestones.map((m) => Math.round(m.amount * 100));
  const total = cents.reduce((a, b) => a + b, 0);

  const job = await prisma.job.create({
    data: {
      title: d.title,
      description: d.description,
      clientId: req.user!.id,
      workerId: worker.id,
      siteLat: d.siteLat,
      siteLng: d.siteLng,
      currency: d.currency.toUpperCase(),
      autoApproveLimit: money(Math.round(d.autoApproveLimit * 100)),
      totalAmount: money(total),
      milestones: {
        create: d.milestones.map((m, i) => ({
          position: i + 1,
          title: m.title,
          amount: money(cents[i]),
          criteria: m.criteria,
        })),
      },
    },
    include: { milestones: { orderBy: { position: 'asc' } } },
  });
  res.status(201).json({ job });
});

// Jobs where I am the client or the worker
jobsRouter.get('/', requireAuth(), async (req, res) => {
  const me = req.user!.id;
  const jobs = await prisma.job.findMany({
    where: { OR: [{ clientId: me }, { workerId: me }] },
    orderBy: { createdAt: 'desc' },
    include: { milestones: { orderBy: { position: 'asc' } } },
  });
  res.json({ jobs });
});

jobsRouter.get('/:id', requireAuth(), async (req, res) => {
  const me = req.user!.id;
  const job = await prisma.job.findUnique({
    where: { id: String(req.params.id) },
    include: { milestones: { orderBy: { position: 'asc' } } },
  });
  if (!job || (job.clientId !== me && job.workerId !== me)) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({ job });
});

// Step A: create the PayPal order. Client opens approveUrl and approves once.
jobsRouter.post('/:id/fund', requireAuth(Role.CLIENT), async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: String(req.params.id) } });
  if (!job || job.clientId !== req.user!.id) return res.status(404).json({ error: 'Job not found' });
  if (job.paypalAuthId) return res.status(409).json({ error: 'Job is already funded' });
  if (job.status !== 'DRAFT' && job.status !== 'AWAITING_FUNDING') {
    return res.status(409).json({ error: `Cannot fund a job in status ${job.status}` });
  }

  const { orderId, approveUrl } = await createAuthorizeOrder(job.totalAmount.toFixed(2), job.currency, job.id);
  await prisma.job.update({
    where: { id: job.id },
    data: { paypalOrderId: orderId, status: 'AWAITING_FUNDING' },
  });
  res.json({ orderId, approveUrl });
});

// Step B: after the client approved, authorize the order and mark the job funded.
jobsRouter.post('/:id/confirm-funding', requireAuth(Role.CLIENT), async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: String(req.params.id) } });
  if (!job || job.clientId !== req.user!.id) return res.status(404).json({ error: 'Job not found' });

  if (job.paypalAuthId) {
    return res.json({ job }); // already confirmed, safe to call again
  }
  if (!job.paypalOrderId || job.status !== 'AWAITING_FUNDING') {
    return res.status(409).json({ error: 'Call /fund first' });
  }

  const authId = await authorizeOrder(job.paypalOrderId);
  const updated = await prisma.job.update({
    where: { id: job.id },
    data: { paypalAuthId: authId, status: 'FUNDED' },
    include: { milestones: { orderBy: { position: 'asc' } } },
  });
  res.json({ job: updated });
});
