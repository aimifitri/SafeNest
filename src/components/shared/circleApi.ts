import { supabase } from "../../lib/supabase";
import { friendlyBackupError } from "./backupApi";
import type { EscalationSettings } from "./circleEngine";
import { ESCALATION_DEFAULTS } from "./circleEngine";
import type { RecipientStatus } from "./pickupFlow";

// Real "ask everyone together" calls. They need supabase/pickup_broadcast.sql, which is a PROPOSAL until
// your backend team approves and runs it. Until then every call here reports { missing: true } and Today
// says plainly that group requests are not enabled (it falls back to asking one helper at a time).
// Nothing here pretends a request was sent: callers only get { ok: true } after the database confirmed.

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; missing: boolean };

type Err = { message: string; code?: string } | null;
/** The function or table is not in the database yet (migration not applied). */
export const isMissing = (e: Err): boolean => {
  const m = (e?.message ?? "").toLowerCase();
  return e?.code === "PGRST202" || e?.code === "42883" || e?.code === "42P01" || m.includes("could not find the function") || m.includes("does not exist") || m.includes("schema cache");
};

async function run<T>(fn: () => PromiseLike<{ data: T | null; error: Err }>): Promise<Result<T | null>> {
  try {
    const { data, error } = await fn();
    if (error) return { ok: false, error: friendlyCircleError(error.message), missing: isMissing(error) };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: friendlyCircleError(e instanceof Error ? e.message : undefined), missing: false };
  }
}

export function friendlyCircleError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("already covered") || m.includes("already accepted")) return "Someone already accepted. Nothing else was sent.";
  if (m.includes("nobody available")) return "Nobody is available right now. Approved people are outside their pickup hours or have paused requests. Try again later or call someone directly.";
  if (m.includes("nobody to ask")) return "Nobody can be asked yet. No approved family member or helper has joined SafeNest.";
  if (m.includes("not opted in")) return "Automatic backup is not turned on for this child.";
  if (m.includes("too early")) return "That request is still open. It can only expire after the waiting time.";
  return friendlyBackupError(message);
}

export type BroadcastState = "open" | "covered" | "exhausted" | "cancelled" | "completed";
export type DbRecipientState = "requested" | "accepted" | "declined" | "expired" | "closed" | "cancelled" | "completed";

export type BroadcastRow = {
  broadcast_id: string;
  broadcast_state: BroadcastState;
  reason: "auto" | "manual" | "again";
  started_at: string;
  request_id: string;
  recipient_name: string;
  recipient_role: string | null;
  recipient_kind: "family" | "circle";
  request_state: DbRecipientState;
  responded_at: string | null;
};

export type Broadcast = {
  id: string;
  state: BroadcastState;
  reason: "auto" | "manual" | "again";
  startedAt: string;
  recipients: Array<{ requestId: string; name: string; role: string; kind: "family" | "circle"; state: DbRecipientState }>;
};

export const recipientStatus = (s: DbRecipientState): RecipientStatus =>
  s === "accepted" || s === "completed" ? "accepted" : s === "declined" ? "declined" : s === "expired" ? "no_response" : s === "closed" || s === "cancelled" ? "closed" : "pending";

export function groupBroadcast(rows: BroadcastRow[]): Broadcast | null {
  if (rows.length === 0) return null;
  const first = rows[0];
  return {
    id: first.broadcast_id,
    state: first.broadcast_state,
    reason: first.reason,
    startedAt: first.started_at,
    recipients: rows.map((r) => ({ requestId: r.request_id, name: r.recipient_name, role: r.recipient_role ?? "", kind: r.recipient_kind, state: r.request_state })),
  };
}

/** The newest round for this child, or null. */
export async function fetchBroadcast(childId: string): Promise<Result<Broadcast | null>> {
  const res = await run<BroadcastRow[]>(() => supabase.rpc("my_broadcast", { target_child: childId }));
  if (!res.ok) return res;
  return { ok: true, data: groupBroadcast(res.data ?? []) };
}

/** Ask everyone eligible at once. Safe to call twice: an open round is returned, never duplicated. */
export async function startBroadcast(childId: string, reason: "auto" | "manual" | "again"): Promise<Result<{ broadcastId: string; created: boolean; asked: number } | null>> {
  const res = await run<Array<{ broadcast_id: string; created: boolean; asked: number }>>(() => supabase.rpc("start_backup_broadcast", { target_child: childId, trigger_reason: reason }));
  if (!res.ok) return res;
  const row = res.data?.[0];
  return { ok: true, data: row ? { broadcastId: row.broadcast_id, created: row.created, asked: row.asked } : null };
}

export async function cancelBroadcast(broadcastId: string): Promise<Result<null>> {
  const res = await run<null>(() => supabase.rpc("cancel_backup_broadcast", { target_broadcast: broadcastId }));
  return res.ok ? { ok: true, data: null } : res;
}

/** Marks requests nobody answered as "No response". The database refuses it before the waiting time is over. */
export async function expireBroadcast(broadcastId: string): Promise<Result<null>> {
  const res = await run<null>(() => supabase.rpc("expire_backup_broadcast", { target_broadcast: broadcastId }));
  return res.ok ? { ok: true, data: null } : res;
}

export async function fetchEscalationSettings(childId: string): Promise<Result<EscalationSettings & { consentedAt: string | null }>> {
  const res = await run<Array<{ enabled: boolean; minutes_before: number; response_window_minutes: number; consented_at: string | null }>>(() => supabase.rpc("get_auto_escalation", { target_child: childId }));
  if (!res.ok) return res;
  const r = res.data?.[0];
  return { ok: true, data: r ? { enabled: r.enabled, minutesBefore: r.minutes_before, responseWindowMinutes: r.response_window_minutes, consentedAt: r.consented_at } : { ...ESCALATION_DEFAULTS, consentedAt: null } };
}

export async function saveEscalationSettings(childId: string, s: EscalationSettings): Promise<Result<null>> {
  const res = await run<null>(() => supabase.rpc("set_auto_escalation", { target_child: childId, is_enabled: s.enabled, before_minutes: s.minutesBefore, window_minutes: s.responseWindowMinutes }));
  return res.ok ? { ok: true, data: null } : res;
}

/** Tells the server how today looks from the parent's phone so a scheduled check can act when the app is closed. */
export async function reportPickupStatus(childId: string, dismissalAt: Date, predictedArrival: Date | null, parentResponse: "none" | "will_collect"): Promise<Result<null>> {
  const res = await run<null>(() => supabase.rpc("report_pickup_status", {
    target_child: childId,
    dismissal_at: dismissalAt.toISOString(),
    predicted_arrival: predictedArrival ? predictedArrival.toISOString() : null,
    parent_response: parentResponse,
  }));
  return res.ok ? { ok: true, data: null } : res;
}
