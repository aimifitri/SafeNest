// Vehicle modes are ONLY for estimating "how long to the school from where I am now".
// They are not navigation. The routing service we use (public OSRM) gives a driving route, so:
//  - Recommended and Driving are the road route time.
//  - Motorcycle is labelled approximate, because it reuses the driving time.
//  - Walking and Biking are labelled approximate: road distance at a typical speed.
//  - Transit is unavailable, because there is no transit data.
export type EtaMode = "recommended" | "driving" | "motorcycle" | "walking" | "biking" | "transit";

export const ETA_MODES: ReadonlyArray<{ id: EtaMode; label: string; icon: string }> = [
  { id: "recommended", label: "Recommended", icon: "navigation-variant" },
  { id: "driving", label: "Driving", icon: "car" },
  { id: "motorcycle", label: "Motorcycle", icon: "motorbike" },
  { id: "walking", label: "Walking", icon: "walk" },
  { id: "biking", label: "Biking", icon: "bike" },
  { id: "transit", label: "Transit", icon: "bus" },
];

export const TYPICAL_SPEED_KMH = { walking: 5, biking: 15 } as const;

export type RouteBasis = { minutes: number; meters: number | null };
export type ModeEstimate = {
  kind: "road" | "approx" | "unavailable";
  minutes: number | null;
  /** Short result line, e.g. "15 min" or "ETA unavailable". */
  headline: string;
  /** One line that says how the number was made. Always shown. */
  note: string;
};

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function estimateForMode(route: RouteBasis | null, mode: EtaMode): ModeEstimate {
  if (mode === "transit") return { kind: "unavailable", minutes: null, headline: "ETA unavailable", note: "No public transport data is available." };
  if (!route) return { kind: "unavailable", minutes: null, headline: "ETA unavailable", note: "The route service could not be reached." };
  if (mode === "recommended" || mode === "driving") {
    return { kind: "road", minutes: route.minutes, headline: formatMinutes(route.minutes), note: "Driving route. No live traffic." };
  }
  if (mode === "motorcycle") {
    return { kind: "approx", minutes: route.minutes, headline: `About ${formatMinutes(route.minutes)}`, note: "Approximate. Uses the driving route time, not motorcycle routing." };
  }
  if (route.meters === null) return { kind: "unavailable", minutes: null, headline: "ETA unavailable", note: "No route distance is available for this mode." };
  const kmh = TYPICAL_SPEED_KMH[mode];
  const minutes = Math.max(1, Math.ceil((route.meters / 1000 / kmh) * 60));
  return { kind: "approx", minutes, headline: `About ${formatMinutes(minutes)}`, note: `Approximate. Road distance at ${kmh} km/h.` };
}
