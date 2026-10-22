import { useState } from "react";
import { View } from "react-native";

import { Card } from "../shared/Card";
import { SectionHeading } from "../shared/SectionHeading";
import { Sheet } from "../shared/Sheet";
import { TimeWheelPicker } from "../shared/TimeWheel";
import { checkDateString, addSlot, deviceTimeZone, formatClock, formatSlot, parseClock, removeSlot, statusLine, WEEKDAYS, type Availability, type OneTimeOverride, type Slot, type WeekDay } from "../shared/availability";
import { parseDob } from "../shared/accountRules";
import { DateField, FormField, ToggleRow } from "../shared/forms";
import { useOwnAvailability } from "../shared/useAvailability";
import { Banner, Btn, Chip, Err, Press, Seg, T, useColors } from "../shared/ui";

type SlotTarget = { kind: "weekly"; day: WeekDay } | { kind: "override" } | null;

const isoToday = () => new Date().toISOString().slice(0, 10);
const emptyDate = { day: "", month: "", year: "" };
const dateLabel = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d} / ${m} / ${y}`;
};

/**
 * My Pickup Availability. This answers "may SafeNest ask me right now?". It does not make anyone an approved collector,
 * and it is not the same as being online. Saved with an explicit Save so a half-finished edit never changes who is asked.
 */
export function AvailabilityEditor() {
  const c = useColors();
  const av = useOwnAvailability();
  const [target, setTarget] = useState<SlotTarget>(null);
  const [which, setWhich] = useState<"start" | "end">("start");
  const [start, setStart] = useState("3:00 PM");
  const [end, setEnd] = useState("6:00 PM");
  const [slotError, setSlotError] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [ovDate, setOvDate] = useState(emptyDate);
  const [ovKind, setOvKind] = useState<"unavailable" | "available">("unavailable");
  const [ovError, setOvError] = useState("");
  // Hours picked for a one-time change; kept in state while its sheet closes to show the time wheel.
  const [ovSlot, setOvSlot] = useState<Slot | null>(null);
  const [vacDate, setVacDate] = useState(emptyDate);
  const [vacError, setVacError] = useState("");

  const a = av.draft;
  const now = statusLine(av.saved, Date.now());

  if (av.loading) return <T c="muted">Loading your availability...</T>;

  const openSlot = (t: SlotTarget) => {
    setTarget(t);
    setWhich("start");
    setStart("3:00 PM");
    setEnd("6:00 PM");
    setSlotError("");
  };

  const commitSlot = () => {
    const s = parseClock(start);
    const e = parseClock(end);
    if (s === null || e === null) return setSlotError("Pick a start and an end time.");
    const slot: Slot = { start: s, end: e };
    if (target?.kind === "weekly") {
      const day = target.day;
      const res = addSlot(a.weekly[day] ?? [], slot);
      if (res.error) return setSlotError(res.error);
      av.edit((cur) => ({ ...cur, weekly: { ...cur.weekly, [day]: res.slots } }));
      setTarget(null);
    } else if (target?.kind === "override") {
      setOvSlot(slot);
      setTarget(null);
      setOverrideOpen(true);
    }
  };

  const copyMonday = () =>
    av.edit((cur) => ({ ...cur, weekly: { ...cur.weekly, 2: [...cur.weekly[1]], 3: [...cur.weekly[1]], 4: [...cur.weekly[1]], 5: [...cur.weekly[1]] } }));

  const addOverride = () => {
    const p = parseDob(ovDate);
    if (!p || !checkDateString(p.iso)) return setOvError("Enter a real date, like 24 / 12 / 2026.");
    if (p.iso < isoToday()) return setOvError("Pick today or a later date.");
    if (ovKind === "available" && !ovSlot) return setOvError("Choose the hours you can help that day.");
    const o: OneTimeOverride = { date: p.iso, kind: ovKind, slots: ovKind === "available" && ovSlot ? [ovSlot] : [] };
    av.edit((cur) => ({ ...cur, overrides: [...cur.overrides.filter((x) => x.date !== o.date), o].sort((x, y) => (x.date < y.date ? -1 : 1)) }));
    setOvSlot(null);
    setOvDate(emptyDate);
    setOvError("");
    setOverrideOpen(false);
  };

  const setVacation = (on: boolean) => {
    setVacError("");
    av.edit((cur) => ({ ...cur, vacation: { on, until: on ? cur.vacation.until : null } }));
  };
  const setVacationUntil = () => {
    const p = parseDob(vacDate);
    if (!p) return setVacError("Enter a real date, like 05 / 01 / 2027.");
    if (p.iso < isoToday()) return setVacError("Pick today or a later date.");
    av.edit((cur) => ({ ...cur, vacation: { on: true, until: p.iso } }));
    setVacDate(emptyDate);
    setVacError("");
  };

  const zone = deviceTimeZone();
  const zoneDiffers = a.timeZone !== zone;

  return (
    <View style={{ gap: 16 }}>
      <Card>
        <View style={{ gap: 8 }}>
          <T s={0.78} w={700} ls={0.06} up c="muted">Right now</T>
          <Chip kind={now.tone === "ok" ? "ok" : now.tone === "warn" ? "gold" : "plain"} icon={now.tone === "ok" ? "check" : "clock"}>{now.text.replace("Has not set availability", "You have not set availability").replace("Outside their hours", "Outside your hours")}</Chip>
          <T s={0.86} c="muted" lh={1.45}>
            Availability only decides whether SafeNest may ask you. It does not make you an approved collector. A parent approves that separately, and the teacher still checks who arrives.
          </T>
        </View>
      </Card>

      {av.where === "device" || av.where === "none" ? (
        <Banner>
          {av.demo
            ? "Demo Mode: nothing here is saved."
            : "Saved on this phone only for now. Your family cannot see it and SafeNest cannot use it to choose who to ask until your team applies supabase/account_household.sql."}
        </Banner>
      ) : (
        <Banner kind="ok">Saved to your account. Parents in your family can see these hours.</Banner>
      )}

      <Card tight>
        <ToggleRow first title="Accepting pickup requests" sub={a.accepting ? "SafeNest may ask you during your hours." : "SafeNest will not ask you, whatever your hours say."} on={a.accepting} onChange={(v) => av.edit((cur) => ({ ...cur, accepting: v }))} />
        <ToggleRow title="Taking a break" sub={a.vacation.on ? (a.vacation.until ? `No requests until ${dateLabel(a.vacation.until)}.` : "No requests until you switch this off.") : "Pause requests while you are away."} on={a.vacation.on} onChange={setVacation} />
      </Card>
      {a.vacation.on ? (
        <Card>
          <DateField label="Back on" value={vacDate} onChange={setVacDate} error={vacError} hint="Leave empty to stay on a break until you switch it off." />
          <View style={{ height: 10 }} />
          <Btn kind="s" sm onPress={setVacationUntil} label="Set break end date">Set end date</Btn>
        </Card>
      ) : null}

      <SectionHeading title="Weekly hours" />
      <Card tight>
        {WEEKDAYS.map(({ day, long, short }, i) => {
          const slots = a.weekly[day] ?? [];
          return (
            <View key={day} style={{ paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <T w={700}>{long}</T>
                <Btn kind="s" sm onPress={() => openSlot({ kind: "weekly", day })} label={`Add a time slot on ${long}`}>Add time</Btn>
              </View>
              {slots.length === 0 ? (
                <T s={0.9} c="muted">Unavailable</T>
              ) : (
                slots.map((s, idx) => (
                  <View key={`${s.start}-${s.end}`} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <T s={0.95} w={600} tab>{formatSlot(s)}</T>
                    <Press onPress={() => av.edit((cur) => ({ ...cur, weekly: { ...cur.weekly, [day]: removeSlot(cur.weekly[day] ?? [], idx) } }))} label={`Remove ${formatSlot(s)} on ${short}`} hitSlop={8} style={{ minHeight: 44, minWidth: 64, alignItems: "center", justifyContent: "center" }}>
                      <T s={0.88} w={700} c={c.danger}>Remove</T>
                    </Press>
                  </View>
                ))
              )}
            </View>
          );
        })}
      </Card>
      <Btn kind="o" sm onPress={copyMonday} label="Copy Monday's hours to Tuesday through Friday">Copy Monday to Tue to Fri</Btn>

      <SectionHeading title="One-time changes" />
      <Card tight>
        {a.overrides.length === 0 ? (
          <View style={{ paddingVertical: 14 }}><T s={0.92} c="muted">No one-time changes. Add one for a day that differs from your usual hours.</T></View>
        ) : (
          a.overrides.map((o, i) => (
            <View key={o.date} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <T w={700}>{dateLabel(o.date)}</T>
                <T s={0.88} c="muted">{o.kind === "unavailable" ? "Unavailable all day" : o.slots.map(formatSlot).join(", ")}</T>
              </View>
              <Press onPress={() => av.edit((cur) => ({ ...cur, overrides: cur.overrides.filter((x) => x.date !== o.date) }))} label={`Remove the change on ${dateLabel(o.date)}`} hitSlop={8} style={{ minHeight: 44, minWidth: 64, alignItems: "center", justifyContent: "center" }}>
                <T s={0.88} w={700} c={c.danger}>Remove</T>
              </Press>
            </View>
          ))
        )}
      </Card>
      <Btn kind="o" sm icon="plus" onPress={() => { setOvSlot(null); setOvError(""); setOverrideOpen(true); }} label="Add a one-time change">Add one-time change</Btn>

      <SectionHeading title="Time zone" />
      <Card>
        <T w={700}>{a.timeZone}</T>
        <T s={0.86} c="muted" lh={1.4}>Your hours are read in this time zone, wherever you are.</T>
        {zoneDiffers ? (
          <View style={{ marginTop: 10 }}>
            <Btn kind="s" sm onPress={() => av.edit((cur) => ({ ...cur, timeZone: zone }))} label={`Use this phone's time zone, ${zone}`}>Use this phone's time zone ({zone})</Btn>
          </View>
        ) : null}
      </Card>

      <Err text={av.error} />
      {av.justSaved ? <Banner kind="ok">Saved.</Banner> : null}
      <Btn onPress={() => void av.save()} loading={av.saving} disabled={!av.dirty || av.demo} label="Save availability">{av.demo ? "Not saved in Demo Mode" : av.dirty ? "Save availability" : "Nothing to save"}</Btn>

      <Sheet
        visible={target !== null}
        onClose={() => setTarget(null)}
        title={target?.kind === "weekly" ? `Add time on ${WEEKDAYS.find((d) => d.day === target.day)?.long}` : "Choose hours"}
        closeLabel="Close time picker"
        footer={<View style={{ gap: 10 }}><Err text={slotError} /><Btn onPress={commitSlot} label="Add this time">Add this time</Btn></View>}
      >
        <Seg<"start" | "end"> cur={which} onPick={setWhich} opts={[{ value: "start", label: `From ${start}`, a11y: "Set start time" }, { value: "end", label: `To ${end}`, a11y: "Set end time" }]} />
        <TimeWheelPicker value={which === "start" ? start : end} onChange={which === "start" ? setStart : setEnd} />
        <T s={0.82} c="muted" align="center">{(() => { const s = parseClock(start); const e = parseClock(end); return s !== null && e !== null && s < e ? `${formatClock(s)} to ${formatClock(e)}` : "The end must be after the start."; })()}</T>
      </Sheet>

      <Sheet
        visible={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        title="One-time change"
        closeLabel="Close one-time change"
        footer={<View style={{ gap: 10 }}><Err text={ovError} /><Btn onPress={addOverride} label="Add change">Add change</Btn></View>}
      >
        <DateField label="Date" value={ovDate} onChange={setOvDate} />
        <FormField label="That day I am">
          <Seg<"unavailable" | "available"> cur={ovKind} onPick={(v) => { setOvKind(v); setOvError(""); }} opts={[{ value: "unavailable", label: "Unavailable", a11y: "Unavailable all day" }, { value: "available", label: "Available", a11y: "Available at set hours" }]} />
        </FormField>
        {ovKind === "available" ? (
          <View style={{ gap: 8 }}>
            <T s={0.9} c="muted">{ovSlot ? `Hours: ${formatSlot(ovSlot)}` : "No hours chosen yet."}</T>
            <Btn kind="s" sm onPress={() => { setOverrideOpen(false); openSlot({ kind: "override" }); }} label="Choose hours">{ovSlot ? "Change hours" : "Choose hours"}</Btn>
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

