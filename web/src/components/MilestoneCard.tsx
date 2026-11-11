import { useEffect, useState } from 'react';
import { api, photoUrl } from '../api';
import CameraCapture, { type Capture } from './CameraCapture';

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

const VERDICT: Record<Report['verdict'], { text: string; color: string }> = {
  MATCHES: { text: 'AI: Looks like a match', color: 'text-emerald-400' },
  MISMATCH: { text: 'AI: Does not match', color: 'text-rose-400' },
  UNCLEAR: { text: 'AI: Partly matches / Unclear', color: 'text-amber-400' },
};

const FLAG: Record<string, string> = {
  STALE_PHOTO: 'Photo is older than 24 hours',
  FUTURE_TIMESTAMP: 'Photo timestamp is in the future',
  NO_LOCATION: 'No location sent with the photo',
  LOCATION_FAR: 'Photo taken far from the job site',
  AI_NO_MATCH: 'AI flagged photo does not match description',
  CODE_NOT_SEEN: 'The challenge code was not found in the photo',
  CODE_UNCHECKED: 'The challenge code could not be checked (AI check failed)',
  NO_ACTIVE_CODE: 'No valid challenge code was issued for this photo',
  NOT_LIVE_CAPTURE: 'Photo was uploaded from files, not taken live in the app',
};

const STATUS_CONFIG: Record<string, { label: string; pill: string; dot: string }> = {
  PLANNED: {
    label: 'Planned',
    pill: 'bg-[#13231a] text-[#8ca89b] border-[#234232]',
    dot: 'bg-[#526f62]',
  },
  ACTIVE: {
    label: 'In progress',
    pill: 'bg-[#082338] text-[#38bdf8] border-sky-500/30',
    dot: 'bg-sky-400',
  },
  FLAGGED: {
    label: 'Flagged',
    pill: 'bg-[#271a08] text-[#fcd34d] border-amber-500/30',
    dot: 'bg-amber-400 animate-pulse',
  },
  UNDER_REVIEW: {
    label: 'Under review',
    pill: 'bg-[#271a08] text-[#fcd34d] border-amber-500/30',
    dot: 'bg-amber-400 animate-pulse',
  },
  APPROVED: {
    label: 'Approved',
    pill: 'bg-[#0b291d] text-[#34d399] border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  RELEASED: {
    label: 'Released',
    pill: 'bg-[#092925] text-[#2dd4bf] border-teal-500/30',
    dot: 'bg-teal-400',
  },
  DISPUTED: {
    label: 'Disputed',
    pill: 'bg-[#2b1016] text-[#fda4af] border-rose-500/30',
    dot: 'bg-rose-400',
  },
};

const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs sm:text-sm font-semibold text-black shadow-sm transition hover:bg-emerald-400 active:translate-y-[1px] disabled:opacity-40 disabled:cursor-not-allowed';

