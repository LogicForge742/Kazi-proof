import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

dotenv.config({ path: '../.env' }); // ignored on hosts that set real env vars

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json());

// Return database readiness separately to make API and database outages distinguishable.
app.get('/api/health', async (_req, res) => {
  let db = false;
  try { await prisma.$queryRaw`SELECT 1`; db = true; } catch {}
  res.json({ ok: true, db, time: new Date().toISOString() });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => console.log(`API on http://localhost:${port}`));