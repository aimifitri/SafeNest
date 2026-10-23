import { phoneLocationView, type PhoneLocationSnapshot } from "../shared/phoneLocation";
import type { DeviceLocationCoordinate, DeviceLocationPoint } from "./DeviceLocationMap.types";

type Input = {
  demo: boolean; childId: string; schoolName: string; school: DeviceLocationCoordinate | null;
  snapshot: PhoneLocationSnapshot; now: number;
  simulation: { place: "office" | "road" | "school"; travel: number };
  collector: { kind: string; name: string }; phase: string;
};
const valid = (p: DeviceLocationCoordinate | null) => p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180 ? p : null;
export function todayMapModel(input: Input) {
  const { demo, snapshot, now } = input;
  let point: DeviceLocationPoint | null = null;
  let school: DeviceLocationCoordinate | null = null;
  const additionalPoints: (DeviceLocationPoint & { id: string })[] = [];
  const view = phoneLocationView(snapshot, now);
  if (demo) {
    // Fictional, deterministic per-child map fixtures, never geocoded or published.
    const hash = [...input.childId].reduce((n, char) => (n * 31 + char.charCodeAt(0)) >>> 0, 0);
    school = { latitude: 2.24 + (hash % 997) / 100000, longitude: 102.28 + (hash % 991) / 100000 };
    const at = (progress: number) => ({ latitude: school!.latitude - 0.018 * (1 - progress), longitude: school!.longitude - 0.015 * (1 - progress) });
    const progress = input.simulation.place === "school" ? 1 : input.simulation.place === "road" ? 0.5 : 0;
    point = { ...at(progress), accuracy: null, title: "Parent ? simulated", detail: "Fictional demo coordinates" };
    if (input.collector.kind !== "parent" && ["helper_assigned", "travelling", "at_school", "collected"].includes(input.phase)) {
      const travel = input.phase === "travelling" ? Math.max(0, Math.min(1, input.simulation.travel)) : ["at_school", "collected"].includes(input.phase) ? 1 : 0;
      additionalPoints.push({ ...at(travel), accuracy: null, id: "demo-collector", title: `${input.collector.name} ? simulated collector` });
    }
  } else {
    school = valid(input.school);
    if (view.current && snapshot.fix) point = { ...snapshot.fix.coords, title: "This phone", detail: view.label };
  }
  return { point, school, additionalPoints,
    title: demo ? "Demo GPS ? Simulated" : view.title,
    detail: demo ? "Fictional parent and school locations" : view.current ? `${view.label} ? ?${Math.round(point!.accuracy!)} m ? ${Math.max(0, Math.floor((now - snapshot.fix!.timestamp) / 1000))}s ago` : view.detail,
    schoolTitle: `${input.schoolName || "Selected child's school"}${demo ? " ? simulated" : ""}`,
    schoolMissing: !school,
  };
}
