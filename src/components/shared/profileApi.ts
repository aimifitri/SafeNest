import type { User } from "@supabase/supabase-js";

import { supabase } from "../../lib/supabase";
import type { AccountType, Gender, Language } from "./accountRules";
import { checkEmail, checkPassword } from "./accountRules";

// The signed-in person's own profile. Source of truth, in order:
// 1. public.profiles, including the new columns from supabase/account_household.sql once that is applied;
// 2. otherwise the sign-up details kept in Supabase Auth user metadata (works on today's database).
// Writes go to both, so the profile survives restarts, logouts and a database that has not been upgraded yet.

export type AccountProfile = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  accountType: AccountType | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  language: Language;
  relationship: string;
  createdAt: string | null;
  /** true when the extra fields come only from Auth metadata because the profile columns do not exist yet. */
  metadataOnly: boolean;
};

type Row = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const GENDERS = ["female", "male", "non_binary", "prefer_not_to_say"];
const LANGS = ["en", "ms", "zh", "ta"];

export function profileFrom(user: Pick<User, "id" | "email" | "created_at" | "user_metadata">, row: Row | null, extendedColumns: boolean): AccountProfile {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const pick = (col: string, key: string) => (extendedColumns && row && row[col] != null ? str(row[col]) : str(meta[key]));
  const type = pick("account_type", "account_type");
  const gender = pick("gender", "gender");
  const lang = pick("language", "language");
  return {
    id: user.id,
    fullName: str(row?.full_name) || str(meta.full_name),
    email: str(row?.email) || user.email || "",
    phone: str(row?.phone) || str(meta.phone),
    accountType: type === "parent" || type === "helper" ? type : null,
    dateOfBirth: pick("date_of_birth", "date_of_birth") || null,
    gender: GENDERS.includes(gender) ? (gender as Gender) : null,
    language: LANGS.includes(lang) ? (lang as Language) : "en",
    relationship: pick("relationship_to_child", "relationship"),
    createdAt: str(row?.created_at) || user.created_at || null,
    metadataOnly: !extendedColumns,
  };
}

const LEGACY = "id, full_name, role, email, phone, created_at";
const EXTENDED = `${LEGACY}, account_type, date_of_birth, gender, language, relationship_to_child`;

export async function loadProfile(user: User): Promise<{ profile: AccountProfile | null; error: string | null }> {
  try {
    let extended = true;
    let res = await supabase.from("profiles").select(EXTENDED).eq("id", user.id).maybeSingle();
    if (res.error) {
      extended = false;
      res = await supabase.from("profiles").select(LEGACY).eq("id", user.id).maybeSingle();
    }
    if (res.error) return { profile: null, error: "We couldn't load your profile. Please try again." };
    if (!res.data) return { profile: null, error: "We couldn't find your profile. Please try again." };
    return { profile: profileFrom(user, res.data as unknown as Row, extended), error: null };
  } catch {
    return { profile: null, error: "We couldn't load your profile. Check your connection and try again." };
  }
}

export type ProfilePatch = {
  fullName: string;
  phone: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  language: Language;
  relationship: string;
};

export async function saveProfile(userId: string, patch: ProfilePatch): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const extended = await supabase
      .from("profiles")
      .update({
        full_name: patch.fullName, phone: patch.phone || null, date_of_birth: patch.dateOfBirth, gender: patch.gender,
        language: patch.language, relationship_to_child: patch.relationship || null,
      })
      .eq("id", userId)
      .select("id");
    if (extended.error) {
      // Columns not added yet: keep the original two fields in the table.
      const legacy = await supabase.from("profiles").update({ full_name: patch.fullName, phone: patch.phone || null }).eq("id", userId).select("id");
      if (legacy.error || !legacy.data?.length) return { ok: false, error: "We couldn't save your changes. Nothing was changed." };
    } else if (!extended.data?.length) {
      return { ok: false, error: "We couldn't save your changes. Nothing was changed." };
    }
    // Keep a copy in Auth metadata so the extra fields still survive on a database without the new columns.
    const meta = await supabase.auth.updateUser({
      data: {
        full_name: patch.fullName, phone: patch.phone, date_of_birth: patch.dateOfBirth, gender: patch.gender,
        language: patch.language, relationship: patch.relationship,
      },
    });
    if (meta.error) return { ok: false, error: "Saved, but we couldn't update your sign-in details. Please try again." };
    return { ok: true };
  } catch {
    return { ok: false, error: "No connection. Nothing was saved." };
  }
}

// ---------------------------------------------------------------- sensitive changes: re-check the current password first

async function reauthenticate(email: string, currentPassword: string): Promise<string | null> {
  if (!currentPassword) return "Enter your current password.";
  const { error } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  return error ? "Your current password is not correct." : null;
}

export async function changePassword(email: string, currentPassword: string, next: string, confirm: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const bad = checkPassword(next);
  if (bad) return { ok: false, error: bad };
  if (next !== confirm) return { ok: false, error: "Passwords do not match." };
  if (next === currentPassword) return { ok: false, error: "Choose a password you have not used just now." };
  const re = await reauthenticate(email, currentPassword);
  if (re) return { ok: false, error: re };
  const { error } = await supabase.auth.updateUser({ password: next });
  return error ? { ok: false, error: "We couldn't change your password. Please try again." } : { ok: true };
}

/** Supabase emails a confirmation link to the new address. The email only changes after the person confirms it. */
export async function requestEmailChange(currentEmail: string, currentPassword: string, newEmail: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const bad = checkEmail(newEmail);
  if (bad) return { ok: false, error: bad };
  if (newEmail.trim().toLowerCase() === currentEmail.toLowerCase()) return { ok: false, error: "That is already your email address." };
  const re = await reauthenticate(currentEmail, currentPassword);
  if (re) return { ok: false, error: re };
  const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
  return error ? { ok: false, error: "We couldn't start the email change. Please try again." } : { ok: true };
}

/** Sends a reset email if the project has email sending configured. The in-app screen for the link is not built. */
export async function requestPasswordReset(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const bad = checkEmail(email);
  if (bad) return { ok: false, error: bad };
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  return error ? { ok: false, error: "We couldn't send the email. Please try again later." } : { ok: true };
}
