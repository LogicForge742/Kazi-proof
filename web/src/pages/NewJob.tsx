import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import Layout from '../components/Layout';
import { Button, Card, money } from '../components/ui';
import SiteLocationField from '../components/SiteLocationField';
import type { LatLng } from '../location';

type PlanMilestone = { title: string; amount: number; criteria: string };
type Plan = { title: string; milestones: PlanMilestone[] };

export default function NewJob() {
  const [description, setDescription] = useState('');
  const [total, setTotal] = useState('100');
  const [workerEmail, setWorkerEmail] = useState('worker@kazi.demo');
  const [site, setSite] = useState<LatLng | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function preview() {
    setBusy('preview');
    setError('');
    try {
      const d = await api<{ plan: Plan }>('/api/jobs/scope', {
        body: { description, totalAmount: Number(total) },
      });
      setPlan(d.plan);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function createAndFund() {
    if (!plan || !site) return;
    setBusy('create');
    setError('');
    try {
      const { job } = await api<{ job: { id: string } }>('/api/jobs', {
        body: { title: plan.title, description, workerEmail, siteLat: site.lat, siteLng: site.lng, milestones: plan.milestones },
      });
      const { approveUrl } = await api<{ approveUrl: string }>(`/api/jobs/${job.id}/fund`, { method: 'POST' });
      window.location.href = approveUrl;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  return (
    <Layout
      right={
        <Link to="/" className="text-xs sm:text-sm text-[#8ca89b] hover:text-white transition">
          ← Back to jobs
        </Link>
      }
    >
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">Create a new job</h1>
          <p className="mt-1 text-xs sm:text-sm text-[#8ca89b]">
            Describe the project and let AI automatically generate verifiable milestones.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-[#1f0d12] px-4 py-3 text-xs sm:text-sm text-rose-300 shadow-lg">
            {error}
          </div>
        )}

        <Card className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#8ca89b] mb-2">
              Work Description
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Build 2 wooden desks with sanded finish, frames assembled, and delivered to location."
              className="w-full rounded-xl border border-[#1f3b2f] bg-[#07130e] p-3 text-sm text-[#f0fdf4] placeholder-[#415e51] focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#8ca89b] mb-2">
                Total Budget (USD)
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-sm text-[#526f62] font-mono">$</span>
                <input
                  type="number"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  className="w-full rounded-xl border border-[#1f3b2f] bg-[#07130e] py-2.5 pl-8 pr-3 text-sm text-[#f0fdf4] font-mono focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#8ca89b] mb-2">
                Worker Email
              </label>
              <input
                type="email"
                value={workerEmail}
                onChange={(e) => setWorkerEmail(e.target.value)}
                className="w-full rounded-xl border border-[#1f3b2f] bg-[#07130e] px-3.5 py-2.5 text-sm text-[#f0fdf4] focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition"
              />
            </div>
          </div>

          <SiteLocationField value={site} onChange={setSite} />

          <div className="pt-2 flex justify-end">
            <button
              onClick={preview}
              disabled={busy === 'preview' || !description.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-black shadow-sm transition hover:bg-emerald-400 active:translate-y-[1px] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy === 'preview' ? 'Analyzing with AI…' : 'Generate Milestones ✨'}
            </button>
          </div>
        </Card>

        {/* AI Plan Preview */}
        {plan && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[#8ca89b]">
                Generated Scope & Milestones
              </h2>
              <span className="text-xs font-mono text-emerald-400">
                Total: {money(total)}
              </span>
            </div>

            <Card className="border-[#2b5544]/60 bg-[#0d1e17]/90 space-y-4">
              <div>
                <span className="text-xs text-[#8ca89b]">Proposed Job Title</span>
                <h3 className="text-lg font-bold text-white mt-0.5">{plan.title}</h3>
              </div>

              <div className="divide-y divide-white/[0.06] border-t border-white/[0.06] pt-1">
                {plan.milestones.map((m, idx) => (
                  <div key={idx} className="py-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-[#2b4c3c] bg-[#0e1d16] text-[11px] font-mono font-medium text-[#8ca89b] mt-0.5">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-white">{m.title}</div>
                        {m.criteria && (
                          <div className="text-xs text-[#8ca89b] mt-0.5">
                            Proof criteria: {m.criteria}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="text-sm font-mono font-medium text-emerald-400 shrink-0">
                      ${m.amount.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-white/[0.06] flex justify-end">
                <Button
                  variant="paypal"
                  onClick={createAndFund}
                  disabled={busy === 'create' || !site}
                  className="px-6 py-2.5 text-sm"
                >
                  {busy === 'create' ? 'Creating...' : 'Confirm & Fund with PayPal'}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
