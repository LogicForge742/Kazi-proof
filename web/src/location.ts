export type LatLng = { lat: number; lng: number };

const valid = (lat: number, lng: number): LatLng | null =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)
    ? { lat, lng }
    : null;

/** Accepts "lat, lng", a Google Maps link with coordinates, or a WhatsApp location link. */
export function parseLocation(input: string): LatLng | null {
  let text = input.trim();
  try {
    text = decodeURIComponent(text);
  } catch {
    /* keep the raw text */
  }
  const n = '(-?\\d{1,3}(?:\\.\\d+)?)';
  const patterns = [
    new RegExp(`^${n}\\s*[,;\\s]\\s*${n}$`),
    new RegExp(`@${n},${n}`),
    new RegExp(`!3d${n}!4d${n}`),
    new RegExp(`[?&](?:q|ll|query|destination|center)=${n},\\s*${n}`),
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const r = valid(parseFloat(m[1]), parseFloat(m[2]));
      if (r) return r;
    }
  }
  return null;
}

export const mapsLink = (p: LatLng) => `https://www.google.com/maps?q=${p.lat},${p.lng}`;
