import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getSession } from '../api';
import Layout from '../components/Layout';
import MilestoneCard, { type Milestone } from '../components/MilestoneCard';
import { StatusBadge, money } from '../components/ui';

type Job = {
  id: string;
  title: string;
  description: string;
  status: string;
  totalAmount: string;
  currency: string;
  milestones: Milestone[];
};

export default function JobDetail() {
  const { id } = useParams();
  const role = getSession()?.role ?? null;
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<{ job: Job }>(`/api/jobs/${id}`)
      .then((d) => setJob(d.job))
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const cur = job?.currency || 'USD';

  return (
    <Layout
      right={
        <Link to="/" className="text-xs sm:text-sm text-[#8ca89b] hover:text-white transition">
          ← Back to jobs
        </Link>
      }
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-[#1f0d12] px-4 py-3 text-xs sm:text-sm text-rose-300 shadow-lg">
            {error}
          </div>
        )}

        {!job && !error && (
          <p className="text-sm text-[#8ca89b] animate-pulse">Loading job details…</p>
        )}

        {job && (
          <>
            {/* Header info */}
            <div className="rounded-2xl border border-[#1b382b] bg-[#0b1712] p-6 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                    {job.title}
                  </h1>
                  {job.description && (
                    <p className="mt-1.5 text-xs sm:text-sm text-[#8ca89b] leading-relaxed max-w-2xl">
                      {job.description}
                    </p>
                  )}
                </div>
                <div className="flex sm:flex-col items-end gap-2 shrink-0">
                  <StatusBadge status={job.status} />
                  <span className="text-xl sm:text-2xl font-bold text-white font-mono">
                    {money(job.totalAmount, cur)}
                  </span>
                </div>
              </div>
            </div>

            {/* Milestones header */}
            <div className="space-y-4 pt-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[#8ca89b]">
                Milestones ({job.milestones.length})
              </h2>

              <div className="space-y-3">
                {job.milestones.map((m) => (
                  <MilestoneCard key={m.id} m={m} role={role} onChanged={load} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
