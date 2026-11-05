import { useEffect, useState } from 'react';
import { api, photoUrl } from '../api';

export type Milestone = {
  id: string;
  position: number;
  title: string;
  amount: string;
  criteria: string;
  status: string;
};
type Report = { verdict: 'MATCHES' | 'MISMATCH' | 'UNCLEAR'; confidence: number; summary: string };
type Submission = { id: string; flags: string[]; createdAt: string; reports: Report[] };
type Detail = { submissions: Submission[]; payment: { status: string } | null };

const VERDICT: Record<Report['verdict'], string> = {
  MATCHES: 'AI: looks like a match',
  MISMATCH: 'AI: does not match',
  UNCLEAR: 'AI: partly matches',
};
const FLAG: Record<string, string> = {
  STALE_PHOTO: 'Photo is older than 24 hours',
  FUTURE_TIMESTAMP: 'Photo time is in the future',
  NO_LOCATION: 'No location sent with the photo',
  LOCATION_FAR: 'Photo taken far from the job site',
  AI_NO_MATCH: 'AI thinks the photo does not match',
};

// Shrinks a phone photo to at most 1600px so the upload stays small.
async function toJpegDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}

function getPosition(): Promise<{ lat?: number; lng?: number }> {
  return new Promise((res) => {
    if (!navigator.geolocation) return res({});
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => res({}),
      { timeout: 5000 }
    );
  });
}

export default function MilestoneCard({
  m,
  role,
  onChanged,
}: {
  m: Milestone;
  role: string | null;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (m.status === 'PLANNED') return;
    api<{ milestone: Detail }>(`/api/milestones/${m.id}`)
      .then((d) => setDetail(d.milestone))
      .catch((e) => setError(e.message));
  }, [m.id, m.status, tick]);

  const latest = detail?.submissions[0];
  const latestId = latest?.id;

  useEffect(() => {
    if (!latestId) return;
    let url: string | null = null;
    let cancelled = false;
    photoUrl(m.id).then((u) => {
      if (cancelled) {
        if (u) URL.revokeObjectURL(u);
      } else {
        url = u;
        setPhoto(u);
      }
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [m.id, latestId]);

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError('');
    try {
      await fn();
      setFile(null);
      setTick((t) => t + 1);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  const post = (action: string, body?: unknown) =>
    api(`/api/milestones/${m.id}/${action}`, { method: 'POST', body });

  async function submit() {
    if (!file) return;
    await act('submit', async () => {
      const [photoBase64, pos] = await Promise.all([toJpegDataUrl(file), getPosition()]);
      await post('submit', { photoBase64, capturedAt: new Date(file.lastModified).toISOString(), ...pos });
    });
  }

  const isWorker = role === 'WORKER';
  const isClient = role === 'CLIENT';
  const report = latest?.reports[0];

  return (
    <div className="bg-white rounded-xl shadow p-4 space-y-3">
      <div className="flex justify-between">
        <h3 className="font-semibold">{m.position}. {m.title}</h3>
        <span className="text-xs bg-gray-100 rounded px-2 py-1">{m.status}</span>
      </div>
      <p className="text-sm">{m.amount} USD</p>
      <p className="text-sm text-gray-600">Proof needed: {m.criteria}</p>

      {photo && <img src={photo} alt="Submitted proof" className="rounded max-h-80" />}

      {report && (
        <p className="text-sm">
          <b>{VERDICT[report.verdict]}</b> ({Math.round(report.confidence * 100)}% sure). {report.summary}
        </p>
      )}
      {latest && latest.flags.length > 0 && (
        <ul className="text-sm text-amber-700 list-disc pl-5">
          {latest.flags.map((f) => <li key={f}>{FLAG[f] ?? f}</li>)}
        </ul>
      )}
      {detail?.payment && <p className="text-sm text-gray-600">Payment: {detail.payment.status}</p>}

      {isWorker && (m.status === 'PLANNED' || m.status === 'DISPUTED') && (
        <button className="bg-emerald-600 text-white rounded px-3 py-1 text-sm disabled:opacity-50"
          disabled={busy !== ''} onClick={() => act('start', () => post('start'))}>
          {m.status === 'DISPUTED' ? 'Restart this step' : 'Start this step'}
        </button>
      )}

      {isWorker && (m.status === 'ACTIVE' || m.status === 'FLAGGED') && (
        <div className="space-y-2">
          <input key={latest?.id ?? "none"} type="file" accept="image/*" capture="environment"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <button className="bg-blue-600 text-white rounded px-3 py-1 text-sm disabled:opacity-50"
            disabled={!file || busy !== ''} onClick={submit}>
            {busy === 'submit' ? 'Uploading and checking…' : 'Submit photo proof'}
          </button>
        </div>
      )}

      {isClient && (m.status === 'UNDER_REVIEW' || m.status === 'FLAGGED') && (
        <div className="flex gap-2">
          <button className="bg-emerald-600 text-white rounded px-3 py-1 text-sm disabled:opacity-50"
            disabled={busy !== ''} onClick={() => act('approve', () => post('approve'))}>
            {busy === 'approve' ? 'Paying…' : `Approve and pay ${m.amount} USD`}
          </button>
          <button className="border rounded px-3 py-1 text-sm disabled:opacity-50"
            disabled={busy !== ''} onClick={() => act('dispute', () => post('dispute'))}>
            Dispute
          </button>
        </div>
      )}

      {isClient && m.status === 'APPROVED' && (
        <button className="bg-amber-600 text-white rounded px-3 py-1 text-sm disabled:opacity-50"
          disabled={busy !== ''} onClick={() => act('release', () => post('release'))}>
          Retry payment
        </button>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
