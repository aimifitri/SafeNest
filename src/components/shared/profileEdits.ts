import { useSyncExternalStore } from "react";

// Frontend-only edits to a caregiver's contact details. Held in app memory for this session, nothing is sent anywhere.
// Kept outside AppContext so the team's shared-state contract is unchanged.
export type ProfileEdit = { phone?: string; email?: string };
let edits: Record<string, ProfileEdit> = {};
const listeners = new Set<() => void>();

export function saveProfileEdit(id: string, edit: ProfileEdit): void {
  edits = { ...edits, [id]: { ...edits[id], ...edit } };
  listeners.forEach((l) => l());
}

export function useProfileEdits(): Record<string, ProfileEdit> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    () => edits,
    () => edits,
  );
}

export function isValidPhone(v: string): boolean {
  return /^\+?[0-9][0-9 \-]{6,17}[0-9]$/.test(v.trim());
}
export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}
