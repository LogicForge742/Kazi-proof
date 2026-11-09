import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';

export default function PaypalReturn() {
  const [params] = useSearchParams();
  const jobId = params.get('jobId');
  const [msg, setMsg] = useState(jobId ? 'Confirming your payment…' : 'Missing job id in the link.');

  useEffect(() => {
    if (!jobId) return;
    api(`/api/jobs/${jobId}/confirm-funding`, { method: 'POST' })
      .then(() => setMsg('Funded. The worker can now start.'))
      .catch((e) => setMsg(e.message));
  }, [jobId]);

  return (
    <div className="max-w-md mx-auto p-6 space-y-4 text-center">
      <h1 className="text-xl font-bold">PayPal</h1>
      <p>{msg}</p>
      <Link className="text-sm text-white/70 hover:text-brand-500 no-underline" to="/">Back to my jobs</Link>
    </div>
  );
}
