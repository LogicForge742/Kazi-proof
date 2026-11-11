import { useEffect, useRef, useState } from 'react';

export type Capture = { photoBase64: string; capturedAt: string; lat?: number; lng?: number };

type Props = { onCapture: (c: Capture) => void; onCancel: () => void; hint?: string; code?: string };
type Fix = { lat: number; lng: number };

const BTN_PRIMARY =
  'inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed';
const BTN_OUTLINE =
  'inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-[#f0fdf4] transition hover:bg-white/[0.08] disabled:opacity-40';

export default function CameraCapture({ onCapture, onCancel, hint, code }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fixRef = useRef<Fix | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let watchId: number | null = null;

    // Start tracking location as soon as the camera opens, so a fix is ready at the shutter.
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (p) => {
          fixRef.current = { lat: p.coords.latitude, lng: p.coords.longitude };
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000 }
      );
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera is not available here. Open the site over HTTPS in a phone browser.');
    } else {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
        .then((stream) => {
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) videoRef.current.srcObject = stream;
          setReady(true);
        })
        .catch(() => setError('Camera access was denied. Allow the camera in your browser settings and try again.'));
    }

    return () => {
      cancelled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function snap() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setBusy(true);
    const capturedAt = new Date().toISOString();
    const scale = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height);
    const photoBase64 = canvas.toDataURL('image/jpeg', 0.85);

    let pos: Fix | null = fixRef.current;
    if (!pos && navigator.geolocation) {
      pos = await new Promise<Fix | null>((resolve) =>
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 8000 }
        )
      );
    }
    onCapture({ photoBase64, capturedAt, ...(pos ?? {}) });
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      {code && (
        <div className="rounded-xl border border-emerald-500/40 bg-[#0b291d] p-3 text-center">
          <p className="text-xs text-[#8ca89b]">Write this code on paper and keep it in the photo</p>
          <p className="font-mono text-3xl font-bold tracking-widest text-emerald-400">{code}</p>
          <p className="text-[11px] text-[#8ca89b]">Valid for 15 minutes. Write it large, with a dark pen.</p>
        </div>
      )}
      {error ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-950/40 p-2 text-xs text-rose-300">{error}</p>
      ) : (
        <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-xl bg-black" />
      )}
      {hint && <p className="text-xs text-[#8ca89b]">{hint}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={snap} disabled={!ready || busy} className={BTN_PRIMARY}>
          {busy ? 'Capturing…' : 'Take photo'}
        </button>
        <button type="button" onClick={onCancel} className={BTN_OUTLINE}>
          Cancel
        </button>
      </div>
    </div>
  );
}
