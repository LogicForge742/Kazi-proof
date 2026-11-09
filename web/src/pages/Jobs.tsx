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

  return (
    <Layout
      right={
        <>
          <span className="hidden sm:inline">{session?.email}</span>
          <span className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
            {session?.role ?? 'Unknown role'}
          </span>
          <button onClick={logout} className="font-medium text-ink hover:underline">
            Log out
          </button>
        </>
      }
    >
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">My jobs</h1>
          <p className="text-sm text-muted">Pay only when the work is proven.</p>
        </div>
        {isClient && (
          <Link
            to="/jobs/new"
            className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            + New job
          </Link>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {jobs === null && !error && <p className="text-muted">Loading jobs…</p>}

      {jobs?.length === 0 && (
        <div className="rounded-card border border-dashed border-line bg-white px-6 py-12 text-center">
          <p className="font-semibold">No jobs yet</p>
          <p className="mt-1 text-sm text-muted">
            {isClient
              ? 'Create a job and describe the work. AI will split it into milestones.'
              : 'Jobs assigned to you will show up here.'}
          </p>
        </div>
      )}

      <div className="space-y-4">
        {jobs?.map((j) => {
          const needsFunding = isClient && (j.status === 'DRAFT' || j.status === 'AWAITING_FUNDING');
          const needsReview = isClient && j.milestones.some((m) => m.status === 'UNDER_REVIEW');
          return (
            <JobCard
              key={j.id}
              job={j}
              highlight={needsFunding || needsReview}
              action={
                needsFunding && (
                  <Button variant="paypal" onClick={() => fund(j.id)}>
                    Pay with PayPal
                  </Button>
                )
              }
            />
          );
        })}
      </div>
    </Layout>
  );
}
