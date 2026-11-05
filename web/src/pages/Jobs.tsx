import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, clearSession, getSession } from '../api';

type Milestone = { id: string; position: number; title: string; amount: string; status: string };
type Job = { id: string; title: string; status: string; totalAmount: string; currency: string; milestones: Milestone[] };

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
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My jobs</h1>
        <div className="text-sm text-gray-600 flex items-center gap-3">
          <span>{session?.email} ({session?.role ?? 'role unknown'})</span>
          <button className="underline" onClick={logout}>Log out</button>
        </div>
      </div>
      {isClient && (
        <Link className="inline-block bg-emerald-600 text-white rounded px-4 py-2" to="/jobs/new">
          + New job
        </Link>
      )}
      {error && <p className="text-red-600">{error}</p>}
      {jobs === null && !error && <p>Loading…</p>}
      {jobs?.length === 0 && <p>No jobs yet.</p>}
      {jobs?.map((j) => (
        <div key={j.id} className="bg-white rounded-xl shadow p-4 space-y-2">
          <div className="flex justify-between">
            <Link className="font-semibold underline" to={`/jobs/${j.id}`}>{j.title}</Link>
            <span className="text-xs bg-gray-100 rounded px-2 py-1">{j.status}</span>
          </div>
          <p className="text-sm text-gray-600">
            {j.totalAmount} {j.currency}, {j.milestones.length} milestones
          </p>
          <ul className="text-sm space-y-1">
            {j.milestones.map((m) => (
              <li key={m.id} className="flex justify-between">
                <span>{m.position}. {m.title}</span>
                <span className="text-gray-500">{m.amount}, {m.status}</span>
              </li>
            ))}
          </ul>
          {isClient && (j.status === 'DRAFT' || j.status === 'AWAITING_FUNDING') && (
            <button className="bg-blue-600 text-white rounded px-3 py-1 text-sm" onClick={() => fund(j.id)}>
              Pay with PayPal
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
