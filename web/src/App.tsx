import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';

const Page = ({ name }: { name: string }) => (
  <div className="p-6 text-slate-700">{name} (coming soon)</div>
);

function Home() {
  const [health, setHealth] = useState('checking...');
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d) => setHealth(d.db ? 'API and database connected' : 'API up, database down'))
      .catch(() => setHealth('API unreachable'));
  }, []);
  return <div className="p-6 text-slate-700">{health}</div>;
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex items-center gap-4 border-b bg-white px-6 py-3">
        <Link to="/" className="font-semibold">Kazi Proof</Link>
        <nav className="flex gap-3 text-sm text-slate-600">
          <Link to="/jobs">Jobs</Link>
          <Link to="/jobs/new">New job</Link>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Page name="Login" />} />
        <Route path="/jobs" element={<Page name="Jobs" />} />
        <Route path="/jobs/new" element={<Page name="New job" />} />
        <Route path="/jobs/:id" element={<Page name="Job detail" />} />
        <Route path="/jobs/:id/capture/:milestoneId" element={<Page name="Capture" />} />
        <Route path="/profile/:workerId" element={<Page name="Profile" />} />
        <Route path="/paypal/return" element={<Page name="PayPal return" />} />
      </Routes>
    </div>
  );
}
