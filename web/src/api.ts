const BASE = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:4000');

export type Role = 'CLIENT' | 'WORKER';
export type Session = { token: string; role: Role | null; email: string };

const KEY = 'kazi_session';

export function getSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
}
export function saveSession(s: Session) {
  localStorage.setItem(KEY, JSON.stringify(s));
}
export function clearSession() {
  localStorage.removeItem(KEY);
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<T> {
  const s = getSession();
  const res = await fetch(BASE + path, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: {
      'content-type': 'application/json',
      ...(s ? { Authorization: `Bearer ${s.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { status: res.status });
  }
  return data as T;
}

// The login response shape was not verified, so look in the likely places for the role.
function roleFrom(data: any): Role | null {
  const direct = data?.user?.role ?? data?.role;
  if (direct) return direct;
  try {
    const payload = JSON.parse(atob(data.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export async function login(email: string, password: string): Promise<Session> {
  const data = await api('/api/auth/login', { body: { email, password } });
  const s: Session = { token: data.token, role: roleFrom(data), email };
  saveSession(s);
  return s;
}

// Loads a milestone's newest photo with the auth header and returns a blob URL for <img src>.
export async function photoUrl(milestoneId: string): Promise<string | null> {
  const s = getSession();
  const r = await fetch(`${BASE}/api/milestones/${milestoneId}/photo`, {
    headers: s ? { Authorization: `Bearer ${s.token}` } : {},
  });
  if (!r.ok) return null;
  return URL.createObjectURL(await r.blob());
}
