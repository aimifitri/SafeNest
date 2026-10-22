// Pure model for "My Pickup Availability". Times are minutes after midnight in the schedule's own time zone.
// Availability answers one question only: "may SafeNest ask this person right now?".
// It never grants permission to collect a child. Approval (trusted_helpers.state = 'active') does that, and
// "accepted this pickup" is a separate, per-request fact.

export type Slot = { start: number; end: number };
/** 0 = Sunday ... 6 = Saturday, the same as Date#getDay. */
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type OneTimeOverride = {
  /** Local calendar date in the schedule's time zone, YYYY-MM-DD. */
  date: string;
  /** "unavailable" blocks the whole day. "available" replaces that day's slots with `slots`. */
  kind: "unavailable" | "available";
  slots: Slot[];
};

export type Availability = {
  /** When off, the person is not asked for any pickup, whatever the schedule says. */
  accepting: boolean;
  /** Vacation mode. Blocks everything until the end date (inclusive). A null end date means until switched off. */
  vacation: { on: boolean; until: string | null };
  timeZone: string;
  weekly: Record<WeekDay, Slot[]>;
  overrides: OneTimeOverride[];
};

export const WEEKDAYS: ReadonlyArray<{ day: WeekDay; short: string; long: string }> = [
  { day: 1, short: "Mon", long: "Monday" },
  { day: 2, short: "Tue", long: "Tuesday" },
  { day: 3, short: "Wed", long: "Wednesday" },
  { day: 4, short: "Thu", long: "Thursday" },
  { day: 5, short: "Fri", long: "Friday" },
  { day: 6, short: "Sat", long: "Saturday" },
  { day: 0, short: "Sun", long: "Sunday" },
];

export const MAX_SLOTS_PER_DAY = 4;

export function emptyAvailability(timeZone = "Asia/Kuala_Lumpur"): Availability {
  return {
    accepting: true,
    vacation: { on: false, until: null },
    timeZone,
    weekly: { 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] },
    overrides: [],
  };
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kuala_Lumpur";
  } catch {
    return "Asia/Kuala_Lumpur";
  }
}

