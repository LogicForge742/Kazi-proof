import express from "express";
import { q, one } from "./db.mjs";
import * as pp from "./paypal.mjs";

const app = express();
app.use(express.json());
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

// Route handlers share one error path for logging and JSON error responses.
const h = (fn) => (req, res) => fn(req, res).catch((e) => {
  console.error(e.data || e);
  res.status(500).json({ error: e.message, detail: e.data });
});
const log = (jobId, mId, type, amount, ref) =>
  q("INSERT INTO ledger (job_id, milestone_id, type, amount, paypal_id) VALUES ($1,$2,$3,$4,$5)",
    [jobId, mId, type, amount, ref]);
const getJob = (id) => one("SELECT * FROM jobs WHERE id=$1", [id]);

app.post("/jobs", h(async (req, res) => {
  const { title, worker_email, milestones } = req.body;
  const total = milestones.reduce((s, m) => s + m.amount, 0);
  const job = await one(
    "INSERT INTO jobs (title, worker_email, total) VALUES ($1,$2,$3) RETURNING *",
    [title, worker_email, total]);
  for (const m of milestones)
    await q("INSERT INTO milestones (job_id, title, amount) VALUES ($1,$2,$3)", [job.id, m.title, m.amount]);
  res.status(201).json(job);
}));

app.post("/jobs/:id/fund", h(async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job || job.status !== "DRAFT") return res.status(409).json({ error: "job not fundable" });
  const order = await pp.createOrder(job.total,
    `${BASE_URL}/paypal/return?job=${job.id}`, `${BASE_URL}/jobs/${job.id}`);
  await q("UPDATE jobs SET order_id=$1 WHERE id=$2", [order.id, job.id]);
  res.json({ approve_url: order.links.find((l) => l.rel === "payer-action").href });
}));

app.get("/paypal/return", h(async (req, res) => {
  const job = await getJob(req.query.job);
  if (!job || job.order_id !== req.query.token) return res.sendStatus(400);
  if (job.status === "DRAFT") {
    // Keep the authorization ID so later milestone captures use the same authorization.
    const auth = await pp.authorizeOrder(job.order_id);
    const authId = auth.purchase_units[0].payments.authorizations[0].id;
    await q("UPDATE jobs SET auth_id=$1, expires_at=now() + interval '29 days', status='FUNDED' WHERE id=$2",
      [authId, job.id]);
    await log(job.id, null, "AUTHORIZE", job.total, authId);
  }
  res.redirect(`/jobs/${job.id}`);
}));

app.post("/milestones/:id/release", h(async (req, res) => {
  const m = await one("SELECT * FROM milestones WHERE id=$1", [req.params.id]);
  if (!m) return res.sendStatus(404);
  const job = await getJob(m.job_id);
  if (job.status !== "FUNDED" || m.status === "RELEASED")
    return res.status(409).json({ error: "not releasable" });

  if (m.status === "PENDING") {
    // Mark the last milestone capture as final so PayPal closes the authorization.
    const { c } = await one("SELECT COUNT(*)::int c FROM milestones WHERE job_id=$1 AND status='PENDING'", [job.id]);
    const cap = await pp.capture(job.auth_id, m.amount, c === 1, `release-${m.id}`);
    await log(job.id, m.id, "CAPTURE", m.amount, cap.id);
    await q("UPDATE milestones SET status='CAPTURED' WHERE id=$1", [m.id]);
  }
  const po = await pp.payout(job.worker_email, m.amount, `payout-${m.id}`, m.title);
  await log(job.id, m.id, "PAYOUT", m.amount, po.batch_header.payout_batch_id);
  await q("UPDATE milestones SET status='RELEASED' WHERE id=$1", [m.id]);

  const { c: left } = await one("SELECT COUNT(*)::int c FROM milestones WHERE job_id=$1 AND status!='RELEASED'", [job.id]);
  if (left === 0) await q("UPDATE jobs SET status='COMPLETED' WHERE id=$1", [job.id]);
  res.json({ released: m.id, job_complete: left === 0 });
}));

app.post("/jobs/:id/cancel", h(async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job || job.status !== "FUNDED") return res.status(409).json({ error: "not cancellable" });
  await pp.voidAuth(job.auth_id);
  await log(job.id, null, "VOID", null, job.auth_id);
  await q("UPDATE jobs SET status='CANCELLED' WHERE id=$1", [job.id]);
  res.json({ cancelled: job.id });
}));

app.get("/jobs/:id", h(async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) return res.sendStatus(404);
  res.json({
    job,
    milestones: await q("SELECT * FROM milestones WHERE job_id=$1 ORDER BY id", [job.id]),
    ledger: await q("SELECT * FROM ledger WHERE job_id=$1 ORDER BY id", [job.id]),
  });
}));

app.listen(3000, () => console.log("Kazi-proof on :3000"));
