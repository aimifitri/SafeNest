import { supabase } from "../../lib/supabase";
import type { BackupRequest } from "./types";

// Backup-pickup calls to Supabase. Every write goes through a database function
// (supabase/pickup_workflow.sql), which decides who is allowed to do what.
// Nothing here pretends a change worked: callers get { ok:false, error } instead.

export type DbBackupState = "requested" | "accepted" | "declined" | "cancelled" | "completed";

export type DbBackupRequest = {
  id: string;
  child_id: string;
  helper_id: string | null;
  state: DbBackupState;
  requested_at: string;
  responded_at: string | null;
};

export type BackupAssignment = {
  request_id: string;
  state: "requested" | "accepted";
  requested_at: string;
  child_name: string;
  school_name: string | null;
  school_address: string | null;
  requested_by_name: string;
};

export type ApiResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string | undefined | null): value is string => !!value && UUID.test(value);

/** Turns database errors into short messages a parent can act on. */
export function friendlyBackupError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("already active")) return "A backup request is already open for this child. Cancel it first.";
  if (m.includes("not joined")) return "This helper has not joined SafeNest yet, so they cannot answer.";
  if (m.includes("not approved")) return "This helper is not approved yet.";
  if (m.includes("already accepted")) return "This request was already accepted.";
  if (m.includes("already declined")) return "This request was already declined.";
  if (m.includes("already cancelled")) return "This request was cancelled.";
  if (m.includes("already completed")) return "This pickup is already marked complete.";
  if (m.includes("only an accepted")) return "Only an accepted request can be marked complete.";
  if (m.includes("not allowed")) return "You are not allowed to do that.";
  if (m.includes("not signed in") || m.includes("jwt")) return "Your session ended. Please log in again.";
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("timeout")) {
    return "No connection. Nothing was sent. Try again when you are online.";
  }
  return "Something went wrong. Nothing was changed. Please try again.";
}

async function call<T>(run: () => PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<ApiResult<T | null>> {
  try {
    const { data, error } = await run();
    if (error) return { ok: false, error: friendlyBackupError(error.message) };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: friendlyBackupError(e instanceof Error ? e.message : undefined) };
  }
}

/** The first child stored for this family, or null if none has been saved yet. */
export async function fetchFirstChildId(familyId: string): Promise<string | null> {
  const res = await call<{ id: string }[]>(() =>
    supabase.from("children").select("id").eq("family_id", familyId).order("created_at", { ascending: true }).limit(1),
  );
  return res.ok ? res.data?.[0]?.id ?? null : null;
}

export async function fetchLatestRequest(childId: string): Promise<ApiResult<DbBackupRequest | null>> {
  const res = await call<DbBackupRequest[]>(() =>
    supabase
      .from("backup_requests")
      .select("id, child_id, helper_id, state, requested_at, responded_at")
      .eq("child_id", childId)
      .order("requested_at", { ascending: false })
      .limit(1),
  );
  if (!res.ok) return res;
  return { ok: true, data: res.data?.[0] ?? null };
}

export async function createBackupRequest(childId: string, helperId: string): Promise<ApiResult<string | null>> {
  return call<string>(() => supabase.rpc("request_backup", { target_child: childId, target_helper: helperId }));
}

export async function respondToRequest(requestId: string, accept: boolean): Promise<ApiResult<string | null>> {
  return call<string>(() => supabase.rpc("respond_backup_request", { target_request: requestId, accept }));
}

export async function cancelRequest(requestId: string): Promise<ApiResult<null>> {
  const res = await call<null>(() => supabase.rpc("cancel_backup_request", { target_request: requestId }));
  return res.ok ? { ok: true, data: null } : res;
}

export async function completeRequest(requestId: string): Promise<ApiResult<null>> {
  const res = await call<null>(() => supabase.rpc("complete_backup_request", { target_request: requestId }));
  return res.ok ? { ok: true, data: null } : res;
}

export async function fetchAssignments(): Promise<ApiResult<BackupAssignment[]>> {
  const res = await call<BackupAssignment[]>(() => supabase.rpc("my_backup_assignments"));
  return res.ok ? { ok: true, data: res.data ?? [] } : res;
}

/**
 * Calls onChange whenever any backup request visible to this user changes.
 * Row Level Security decides which changes a user is told about. Returns an unsubscribe function.
 */
export function subscribeToRequests(key: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`backup-requests-${key}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "backup_requests" }, () => onChange())
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

/** What the screens show for a stored request. Finished or cancelled requests count as "no request". */
export function toUiRequest(row: DbBackupRequest | null, dismissedId: string | null): BackupRequest {
  if (!row || row.id === dismissedId || row.state === "cancelled" || row.state === "completed") {
    return { state: "idle", simulated: false };
  }
  return {
    id: row.id,
    state: row.state,
    helperId: row.helper_id ?? undefined,
    requestedAt: row.requested_at,
    simulated: false,
  };
}
