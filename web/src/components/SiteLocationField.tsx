import { useState } from 'react';
import { type LatLng, mapsLink, parseLocation } from '../location';

type Props = { value: LatLng | null; onChange: (p: LatLng | null) => void };

export default function SiteLocationField({ value, onChange }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  function handle(next: string) {
    setText(next);
    if (!next.trim()) {
      setError('');
      onChange(null);
      return;
    }
    const p = parseLocation(next);
    if (p) {
      setError('');
      onChange(p);
    } else {
      onChange(null);
      setError("Couldn't read a location. Paste coordinates like -1.0319, 36.8310 or the full Google Maps link (short maps.app.goo.gl links don't work).");
    }
  }

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-[#8ca89b] mb-2">
        Job site location (required to fund)
      </label>
      <input
        value={text}
        onChange={(e) => handle(e.target.value)}
        placeholder="Paste coordinates or a Google Maps link"
        className="w-full rounded-xl border border-[#1f3b2f] bg-[#07130e] px-3.5 py-2.5 text-sm text-[#f0fdf4] placeholder-[#415e51] focus:border-emerald-500/60 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 transition"
      />
      <p className="mt-2 text-xs text-[#8ca89b]">
        In Google Maps (satellite view), right-click the building and click the coordinates to copy them.
      </p>
      {value && (
        <p className="mt-2 text-xs text-emerald-400">
          Pin set: {value.lat.toFixed(5)}, {value.lng.toFixed(5)} ·{' '}
          <a href={mapsLink(value)} target="_blank" rel="noreferrer" className="underline">
            Check on map
          </a>
          . Proof photos must be taken within 200 m of this pin.
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-xl border border-rose-500/40 bg-[#1f0d12] px-3 py-2 text-xs text-rose-300">{error}</p>
      )}
    </div>
  );
}
