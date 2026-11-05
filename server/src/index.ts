import './env'; // must stay the first import
import express from 'express';
import cors from 'cors';
import { prisma } from './db';
import { authRouter } from './auth';
import { jobsRouter } from './jobs';
import { milestonesRouter } from './milestones';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', async (_req, res) => {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {}
  res.json({ ok: true, db, time: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/milestones', milestonesRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(err?.status ?? (err?.paypal ? 502 : 500)).json({ error: err?.message ?? 'Server error' });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`API on http://localhost:${port}`));