const BTN_OUTLINE =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs sm:text-sm font-semibold text-[#f0fdf4] transition hover:bg-white/[0.08] hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed';

const BTN_WARN =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-950/60 px-4 py-2 text-xs sm:text-sm font-semibold text-amber-300 transition hover:bg-amber-900/60 disabled:opacity-40 disabled:cursor-not-allowed';

// Shrinks a phone photo to at most 1600px so upload stays small
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
  const [shot, setShot] = useState<Capture | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
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
      setShot(null);
      setCameraOpen(false);
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

  async function openCamera() {
    setError('');
    try {
      const c = (await post('challenge')) as { code: string };
      setCode(c.code);
      setCameraOpen(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submit() {
    if (shot) {
      await act('submit', () => post('submit', { ...shot, source: 'camera' }));
      return;
    }
    if (!file) return;
    await act('submit', async () => {
      const [photoBase64, pos] = await Promise.all([toJpegDataUrl(file), getPosition()]);
      await post('submit', { photoBase64, capturedAt: new Date(file.lastModified).toISOString(), ...pos, source: 'upload' });
    });
  }

  const isWorker = role === 'WORKER';
  const isClient = role === 'CLIENT';
  const report = latest?.reports[0];

  const flags = latest?.flags ?? [];
  const timeOk = !flags.includes('STALE_PHOTO') && !flags.includes('FUTURE_TIMESTAMP');
  const placeOk = !flags.includes('NO_LOCATION') && !flags.includes('LOCATION_FAR');
  const pct = report ? Math.round(report.confidence * 100) : 0;
  const barGradient =
    report?.verdict === 'MATCHES'
      ? 'from-emerald-500 to-teal-400'
      : report?.verdict === 'UNCLEAR'
      ? 'from-amber-500 to-yellow-400'
      : 'from-rose-500 to-red-400';

  const needsReview = isClient && (m.status === 'UNDER_REVIEW' || m.status === 'FLAGGED');
  const statusInfo = STATUS_CONFIG[m.status] ?? STATUS_CONFIG.PLANNED;

  return (
    <div
      className={`rounded-2xl border bg-[#0b1712] p-5 sm:p-6 shadow-xl transition-all ${
        needsReview
          ? 'border-amber-400/80 shadow-amber-950/20'
          : 'border-[#1b382b] hover:border-[#2d5c47]'
      } space-y-4`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[#2b4c3c] bg-[#0e1d16] text-xs font-mono font-medium text-[#8ca89b]">
            {m.position}
          </span>
          <h3 className="font-semibold text-white text-base sm:text-lg tracking-tight">
            {m.title}
          </h3>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusInfo.pill}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusInfo.dot}`} />
            {statusInfo.label}
          </span>
          <span className="text-sm sm:text-base font-bold font-mono text-white tabular-nums">
            ${Number(m.amount).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Proof Criteria Box */}
      <div className="rounded-xl border border-white/[0.05] bg-[#07130e] p-3.5 space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8ca89b]">
          Required Proof
        </p>
        <p className="text-xs sm:text-sm text-[#f0fdf4]/90 leading-relaxed">
          {m.criteria}
        </p>
      </div>

      {/* Uploaded Photo Preview */}
      {photo && (
        <div className="overflow-hidden rounded-xl border border-white/10 bg-black/40">
          <img
            src={photo}
            alt="Submitted proof"
            className="w-full max-h-80 object-cover rounded-xl transition hover:scale-[1.01]"
          />
        </div>
      )}

      {/* AI Verification Report */}
      {report && (
        <div className="rounded-xl border border-white/[0.06] bg-[#07130e] p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className={`font-semibold uppercase tracking-wider ${VERDICT[report.verdict].color}`}>
              {VERDICT[report.verdict].text}
            </span>
            <span className="font-mono text-[#8ca89b]">{pct}% confidence</span>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-500`}
              style={{ width: `${pct}%` }}
            />
          </div>

          <p className="text-xs sm:text-sm text-[#8ca89b] leading-relaxed">
            {report.summary}
          </p>
        </div>
      )}

      {/* Metadata Check Flags */}
      {latest && (
        <ul className="space-y-1 text-xs">
          {timeOk && (
            <li className="flex items-center gap-2 text-emerald-400">
              <span>✓</span> Photo taken recently
            </li>
          )}
          {placeOk && (
            <li className="flex items-center gap-2 text-emerald-400">
              <span>✓</span> Confirmed at job location
            </li>
          )}
          {flags.map((f) => (
            <li key={f} className="flex items-center gap-2 text-amber-300">
              <span>⚠</span> {FLAG[f] ?? f}
            </li>
          ))}
        </ul>
      )}

      {detail?.payment && (
        <div className="text-xs font-mono text-[#8ca89b]">
          Payment status: <span className="text-emerald-400">{detail.payment.status}</span>
        </div>
      )}

      {/* Worker Action: Start Step */}
      {isWorker && (m.status === 'PLANNED' || m.status === 'DISPUTED') && (
        <div className="pt-2">
          <button
            className={BTN_PRIMARY}
            disabled={busy !== ''}
            onClick={() => act('start', () => post('start'))}
          >
            {m.status === 'DISPUTED' ? 'Restart this step' : 'Start this step'}
          </button>
        </div>
      )}

      {/* Worker Action: Capture Proof */}
      {isWorker && (m.status === 'ACTIVE' || m.status === 'FLAGGED') && (
        <div className="space-y-3 pt-2">
          {cameraOpen ? (
            <CameraCapture
              code={code ?? undefined}
              onCapture={(c) => {
                setShot(c);
                setCameraOpen(false);
              }}
              onCancel={() => setCameraOpen(false)}
              hint="Take the photo at the job site. Your location and the time are recorded when you press the button."
            />
          ) : shot ? (
            <div className="space-y-3">
              <img src={shot.photoBase64} alt="Your photo" className="w-full max-h-80 rounded-xl object-cover" />
              <div className="flex flex-wrap gap-3">
                <button className={BTN_PRIMARY} disabled={busy !== ''} onClick={submit}>
                  {busy === 'submit' ? 'Uploading & verifying…' : 'Use this photo & submit'}
                </button>
                <button
                  className={BTN_OUTLINE}
                  disabled={busy !== ''}
                  onClick={() => {
                    setShot(null);
                    void openCamera();
                  }}
                >
                  Retake
                </button>
              </div>
              {shot.lat == null && (
                <p className="text-xs text-amber-300">
                  No location was captured. Allow location access and retake, or the client will see a warning.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <button className={BTN_PRIMARY} disabled={busy !== ''} onClick={openCamera}>
                Open camera
              </button>
              <details className="text-xs text-[#8ca89b]">
                <summary className="cursor-pointer">Camera not working? Upload a photo instead</summary>
                <div className="space-y-2 pt-2">
                  <p>Uploaded photos are marked as not taken live, and the client will see that.</p>
                  <input
                    key={latest?.id ?? 'none'}
                    type="file"
                    accept="image/*"
                    className="block w-full text-xs text-[#8ca89b] file:mr-3 file:rounded-xl file:border file:border-white/10 file:bg-white/[0.05] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#f0fdf4] hover:file:bg-white/[0.09] transition"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  />
                  <button className={BTN_OUTLINE} disabled={!file || busy !== ''} onClick={submit}>
                    {busy === 'submit' ? 'Uploading & verifying…' : 'Submit uploaded photo'}
                  </button>
                </div>
              </details>
            </div>
          )}
        </div>
      )}

      {/* Client Action: Review & Payout */}
      {needsReview && (
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/[0.06]">
          <button
            className={BTN_PRIMARY}
            disabled={busy !== ''}
            onClick={() => act('approve', () => post('approve'))}
          >
            {busy === 'approve' ? 'Processing…' : `Approve & release $${Number(m.amount).toFixed(2)}`}
          </button>
          <button
            className={BTN_OUTLINE}
            disabled={busy !== ''}
            onClick={() => act('dispute', () => post('dispute'))}
          >
            Dispute
          </button>
        </div>
      )}

      {/* Client Action: Retry Failed Payment */}
      {isClient && m.status === 'APPROVED' && (
        <div className="pt-2">
          <button
            className={BTN_WARN}
            disabled={busy !== ''}
            onClick={() => act('release', () => post('release'))}
          >
            Retry payout
          </button>
        </div>
      )}

      {/* Inline Error */}
      {error && (
        <p className="rounded-lg border border-rose-500/30 bg-rose-950/40 p-2 text-xs text-rose-300">
          {error}
        </p>
      )}
    </div>
  );
}
