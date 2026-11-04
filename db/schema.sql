-- Milestones track work units; ledger rows record each related PayPal action.
CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  worker_email TEXT NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  order_id TEXT,
  auth_id TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS milestones (
  id SERIAL PRIMARY KEY,
  job_id INT REFERENCES jobs(id),
  title TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
);
CREATE TABLE IF NOT EXISTS ledger (
  id SERIAL PRIMARY KEY,
  job_id INT REFERENCES jobs(id),
  milestone_id INT REFERENCES milestones(id),
  type TEXT NOT NULL,
  amount NUMERIC(12,2),
  paypal_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
