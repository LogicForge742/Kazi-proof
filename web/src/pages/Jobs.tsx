import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, clearSession, getSession } from '../api';
import Layout from '../components/Layout';
import JobCard, { type Job } from '../components/JobCard';
import { Button } from '../components/ui';

export default function Jobs() {
  const nav = useNavigate();
  const session = getSession();
  const isClient = session?.role === 'CLIENT';
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ jobs: Job[] }>('/api/jobs')
      .then((d) => setJobs(d.jobs))
      .catch((e) => setError(e.message));
  }, []);

  function logout() {
    clearSession();
    nav('/login');
  }

  async function fund(id: string) {
    setError('');
    try {
      const { approveUrl } = await api<{ approveUrl: string }>(`/api/jobs/${id}/fund`, { method: 'POST' });
      window.location.href = approveUrl;
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const needsFunding = (j: Job) => isClient && (j.status === 'DRAFT' || j.status === 'AWAITING_FUNDING');
  const needsReview = (j: Job) => isClient && j.milestones.some((m) => m.status === 'UNDER_REVIEW');
  const needsAttention = (j: Job) => needsFunding(j) || needsReview(j);

  function renderJob(j: Job) {
    return (
      <JobCard
        key={j.id}
        job={j}
        highlight={needsAttention(j)}
        action={
          needsFunding(j) && (
            <Button variant="paypal" onClick={() => fund(j.id)}>
              Pay with PayPal
            </Button>
          )
        }
      />
    );
  }

  const attention = jobs?.filter(needsAttention) ?? [];
  const rest = jobs?.filter((j) => !needsAttention(j)) ?? [];

  return (
    <Layout
      right={
        <>
          <span className="hidden sm:inline font-mono text-xs text-[#8ca89b]">
            {session?.email}
          </span>
          <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-950/60 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            {session?.role ?? 'Unknown'}
          </span>
          <button
            onClick={logout}
            className="text-xs font-medium text-[#8ca89b] hover:text-white transition-colors"
          >
            Log out
          </button>
        </>
      }
    >
      {/* Header section */}
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            My jobs
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#8ca89b]">
            Pay only when the work is proven.
          </p>
        </div>
        {isClient && (
          <Link
            to="/jobs/new"
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black shadow-sm transition hover:bg-emerald-400 active:translate-y-[1px]"
          >
            <span>+</span> New job
          </Link>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-rose-500/40 bg-[#1f0d12] px-4 py-3 text-xs sm:text-sm text-rose-300 rounded-xl shadow-lg">
          {error}
        </div>
      )}

      {jobs === null && !error && (
        <p className="text-sm text-[#8ca89b] animate-pulse">Loading jobs…</p>
      )}

      {jobs?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[#244737] bg-[#0b1712] px-6 py-16 shadow-inner text-center">
          <p className="font-semibold text-white">No jobs yet</p>
          <p className="mt-1 text-xs sm:text-sm text-[#8ca89b]">
            {isClient
              ? 'Create a job and describe the work. AI will split it into milestones.'
              : 'Jobs assigned to you will show up here.'}
          </p>
        </div>
      )}

      {/* Attention section */}
      {attention.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3.5 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            Needs your attention
            <span className="rounded-full bg-amber-400/15 border border-amber-400/30 px-2 py-0.5 text-xs font-mono font-medium text-amber-300">
              {attention.length}
            </span>
          </h2>
          <div className="space-y-4">{attention.map(renderJob)}</div>
        </section>
      )}

      {/* Rest section */}
      {rest.length > 0 && (
        <section>
          {attention.length > 0 && (
            <h2 className="mb-3.5 text-sm font-semibold uppercase tracking-wider text-[#8ca89b]">
              Everything else
            </h2>
          )}
          <div className="space-y-4">{rest.map(renderJob)}</div>
        </section>
      )}
    </Layout>
  );
}
