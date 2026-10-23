import { phoneLocationView, type PhoneLocationSnapshot } from "../shared/phoneLocation";
import type { DeviceLocationCoordinate, DeviceLocationPoint } from "./DeviceLocationMap.types";
import { ageLabel, demoPlaces, distanceMeters, formatDistance, isValidCoord, lerp } from "./mapGeo";

export type MapPerson = { id: string; name: string; role: string; approved: boolean };
/** A live location that someone chose to share with this account (location_shares and live_locations). Real accounts only. */
export type SharedMapLocation = { id: string; userId: string | null; name: string; latitude: number; longitude: number; updatedAt: number; expiresAt: number };

export type MapMember = {
  id: string;
  name: string;
  initial: string;
  role: string;
  coordinate: DeviceLocationCoordinate;
  /** true = made-up demo position. Never true for a real account. */
  simulated: boolean;
  /** Pickup authorization. A different thing from availability and from sharing a location. */
  pickup: string;
  availability: string | null;
  /** "Simulated, not live" or "Shared live with you, 20 s ago". */
  locationNote: string;
  distanceFromSchool: string | null;
  moving: boolean;
  stale: boolean;
};

type Input = {
  demo: boolean; childId: string; schoolName: string; school: DeviceLocationCoordinate | null;
  snapshot: PhoneLocationSnapshot; now: number;
  simulation: { place: "office" | "road" | "school"; travel: number };
  collector: { kind: string; name: string }; phase: string;
  /** Demo: the circle shown on the map. Real: used only to put a role and pickup status on a shared location. */
  people?: readonly MapPerson[];
  viewerId?: string;
  /** Real accounts: only locations that were actually shared with this account. */
  shared?: readonly SharedMapLocation[];
  /** Real accounts: availability text by user id, from saved availability. */
  availabilityById?: Readonly<Record<string, string>>;
  demoPlaceLabels?: Readonly<Record<string, string>>;
};

const STALE_MS = 120_000;
const MOVING_PHASES = ["helper_assigned", "travelling", "at_school", "collected"];
const initialOf = (name: string) => (name.trim().replace(/^(encik|kak|pn\.?|cik|cikgu)\s+/i, "").charAt(0) || "?").toUpperCase();

export function todayMapModel(input: Input) {
  const { demo, snapshot, now } = input;
  const view = phoneLocationView(snapshot, now);
  const people = input.people ?? [];
  let point: DeviceLocationPoint | null = null;
  let school: DeviceLocationCoordinate | null = null;
  const members: MapMember[] = [];
  let sharingNote: string | null = null;

  if (demo) {
    // Fictional, deterministic per-child map fixtures, never geocoded or published.
    const hash = [...input.childId].reduce((n, char) => (n * 31 + char.charCodeAt(0)) >>> 0, 0);
    school = { latitude: 2.24 + (hash % 997) / 100000, longitude: 102.28 + (hash % 991) / 100000 };
    const at = (progress: number) => ({ latitude: school!.latitude - 0.018 * (1 - progress), longitude: school!.longitude - 0.015 * (1 - progress) });
    const progress = input.simulation.place === "school" ? 1 : input.simulation.place === "road" ? 0.5 : 0;
    point = { ...at(progress), accuracy: null, title: "You", detail: "Simulated position" };
    const others = people.filter((p) => p.id !== input.viewerId);
    const slots = demoPlaces(others.map((p) => p.id), school);
    for (const p of others) {
      const base = slots[p.id]!;
      const isCollector = input.collector.kind !== "parent" && p.name === input.collector.name && MOVING_PHASES.includes(input.phase);
      // Only the person who accepted this pickup moves, and only along the real journey stages.
      const travel = !isCollector ? 0 : input.phase === "travelling" ? Math.max(0, Math.min(1, input.simulation.travel)) : input.phase === "helper_assigned" ? 0 : 1;
      const coordinate = isCollector ? lerp(base, school, travel) : base;
      members.push({
        id: p.id, name: p.name, initial: initialOf(p.name), role: p.role, coordinate, simulated: true,
        pickup: p.approved ? "Approved to collect" : "Not approved to collect",
        availability: p.approved ? "Available (demo)" : "Not asked until approved",
        locationNote: `Simulated${input.demoPlaceLabels?.[p.id] ? `, ${input.demoPlaceLabels[p.id]}` : ""}. Not a live location.`,
        distanceFromSchool: formatDistance(distanceMeters(coordinate, school)), moving: isCollector && input.phase === "travelling", stale: false,
      });
    }
  } else {
    school = isValidCoord(input.school) ? input.school : null;
    if (view.current && snapshot.fix) point = { ...snapshot.fix.coords, title: "You", detail: view.label };
    const byId = new Map(people.map((p) => [p.id, p]));
    const byName = new Map(people.map((p) => [p.name.trim().toLowerCase(), p]));
    for (const s of input.shared ?? []) {
      if (s.expiresAt <= now || !isValidCoord(s)) continue;
      const match = (s.userId ? byId.get(s.userId) : undefined) ?? byName.get(s.name.trim().toLowerCase());
      const coordinate = { latitude: s.latitude, longitude: s.longitude };
      const stale = now - s.updatedAt > STALE_MS;
      members.push({
        id: s.id, name: s.name, initial: initialOf(s.name), role: match?.role ?? "Shared with you", coordinate, simulated: false,
        pickup: match ? (match.approved ? "Approved to collect" : "Not approved to collect") : "Pickup status unknown",
        availability: (s.userId && input.availabilityById?.[s.userId]) || null,
        locationNote: stale ? `Last seen ${ageLabel(s.updatedAt, now)}. Not live right now.` : `Sharing live, updated ${ageLabel(s.updatedAt, now)}.`,
        distanceFromSchool: school ? formatDistance(distanceMeters(coordinate, school)) : null, moving: false, stale,
      });
    }
    sharingNote = members.length === 0 ? "No one is sharing a live location with you right now." : null;
  }
  return { point, school, members, sharingNote,
    title: demo ? "Demo, simulated locations" : view.title,
    detail: demo ? "Fictional people and school. Not real positions." : view.current ? `${view.label}, accuracy about ${Math.round(point!.accuracy!)} m, ${Math.max(0, Math.floor((now - snapshot.fix!.timestamp) / 1000))} s ago` : view.detail,
    schoolTitle: `${input.schoolName || "Selected child's school"}${demo ? " (simulated)" : ""}`,
    schoolMissing: !school,
    demoLabel: demo ? "Demo, simulated locations" : null,
  };
}
