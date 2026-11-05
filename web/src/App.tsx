import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getSession } from './api';
import Login from './pages/Login';
import Jobs from './pages/Jobs';
import PaypalReturn from './pages/PaypalReturn';
import NewJob from './pages/NewJob';
import JobDetail from './pages/JobDetail';

function Protected({ children }: { children: ReactNode }) {
  return getSession() ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/paypal/return" element={<Protected><PaypalReturn /></Protected>} />
      <Route path="/jobs/:id" element={<Protected><JobDetail /></Protected>} />
      <Route path="/jobs/new" element={<Protected><NewJob /></Protected>} />
      <Route path="/" element={<Protected><Jobs /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
