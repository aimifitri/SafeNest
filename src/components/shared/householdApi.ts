import { supabase } from "../../lib/supabase";
import { call, isUuid, type ApiResult } from "./backupApi";
import type { ChildDraft } from "./accountRules";
import type { ContactState } from "./types";

// Household data for a real account: children, family roster, Trusted Circle helpers and the weekly plan.
// Everything here works with the tables in supabase/schema.sql. The calls that need the proposed upgrade
// (supabase/account_household.sql) report { missing: true } so the screen can say so, instead of pretending.
// Every write is checked by Row Level Security in the database as well; the UI hiding a button is not the check.

export type HChild = {
  id: string;
  name: string;
  age: number | null;
  className: string;
  schoolName: string;
  schoolAddress: string;
  teacherName: string;
  teacherPhone: string;
};

export type HHelper = {
  id: string;
  name: string;
  role: string;
  phone: string;
  state: ContactState;
  /** Set once the helper has joined with an invite code. A helper without it cannot answer requests. */
  userId: string | null;
};

export type HMember = {
  userId: string;
  name: string;
  email: string;
  phone: string;
  isAdmin: boolean;
  accountType: "parent" | "helper" | null;
  relationship: string;
  /** Explicit pickup authorization. Being family does not set this. Needs the proposed upgrade, else false. */
  canCollect: boolean;
};

export type PendingFamilyInvite = { id: string; email: string; relationship: string; canCollect: boolean; expiresAt: string };

export type Missing<T> = { ok: true; data: T } | { ok: false; error: string; missing: boolean };

const isMissingErr = (m: string | undefined) => {
  const s = (m ?? "").toLowerCase();
  return s.includes("could not find") || s.includes("does not exist") || s.includes("schema cache") || s.includes("42883") || s.includes("pgrst202");
};

type RawErr = { message: string; code?: string } | null;
async function run<T>(fn: () => PromiseLike<{ data: T | null; error: RawErr }>): Promise<Missing<T | null>> {
  try {
    const { data, error } = await fn();
    if (error) {
      const missing = isMissingErr(error.message) || error.code === "PGRST202" || error.code === "42P01" || error.code === "42883";
      return { ok: false, error: friendlyHouseholdError(error.message, error.code), missing };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: friendlyHouseholdError(e instanceof Error ? e.message : undefined), missing: false };
  }
}

export function friendlyHouseholdError(message: string | undefined, code?: string): string {
  const m = (message ?? "").toLowerCase();
  if (code === "42501" || m.includes("row-level security") || m.includes("permission denied") || m.includes("not allowed")) return "You do not have permission to do that.";
  if (m.includes("invalid or has expired") || m.includes("invalid invite") || m.includes("expired")) return "This code is invalid or has expired. Ask for a new one.";
  if (m.includes("already linked") || m.includes("already a member")) return "This invitation was already used.";
  if (m.includes("not signed in") || m.includes("jwt")) return "Your session ended. Please log in again.";
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("timeout")) return "No connection. Nothing was saved. Try again when you are online.";
  if (m.includes("check constraint")) return "One of the values is not allowed. Check the form and try again.";
  return "Something went wrong. Nothing was changed. Please try again.";
}

// ---------------------------------------------------------------- children

type ChildRow = {
  id: string; name: string; age: number | null; class_name: string | null; school_name: string | null;
  school_address: string | null; teacher_name: string | null; teacher_phone: string | null;
};
const CHILD_COLS = "id, name, age, class_name, school_name, school_address, teacher_name, teacher_phone";
const toChild = (r: ChildRow): HChild => ({
  id: r.id, name: r.name, age: r.age, className: r.class_name ?? "", schoolName: r.school_name ?? "",
  schoolAddress: r.school_address ?? "", teacherName: r.teacher_name ?? "", teacherPhone: r.teacher_phone ?? "",
});

export async function fetchChildren(familyId: string): Promise<ApiResult<HChild[]>> {
  const res = await call<ChildRow[]>(() =>
    supabase.from("children").select(CHILD_COLS).eq("family_id", familyId).order("created_at", { ascending: true }),
  );
  return res.ok ? { ok: true, data: (res.data ?? []).map(toChild) } : res;
}

const childPayload = (d: ChildDraft) => ({
  name: d.name.trim(),
  age: d.age.trim() ? Number(d.age) : null,
  class_name: d.className.trim() || null,
  school_name: d.schoolName.trim() || null,
  school_address: d.schoolAddress.trim() || null,
  teacher_name: d.teacherName.trim() || null,
  teacher_phone: d.teacherPhone.trim() || null,
});

export async function addChild(familyId: string, d: ChildDraft): Promise<ApiResult<string>> {
  const res = await call<{ id: string }>(() =>
    supabase.from("children").insert({ family_id: familyId, ...childPayload(d) }).select("id").single(),
  );
  return res.ok && res.data ? { ok: true, data: res.data.id } : { ok: false, error: res.ok ? "Could not save the child profile." : res.error };
}

