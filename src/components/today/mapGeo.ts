// Small, pure map helpers. No React, no native modules.
export type Coord = { latitude: number; longitude: number };

export function isValidCoord(p: Coord | null | undefined): p is Coord {
  return !!p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;
}

export function distanceMeters(a: Coord, b: Coord): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad, dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(meters: number): string {
  if (meters < 950) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
}

export function lerp(a: Coord, b: Coord, t: number): Coord {
  const k = Math.max(0, Math.min(1, t));
  return { latitude: a.latitude + (b.latitude - a.latitude) * k, longitude: a.longitude + (b.longitude - a.longitude) * k };
}

export type MapRegion = Coord & { latitudeDelta: number; longitudeDelta: number };

/** A region that contains every valid point with some padding. One point gives a close view. */
export function regionFor(points: ReadonlyArray<Coord | null | undefined>, minDelta = 0.012, pad = 1.6): MapRegion | null {
  const ok = points.filter(isValidCoord);
  if (ok.length === 0) return null;
  const lats = ok.map((p) => p.latitude), lons = ok.map((p) => p.longitude);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
  return {
    latitude: (minLat + maxLat) / 2, longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * pad, minDelta), longitudeDelta: Math.max((maxLon - minLon) * pad, minDelta),
  };
}

// Fixed offsets (degrees, about 0.01 = 1.1 km) around the demo school. Every slot is far from the others and from the school,
// so markers never sit on top of each other. A person always gets the same slot, so the demo looks the same every run.
const SLOTS: ReadonlyArray<{ dLat: number; dLon: number }> = [
  { dLat: 0.016, dLon: -0.012 }, { dLat: 0.012, dLon: 0.020 }, { dLat: -0.004, dLon: 0.026 }, { dLat: -0.018, dLon: 0.014 },
  { dLat: -0.022, dLon: -0.010 }, { dLat: -0.008, dLon: -0.026 }, { dLat: 0.006, dLon: -0.030 }, { dLat: 0.026, dLon: 0.004 },
  { dLat: 0.002, dLon: 0.010 }, { dLat: -0.010, dLon: 0.002 }, { dLat: 0.008, dLon: -0.008 }, { dLat: -0.028, dLon: -0.026 },
];
const hash = (s: string) => [...s].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** Deterministic, distinct positions for demo people around the demo school. */
export function demoPlaces(ids: readonly string[], school: Coord): Record<string, Coord> {
  const taken = new Set<number>();
  const out: Record<string, Coord> = {};
  for (const id of [...ids].sort()) {
    let slot = hash(id) % SLOTS.length;
    for (let i = 0; i < SLOTS.length && taken.has(slot); i++) slot = (slot + 1) % SLOTS.length;
    taken.add(slot);
    const o = SLOTS[slot]!;
    out[id] = { latitude: school.latitude + o.dLat, longitude: school.longitude + o.dLon };
  }
  return out;
}

export function ageLabel(updatedMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - updatedMs) / 1000));
  if (s < 15) return "just now";
  if (s < 90) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

/** Decide whether the school ETA needs a new route lookup. Small GPS jitter must not spam the routing service. */
export function needsEtaRefresh(last: { at: Coord; school: Coord; time: number } | null, now: { at: Coord; school: Coord; time: number }, opts = { moveMeters: 200, maxAgeMs: 90_000 }): boolean {
  if (!last) return true;
  if (distanceMeters(last.school, now.school) > 1) return true;
  if (now.time - last.time >= opts.maxAgeMs) return true;
  return distanceMeters(last.at, now.at) >= opts.moveMeters;
}
