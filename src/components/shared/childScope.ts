import { mockData } from "./mockData";
import type { ChildDraft } from "./accountRules";
import type { HChild } from "./householdApi";
import type { Weekday } from "./types";
export const SECOND_DEMO_CHILD_ID = "demo-child-hana";
export function demoChildren(): HChild[] {
  const first = { ...mockData.child, schoolName: mockData.school.name, schoolAddress: mockData.school.address, teacherName: mockData.school.teacher, teacherPhone: mockData.school.teacherPhone };
  return [first, { ...first, id: SECOND_DEMO_CHILD_ID, name: "Hana (demo)", age: 6, className: "1 Melati" }];
}
export function resolveChild<T extends { id: string }>(children: readonly T[], selected: string | null): T | null {
  return children.find(child => child.id === selected) ?? children[0] ?? null;
}
export function childScope(account: string, family: string | null, child: string | null): string { return JSON.stringify([account, family, child]); }
export function initialWeek(childId: string | null, demo: boolean): Record<Weekday, string> {
  if (demo && childId === mockData.child.id) return { ...mockData.schedule.weekdayTimes };
  return { 1: demo ? "2:30 PM" : "1:00 PM", 2: demo ? "2:30 PM" : "1:00 PM", 3: demo ? "2:30 PM" : "1:00 PM", 4: demo ? "2:30 PM" : "1:00 PM", 5: demo ? "12:00 PM" : "1:00 PM" };
}

// Used only after the existing ChildForm validation, never persisted or sent to Supabase.
export function demoChildFromDraft(d: ChildDraft, id: string): HChild {
  return { id, name: d.name.trim(), age: d.age.trim() ? Number(d.age) : null, className: d.className.trim(), schoolName: d.schoolName.trim(), schoolAddress: d.schoolAddress.trim(), teacherName: d.teacherName.trim(), teacherPhone: d.teacherPhone.trim() };
}