export function formatClock(min: number): string {
  const h24 = Math.floor(min / 60) % 24;
  const m = min % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function parseClock(label: string): number | null {
  const m = /^(1[0-2]|[1-9]):([0-5]\d)\s?(AM|PM)$/i.exec(label.trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return h * 60 + Number(m[2]);
}

export function formatSlot(s: Slot): string {
  return `${formatClock(s.start)} to ${formatClock(s.end)}`;
}

// ---------------------------------------------------------------- slot editing

export function checkSlot(s: Slot): string | null {
  if (!Number.isInteger(s.start) || !Number.isInteger(s.end)) return "Pick a start and an end time.";
  if (s.start < 0 || s.end > 24 * 60 || s.start >= s.end) return "The end time must be after the start time.";
  if (s.end - s.start < 15) return "A slot must be at least 15 minutes long.";
  return null;
}

/** Sorts and merges overlapping or touching slots. Invalid slots are dropped. */
export function normalizeSlots(slots: Slot[]): Slot[] {
  const ok = slots.filter((s) => checkSlot(s) === null).map((s) => ({ ...s })).sort((a, b) => a.start - b.start);
  const out: Slot[] = [];
  for (const s of ok) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push(s);
  }
  return out;
}

export function addSlot(slots: Slot[], s: Slot): { slots: Slot[]; error: string | null } {
  const bad = checkSlot(s);
  if (bad) return { slots, error: bad };
  if (slots.length >= MAX_SLOTS_PER_DAY) return { slots, error: `At most ${MAX_SLOTS_PER_DAY} slots per day.` };
  if (slots.some((x) => s.start < x.end && x.start < s.end)) return { slots, error: "That overlaps another slot on the same day." };
  return { slots: normalizeSlots([...slots, s]), error: null };
}

export function removeSlot(slots: Slot[], index: number): Slot[] {
  return slots.filter((_, i) => i !== index);
}

// ---------------------------------------------------------------- "what time is it there" without a date library

/** Local weekday, date and minute-of-day for an instant in a given IANA time zone. */
export function localParts(nowMs: number, timeZone: string): { weekday: WeekDay; date: string; minute: number } {
  let tz = timeZone;
  let parts: Intl.DateTimeFormatPart[];
  const make = (z: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: z, hour12: false, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(nowMs));
  try {
    parts = make(tz);
  } catch {
    tz = "UTC";
    parts = make(tz);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const map: Record<string, WeekDay> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = Number(get("hour")) % 24;
  return {
    weekday: map[get("weekday")] ?? 0,
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minute: hour * 60 + Number(get("minute")),
  };
}

// ---------------------------------------------------------------- the one decision

export type AvailabilityStatus =
  | { available: true; reason: "in_slot"; until: number }
  | { available: false; reason: "not_accepting" | "vacation" | "blocked_today" | "outside_hours" | "no_schedule" | "not_set_up"; nextStart: number | null };

export const REASON_LABEL: Record<Exclude<AvailabilityStatus, { available: true }>["reason"], string> = {
  not_accepting: "Not accepting pickup requests",
  vacation: "On a break",
  blocked_today: "Unavailable today",
  outside_hours: "Outside their hours",
  no_schedule: "No hours set",
  not_set_up: "Has not set availability",
};

/** Slots in effect on a local date: a one-time override beats the weekly pattern. */
export function slotsFor(a: Availability, date: string, weekday: WeekDay): { slots: Slot[]; blocked: boolean } {
  const o = a.overrides.find((x) => x.date === date);
  if (o) return o.kind === "unavailable" ? { slots: [], blocked: true } : { slots: normalizeSlots(o.slots), blocked: false };
  return { slots: normalizeSlots(a.weekly[weekday] ?? []), blocked: false };
}

export function availabilityAt(a: Availability | null, nowMs: number): AvailabilityStatus {
  if (!a) return { available: false, reason: "not_set_up", nextStart: null };
  if (!a.accepting) return { available: false, reason: "not_accepting", nextStart: null };
  const t = localParts(nowMs, a.timeZone);
  if (a.vacation.on && (a.vacation.until === null || t.date <= a.vacation.until)) {
    return { available: false, reason: "vacation", nextStart: null };
  }
  const { slots, blocked } = slotsFor(a, t.date, t.weekday);
  const hit = slots.find((s) => t.minute >= s.start && t.minute < s.end);
  if (hit) return { available: true, reason: "in_slot", until: hit.end };
  if (blocked) return { available: false, reason: "blocked_today", nextStart: null };
  const anyWeekly = Object.values(a.weekly).some((x) => x.length > 0);
  const anyOverride = a.overrides.some((o) => o.kind === "available" && o.date >= t.date);
  if (!anyWeekly && !anyOverride) return { available: false, reason: "no_schedule", nextStart: null };
  const next = slots.find((s) => s.start > t.minute);
  return { available: false, reason: "outside_hours", nextStart: next ? next.start : null };
}

/** One short line for the Circle and Settings: the same words everywhere. */
export function statusLine(a: Availability | null, nowMs: number): { tone: "ok" | "muted" | "warn"; text: string } {
  const s = availabilityAt(a, nowMs);
  if (s.available) return { tone: "ok", text: `Available until ${formatClock(s.until)}` };
  if (s.reason === "outside_hours" && s.nextStart !== null) return { tone: "muted", text: `Available from ${formatClock(s.nextStart)}` };
  return { tone: s.reason === "not_accepting" || s.reason === "vacation" ? "warn" : "muted", text: REASON_LABEL[s.reason] };
}

// ---------------------------------------------------------------- weekly summary and validation

export function summarizeWeek(a: Availability): string[] {
  return WEEKDAYS.map(({ day, short }) => {
    const slots = normalizeSlots(a.weekly[day] ?? []);
    return `${short}: ${slots.length ? slots.map(formatSlot).join(", ") : "Unavailable"}`;
  });
}

export function pruneOverrides(a: Availability, today: string): Availability {
  return { ...a, overrides: a.overrides.filter((o) => o.date >= today).sort((x, y) => (x.date < y.date ? -1 : 1)) };
}

export function checkDateString(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Defensive parse for anything read back from storage or the database. */
export function coerceAvailability(raw: unknown, fallbackTz = "Asia/Kuala_Lumpur"): Availability {
  const base = emptyAvailability(fallbackTz);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<Availability>;
  const weekly = { ...base.weekly };
  for (const d of [0, 1, 2, 3, 4, 5, 6] as WeekDay[]) {
    const v = (r.weekly as Record<string, unknown> | undefined)?.[String(d)];
    if (Array.isArray(v)) weekly[d] = normalizeSlots(v.filter((s): s is Slot => !!s && typeof s.start === "number" && typeof s.end === "number")).slice(0, MAX_SLOTS_PER_DAY);
  }
  const overrides = Array.isArray(r.overrides)
    ? r.overrides
        .filter((o): o is OneTimeOverride => !!o && typeof o.date === "string" && checkDateString(o.date) && (o.kind === "available" || o.kind === "unavailable"))
        .map((o) => ({ date: o.date, kind: o.kind, slots: o.kind === "available" ? normalizeSlots(Array.isArray(o.slots) ? o.slots : []) : [] }))
    : [];
  const until = r.vacation && typeof r.vacation.until === "string" && checkDateString(r.vacation.until) ? r.vacation.until : null;
  return {
    accepting: r.accepting !== false,
    vacation: { on: !!r.vacation?.on, until },
    timeZone: typeof r.timeZone === "string" && r.timeZone ? r.timeZone : fallbackTz,
    weekly,
    overrides,
  };
}

// ---------------------------------------------------------------- recipients for the simultaneous broadcast

export type Candidate = { id: string; name: string; approved: boolean; availability: Availability | null };
export type RecipientDecision = {
  eligible: Candidate[];
  skipped: Array<{ candidate: Candidate; why: string }>;
};

/**
 * Who a simultaneous backup request may go to. Two separate gates:
 * 1. authorization: the person must be an approved helper, and
 * 2. availability: their saved schedule and status must say they can be asked right now.
 * Everybody who passes both is asked at the same time. This never turns the broadcast into a queue.
 * People who have never set a schedule are skipped, not guessed at.
 */
export function chooseRecipients(cands: Candidate[], nowMs: number): RecipientDecision {
  const eligible: Candidate[] = [];
  const skipped: RecipientDecision["skipped"] = [];
  for (const c of cands) {
    if (!c.approved) {
      skipped.push({ candidate: c, why: "Not approved to collect" });
      continue;
    }
    const s = availabilityAt(c.availability, nowMs);
    if (s.available) eligible.push(c);
    else skipped.push({ candidate: c, why: REASON_LABEL[s.reason] });
  }
  return { eligible, skipped };
}

export function nobodyAvailableMessage(d: RecipientDecision, approvedCount: number): string {
  if (approvedCount === 0) return "Nobody is approved to collect yet. Add a helper to your Trusted Circle and approve them first.";
  if (d.eligible.length > 0) return "";
  return `${approvedCount} approved helper${approvedCount === 1 ? " is" : "s are"} not available right now, so SafeNest will not ask anyone. You will need to collect, or call a helper yourself.`;
}
