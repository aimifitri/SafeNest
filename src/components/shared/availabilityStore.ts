import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "../../lib/supabase";
import { coerceAvailability, deviceTimeZone, type Availability } from "./availability";

// Where "My Pickup Availability" is kept.
// - Shared: public.pickup_availability (supabase/account_household.sql, a proposal until the backend team applies it).
//   This is what lets a parent see a helper's real availability on another phone.
// - This device: AsyncStorage. Used only while the table does not exist. The screen says so, because other people
//   cannot see settings that live only on this phone, and the simultaneous request cannot use them.

const key = (userId: string) => `safenest:availability:${userId}`;

export type StoredAvailability = { availability: Availability | null; where: "shared" | "device" | "none" };

export async function loadOwnAvailability(userId: string): Promise<StoredAvailability> {
  try {
    const { data, error } = await supabase.from("pickup_availability").select("settings").eq("user_id", userId).maybeSingle();
    if (!error) return data ? { availability: coerceAvailability(data.settings, deviceTimeZone()), where: "shared" } : { availability: null, where: "shared" };
  } catch {
    // fall through to the device copy
  }
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    return raw ? { availability: coerceAvailability(JSON.parse(raw), deviceTimeZone()), where: "device" } : { availability: null, where: "none" };
  } catch {
    return { availability: null, where: "none" };
  }
}

export async function saveOwnAvailability(userId: string, a: Availability): Promise<{ ok: true; where: "shared" | "device" } | { ok: false; error: string }> {
  try {
    const { error } = await supabase.from("pickup_availability").upsert({ user_id: userId, settings: a, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (!error) return { ok: true, where: "shared" };
  } catch {
    // fall through
  }
  try {
    await AsyncStorage.setItem(key(userId), JSON.stringify(a));
    return { ok: true, where: "device" };
  } catch {
    return { ok: false, error: "We couldn't save your availability. Nothing was changed." };
  }
}

/** Other people's availability, for the Circle. Only exists with the shared table; otherwise nobody else's is known. */
export async function loadFamilyAvailability(userIds: string[]): Promise<Record<string, Availability>> {
  if (userIds.length === 0) return {};
  try {
    const { data, error } = await supabase.from("pickup_availability").select("user_id, settings").in("user_id", userIds);
    if (error || !data) return {};
    const out: Record<string, Availability> = {};
    for (const r of data as Array<{ user_id: string; settings: unknown }>) out[r.user_id] = coerceAvailability(r.settings, deviceTimeZone());
    return out;
  } catch {
    return {};
  }
}