export async function updateChild(childId: string, d: ChildDraft): Promise<ApiResult<null>> {
  const res = await call<unknown>(() => supabase.from("children").update(childPayload(d)).eq("id", childId).select("id"));
  if (!res.ok) return res;
  // RLS hides rows you may not change: no row back means nothing was saved.
  return Array.isArray(res.data) && res.data.length > 0 ? { ok: true, data: null } : { ok: false, error: "You do not have permission to do that." };
}

export async function deleteChild(childId: string): Promise<ApiResult<null>> {
  const res = await call<unknown>(() => supabase.from("children").delete().eq("id", childId).select("id"));
  if (!res.ok) return res;
  return Array.isArray(res.data) && res.data.length > 0 ? { ok: true, data: null } : { ok: false, error: "Only a family admin can remove a child profile." };
}

// ---------------------------------------------------------------- Trusted Circle helpers

type HelperRow = { id: string; name: string; role: string; phone: string | null; state: ContactState; user_id: string | null };

export async function fetchHelpers(familyId: string): Promise<ApiResult<HHelper[]>> {
  const res = await call<HelperRow[]>(() =>
    supabase.from("trusted_helpers").select("id, name, role, phone, state, user_id").eq("family_id", familyId).order("created_at", { ascending: true }),
  );
  if (!res.ok) return res;
  return {
    ok: true,
    data: (res.data ?? []).map((r) => ({ id: r.id, name: r.name, role: r.role, phone: r.phone ?? "", state: r.state, userId: r.user_id })),
  };
}

/** Always creates a pending entry. Approval is a separate step that only a family admin can do (RLS). */
export async function addHelper(familyId: string, d: { name: string; relationship: string; phone: string }): Promise<ApiResult<string>> {
  const res = await call<{ id: string }>(() =>
    supabase.from("trusted_helpers").insert({ family_id: familyId, name: d.name.trim(), role: d.relationship.trim(), phone: d.phone.trim() || null, state: "pending" }).select("id").single(),
  );
  return res.ok && res.data ? { ok: true, data: res.data.id } : { ok: false, error: res.ok ? "Could not add this helper." : res.error };
}

export async function setHelperState(helperId: string, state: ContactState): Promise<ApiResult<null>> {
  const res = await call<unknown>(() => supabase.from("trusted_helpers").update({ state }).eq("id", helperId).select("id"));
  if (!res.ok) return res;
  return Array.isArray(res.data) && res.data.length > 0 ? { ok: true, data: null } : { ok: false, error: "Only a family admin can approve or decline helpers." };
}

export async function removeHelper(helperId: string): Promise<ApiResult<null>> {
  const res = await call<unknown>(() => supabase.from("trusted_helpers").delete().eq("id", helperId).select("id"));
  if (!res.ok) return res;
  return Array.isArray(res.data) && res.data.length > 0 ? { ok: true, data: null } : { ok: false, error: "Only a family admin can remove helpers." };
}

/** Existing RPC from schema.sql. Returns a one-time code the helper types in after they sign up. No email is sent. */
export async function createHelperInvite(helperId: string): Promise<ApiResult<string>> {
  if (!isUuid(helperId)) return { ok: false, error: "Save this helper first." };
  const res = await call<string>(() => supabase.rpc("create_helper_invite", { target_helper: helperId }));
  return res.ok && res.data ? { ok: true, data: res.data } : { ok: false, error: res.ok ? "Could not create a code." : res.error };
}

/** Existing RPC from schema.sql. Links the signed-in account to the helper entry the code belongs to. */
export async function acceptHelperInvite(code: string): Promise<ApiResult<string>> {
  const token = code.trim();
  if (token.length < 16) return { ok: false, error: "That code is too short. Paste the whole code." };
  const res = await run<string>(() => supabase.rpc("accept_helper_invite", { invite_token: token }));
  return res.ok && res.data ? { ok: true, data: res.data } : { ok: false, error: res.ok ? "Could not use this code." : res.error };
}

// ---------------------------------------------------------------- family roster and family invitations

type RosterRow = {
  user_id: string; full_name: string | null; email: string | null; phone: string | null; family_role: string;
  account_type?: string | null; relationship?: string | null; can_collect?: boolean | null;
};

/**
 * Names of the people in this family. Profiles are readable only by their owner (schema.sql), so other members need the
 * proposed `family_roster` function. Without it we still list the members, using "Family member" for names we cannot read.
 */
export async function fetchRoster(familyId: string, selfId: string, selfName: string): Promise<{ members: HMember[]; namesAvailable: boolean }> {
  const rpc = await run<RosterRow[]>(() => supabase.rpc("family_roster", { target_family: familyId }));
  if (rpc.ok && rpc.data) {
    return {
      namesAvailable: true,
      members: rpc.data.map((r) => ({
        userId: r.user_id, name: r.full_name || r.email || "Family member", email: r.email ?? "", phone: r.phone ?? "",
        isAdmin: r.family_role === "admin", accountType: r.account_type === "helper" ? "helper" : r.account_type === "parent" ? "parent" : null,
        relationship: r.relationship ?? "", canCollect: r.can_collect === true,
      })),
    };
  }
  const res = await call<Array<{ user_id: string; role: string }>>(() => supabase.from("family_members").select("user_id, role").eq("family_id", familyId));
  const rows = res.ok ? res.data ?? [] : [];
  return {
    namesAvailable: false,
    members: rows.map((r) => ({
      userId: r.user_id, name: r.user_id === selfId ? selfName : "Family member", email: "", phone: "", isAdmin: r.role === "admin",
      accountType: null, relationship: "", canCollect: false,
    })),
  };
}

