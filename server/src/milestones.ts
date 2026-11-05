import { Router, Request } from 'express';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { MilestoneStatus as S, Role, Verdict } from '@prisma/client';
import { prisma } from './db';
import { requireAuth } from './auth';
import { assertTransition } from './stateMachine';
import { capturePartial, sendPayout } from './paypal';
import { verifyPhoto } from './verify';

export const milestonesRouter = Router();

const MAX_DISTANCE_M = 200;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const idOf = (req: Request) => String(req.params.id);
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// The only place a milestone status changes. Illegal moves become 409s.
async function setStatus(id: string, from: S, to: S) {
  try {
    assertTransition(from, to);
  } catch (e: any) {
    throw httpError(409, e.message);
  }
  const r = await prisma.milestone.updateMany({ where: { id, status: from }, data: { status: to } });
  if (r.count !== 1) throw httpError(409, 'Milestone status changed, please retry');
}

async function loadMilestone(id: string, userId: string) {
  const m = await prisma.milestone.findUnique({
    where: { id },
    include: { job: { include: { milestones: true } } },
  });
  if (!m || (m.job.clientId !== userId && m.job.workerId !== userId)) return null;
  return m;
}

// APPROVED -> capture -> payout -> RELEASED. Safe to call again after a failure.
async function release(milestoneId: string) {
  const m = await prisma.milestone.findUniqueOrThrow({
    where: { id: milestoneId },
    include: { job: { include: { worker: true } }, payment: true },
  });
  if (m.status === 'RELEASED') return;
  if (m.status !== 'APPROVED') throw httpError(409, `Milestone is ${m.status}, not APPROVED`);
  const job = m.job;
  if (!job.paypalAuthId) throw httpError(409, 'Job has no PayPal authorization (not funded)');

  const amount = m.amount.toFixed(2);
  let payment =
    m.payment ?? (await prisma.payment.create({ data: { milestoneId: m.id, amount: m.amount, status: 'PENDING' } }));

  if (!payment.captureId) {
    const cap = await capturePartial(job.paypalAuthId, amount, job.currency, `capture-${m.id}`);
    payment = await prisma.payment.update({
      where: { id: payment.id },
      data: { captureId: cap.captureId, status: 'CAPTURED' },
    });
  }
  if (!payment.payoutId) {
    const receiver = process.env.PAYOUT_RECEIVER_EMAIL || job.worker!.email;
    const p = await sendPayout(receiver, amount, job.currency, m.id);
    payment = await prisma.payment.update({
      where: { id: payment.id },
      data: { payoutId: p.batchId, status: 'PAYOUT_SENT' },
    });
  }

  await setStatus(m.id, 'APPROVED', 'RELEASED');

  const remaining = await prisma.milestone.count({ where: { jobId: job.id, status: { not: 'RELEASED' } } });
  if (remaining === 0) {
    await prisma.job.update({ where: { id: job.id }, data: { status: 'COMPLETED' } });
    await prisma.reputationEvent.create({
      data: { workerId: job.workerId!, jobId: job.id, outcome: 'COMPLETED' },
    });
  }
}

// Worker starts a milestone (also restarts a disputed one). Earlier milestones must be released first.
milestonesRouter.post('/:id/start', requireAuth(Role.WORKER), async (req, res) => {
  const m = await loadMilestone(idOf(req), req.user!.id);
  if (!m || m.job.workerId !== req.user!.id) return res.status(404).json({ error: 'Milestone not found' });
  if (m.job.status !== 'FUNDED') return res.status(409).json({ error: 'Job is not funded yet' });
  const blocking = m.job.milestones.filter((x) => x.position < m.position && x.status !== 'RELEASED');
  if (blocking.length) return res.status(409).json({ error: 'Earlier milestones must be released first' });
  await setStatus(m.id, m.status, 'ACTIVE');
  res.json({ id: m.id, status: 'ACTIVE' });
});

