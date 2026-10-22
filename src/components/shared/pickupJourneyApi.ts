import { supabase } from "../../lib/supabase";
import { call } from "./backupApi";
import type { ApiResult } from "./backupApi";

// Pickup journey calls (supabase/pickup_journeys.sql). The collector starts a journey, marks
// arrival at school, then confirms the handover. Only the collector can move it forward.
// The handover is recorded by the collector. The school does not verify it.

export type JourneyState = "started" | "at_school" | "collected" | "cancelled";

export type DbJourney = {
  id: string;
  child_id: string;
  collector_user_id: string;
  collector_name: string;
  state: JourneyState;
  started_at: string;
  arrived_at: string | null;
  ended_at: string | null;
  backup_request_id: string | null;
};

/** The collector's own open journeys (works for parents and helpers). */
export type MyJourney = {
  journey_id: string;
  child_id: string;
  child_name: string;
  state: "started" | "at_school";
  started_at: string;
  backup_request_id: string | null;
};

export type LiveJourney = {
  id: string;
  state: "started" | "at_school" | "collected";
  collectorName: string;
  collectorUserId: string;
  startedAt: string;
  endedAt: string | null;
};

const SHOW_COLLECTED_FOR_MS = 12 * 60 * 60 * 1000;

export async function startJourney(childId: string): Promise<ApiResult<string | null>> {
  return call<string>(() => supabase.rpc("start_pickup_journey", { target_child: childId }));
}

async function voidCall(name: string, journeyId: string): Promise<ApiResult<null>> {
  const res = await call<null>(() => supabase.rpc(name, { target_journey: journeyId }));
  return res.ok ? { ok: true, data: null } : res;
}
export const markArrived = (journeyId: string) => voidCall("mark_arrived_at_school", journeyId);
export const confirmHandover = (journeyId: string) => voidCall("confirm_handover", journeyId);
export const cancelJourney = (journeyId: string) => voidCall("cancel_pickup_journey", journeyId);

export async function fetchLatestJourney(childId: string): Promise<ApiResult<DbJourney | null>> {
  const res = await call<DbJourney[]>(() =>
    supabase
      .from("pickup_journeys")
      .select("id, child_id, collector_user_id, collector_name, state, started_at, arrived_at, ended_at, backup_request_id")
      .eq("child_id", childId)
      .order("started_at", { ascending: false })
      .limit(1),
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data?.[0] ?? null };
}

export async function fetchMyJourneys(): Promise<ApiResult<MyJourney[]>> {
  const res = await call<MyJourney[]>(() => supabase.rpc("my_active_journeys"));
  return res.ok ? { ok: true, data: res.data ?? [] } : res;
}

export function subscribeToJourneys(key: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`pickup-journeys-${key}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "pickup_journeys" }, () => onChange())
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** What the screens show. Cancelled journeys, and handovers older than 12 hours, count as "no journey". */
export function toLiveJourney(row: DbJourney | null, now: number = Date.now()): LiveJourney | null {
  if (!row || row.state === "cancelled") return null;
  if (row.state === "collected") {
    const ended = row.ended_at ? Date.parse(row.ended_at) : NaN;
    if (!Number.isFinite(ended) || now - ended > SHOW_COLLECTED_FOR_MS) return null;
  }
  return {
    id: row.id,
    state: row.state,
    collectorName: row.collector_name,
    collectorUserId: row.collector_user_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}