export async function createFamilyInvite(familyId: string, d: { relationship: string; canCollect: boolean }): Promise<Missing<string>> {
  const res = await run<string>(() => supabase.rpc("create_family_invite", { target_family: familyId, rel: d.relationship, may_collect: d.canCollect }));
  return res.ok && res.data ? { ok: true, data: res.data } : { ok: false, error: res.ok ? "Could not create a code." : res.error, missing: !res.ok && res.missing };
}

export async function acceptFamilyInvite(code: string): Promise<Missing<string>> {
  const token = code.trim();
  if (token.length < 16) return { ok: false, error: "That code is too short. Paste the whole code.", missing: false };
  const res = await run<string>(() => supabase.rpc("accept_family_invite", { invite_token: token }));
  return res.ok && res.data ? { ok: true, data: res.data } : { ok: false, error: res.ok ? "Could not use this code." : res.error, missing: !res.ok && res.missing };
}

export async function fetchFamilyInvites(familyId: string): Promise<PendingFamilyInvite[]> {
  const res = await run<Array<{ id: string; relationship: string | null; can_collect: boolean; expires_at: string }>>(() => supabase.rpc("pending_family_invites", { target_family: familyId }));
  if (!res.ok || !res.data) return [];
  return res.data.map((r) => ({ id: r.id, email: "", relationship: r.relationship ?? "", canCollect: r.can_collect, expiresAt: r.expires_at }));
}

export async function revokeFamilyInvite(inviteId: string): Promise<Missing<null>> {
  const res = await run<unknown>(() => supabase.rpc("revoke_family_invite", { target_invite: inviteId }));
  return res.ok ? { ok: true, data: null } : { ok: false, error: res.error, missing: res.missing };
}

export async function removeFamilyMember(familyId: string, userId: string): Promise<ApiResult<null>> {
  const res = await call<unknown>(() => supabase.from("family_members").delete().eq("family_id", familyId).eq("user_id", userId).select("user_id"));
  if (!res.ok) return res;
  return Array.isArray(res.data) && res.data.length > 0 ? { ok: true, data: null } : { ok: false, error: "Only a family admin can remove members." };
}

/** Admin only (RLS). Family membership is not pickup authorization; this is the switch that grants it. */
export async function setMemberCanCollect(familyId: string, userId: string, canCollect: boolean): Promise<ApiResult<null>> {
  const res = await call<unknown>(() => supabase.from("family_members").update({ can_collect: canCollect }).eq("family_id", familyId).eq("user_id", userId).select("user_id"));
  if (!res.ok) return res;
  return Array.isArray(res.data) && res.data.length > 0 ? { ok: true, data: null } : { ok: false, error: "Only a family admin can change who may collect." };
}

export async function fetchFamilyName(familyId: string): Promise<string> {
  const res = await call<{ name: string }>(() => supabase.from("families").select("name").eq("id", familyId).maybeSingle());
  return res.ok && res.data ? res.data.name : "";
}

export async function renameFamily(familyId: string, name: string): Promise<ApiResult<null>> {
  const clean = name.trim();
  if (!clean) return { ok: false, error: "Enter a household name." };
  if (clean.length > 60) return { ok: false, error: "That name is too long." };
  const res = await call<unknown>(() => supabase.from("families").update({ name: clean }).eq("id", familyId).select("id"));
  if (!res.ok) return res;
  return Array.isArray(res.data) && res.data.length > 0 ? { ok: true, data: null } : { ok: false, error: "Only a family admin can rename the household." };
}

// ---------------------------------------------------------------- weekly plan (public.pickup_plans, already in schema.sql)

export async function fetchPlan(childId: string): Promise<ApiResult<Record<number, string>>> {
  const res = await call<Array<{ weekday: number; dismissal_time: string }>>(() =>
    supabase.from("pickup_plans").select("weekday, dismissal_time").eq("child_id", childId),
  );
  if (!res.ok) return res;
  const out: Record<number, string> = {};
  for (const r of res.data ?? []) out[r.weekday] = r.dismissal_time;
  return { ok: true, data: out };
}

export async function savePlanDay(familyId: string, childId: string, weekday: number, time: string): Promise<ApiResult<null>> {
  const res = await call<unknown>(() =>
    supabase.from("pickup_plans").upsert({ family_id: familyId, child_id: childId, weekday, dismissal_time: time }, { onConflict: "child_id,weekday" }).select("weekday"),
  );
  return res.ok ? { ok: true, data: null } : res;
}