const submitSchema = z.object({
  photoBase64: z.string().min(100),
  capturedAt: z.string().min(1),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

// Worker submits photo evidence. Rule-based flags decide SUBMITTED -> UNDER_REVIEW or FLAGGED.
milestonesRouter.post('/:id/submit', requireAuth(Role.WORKER), async (req, res) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid submission', details: parsed.error.issues });
  const d = parsed.data;

  const m = await loadMilestone(idOf(req), req.user!.id);
  if (!m || m.job.workerId !== req.user!.id) return res.status(404).json({ error: 'Milestone not found' });
  if (m.status !== 'ACTIVE' && m.status !== 'FLAGGED') {
    return res.status(409).json({ error: `Cannot submit while milestone is ${m.status}` });
  }

  const capturedAt = new Date(d.capturedAt);
  if (Number.isNaN(capturedAt.getTime())) return res.status(400).json({ error: 'capturedAt is not a valid date' });

  const flags: string[] = [];
  const age = Date.now() - capturedAt.getTime();
  if (age > MAX_AGE_MS) flags.push('STALE_PHOTO');
  if (age < -5 * 60 * 1000) flags.push('FUTURE_TIMESTAMP');

  let distanceM: number | null = null;
  if (d.lat == null || d.lng == null) {
    flags.push('NO_LOCATION');
  } else if (m.job.siteLat != null && m.job.siteLng != null) {
    distanceM = haversineM(d.lat, d.lng, m.job.siteLat, m.job.siteLng);
    if (distanceM > MAX_DISTANCE_M) flags.push('LOCATION_FAR');
  }

  const raw = d.photoBase64.replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length === 0 || buf.length > 8 * 1024 * 1024) {
    return res.status(400).json({ error: 'Photo is empty or larger than 8 MB' });
  }
  let aiVerdict: string | null = null;
  let aiReason: string | null = null;
  let aiConfidence: number | null = null;
  try {
    const v = await verifyPhoto(m.criteria, raw);
    aiVerdict = v.verdict;
    aiReason = v.reason;
    aiConfidence = v.confidence;
    if (v.verdict === 'NO_MATCH') flags.push('AI_NO_MATCH');
  } catch (e) {
    console.error('photo check failed:', (e as Error).message);
  }

  const dir = path.join(__dirname, '..', 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  const file = `${m.id}-${Date.now()}.jpg`;
  fs.writeFileSync(path.join(dir, file), buf);

  const submission = await prisma.submission.create({
    data: {
      milestoneId: m.id,
      photoPath: `uploads/${file}`,
      capturedAt,
      lat: d.lat,
      lng: d.lng,
      distanceM,
      flags,
    },
  });

  if (aiVerdict && aiReason != null && aiConfidence != null) {
    const verdictMap: Record<string, Verdict> = { MATCH: 'MATCHES', PARTIAL: 'UNCLEAR', NO_MATCH: 'MISMATCH' };
    try {
      await prisma.aiReport.create({
        data: {
          submissionId: submission.id,
          verdict: verdictMap[aiVerdict],
          confidence: aiConfidence,
          summary: aiReason,
        },
      });
    } catch (e) {
      console.error('saving AI report failed:', (e as Error).message);
    }
  }

  await setStatus(m.id, m.status, 'SUBMITTED');
  const next: S = flags.length ? 'FLAGGED' : 'UNDER_REVIEW';
  await setStatus(m.id, 'SUBMITTED', next);

  res.status(201).json({ submissionId: submission.id, status: next, flags, distanceM, aiVerdict, aiReason });
});

// Client approves: money moves only here (or on /release retry), never on an AI verdict alone.
milestonesRouter.post('/:id/approve', requireAuth(Role.CLIENT), async (req, res) => {
  const m = await loadMilestone(idOf(req), req.user!.id);
  if (!m || m.job.clientId !== req.user!.id) return res.status(404).json({ error: 'Milestone not found' });

  await setStatus(m.id, m.status, 'APPROVED');
  try {
    await release(m.id);
  } catch (e: any) {
    const status = e?.status ?? (e?.paypal ? 502 : 500);
    return res.status(status).json({
      error: e.message,
      milestoneStatus: 'APPROVED',
      hint: `Approved but not paid yet. Retry with POST /api/milestones/${m.id}/release`,
    });
  }
  res.json({ id: m.id, status: 'RELEASED' });
});

// Retry the payment step for an APPROVED milestone (safe: capture and payout are idempotent).
milestonesRouter.post('/:id/release', requireAuth(Role.CLIENT), async (req, res) => {
  const m = await loadMilestone(idOf(req), req.user!.id);
  if (!m || m.job.clientId !== req.user!.id) return res.status(404).json({ error: 'Milestone not found' });
  await release(m.id);
  res.json({ id: m.id, status: 'RELEASED' });
});

// Client disputes the evidence. The worker can restart the milestone with /start.
milestonesRouter.post('/:id/dispute', requireAuth(Role.CLIENT), async (req, res) => {
  const m = await loadMilestone(idOf(req), req.user!.id);
  if (!m || m.job.clientId !== req.user!.id) return res.status(404).json({ error: 'Milestone not found' });
  await setStatus(m.id, m.status, 'DISPUTED');
  res.json({ id: m.id, status: 'DISPUTED' });
});

// Newest photo for a milestone. Only the job's client or worker may see it.
milestonesRouter.get('/:id/photo', requireAuth(), async (req, res) => {
  const m = await loadMilestone(idOf(req), req.user!.id);
  if (!m) return res.status(404).json({ error: 'Milestone not found' });
  const sub = await prisma.submission.findFirst({
    where: { milestoneId: m.id },
    orderBy: { createdAt: 'desc' },
  });
  if (!sub) return res.status(404).json({ error: 'No photo submitted yet' });
  const uploads = path.join(__dirname, '..', 'uploads');
  const file = path.join(__dirname, '..', sub.photoPath);
  if (!file.startsWith(uploads) || !fs.existsSync(file)) {
    return res.status(404).json({ error: 'Photo file not found' });
  }
  res.sendFile(file);
});

milestonesRouter.get('/:id', requireAuth(), async (req, res) => {
  const m = await loadMilestone(idOf(req), req.user!.id);
  if (!m) return res.status(404).json({ error: 'Milestone not found' });
  const full = await prisma.milestone.findUnique({
    where: { id: m.id },
    include: { submissions: { orderBy: { createdAt: 'desc' }, include: { reports: true } }, payment: true },
  });
  res.json({ milestone: full });
});
