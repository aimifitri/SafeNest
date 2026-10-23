import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { ChildSelector } from "./ChildSelector";
import { Icon } from "../navigation/Icon";
import { AppShell } from "../shared/AppShell";
import { useAppContext } from "../shared/AppContext";
import { Avatar } from "../shared/Avatar";
import { Card } from "../shared/Card";
import { SectionHeading } from "../shared/SectionHeading";
import { Disclosure } from "../shared/Disclosure";
import { Sheet } from "../shared/Sheet";
import { TimeWheelPicker } from "../shared/TimeWheel";
import { StatusPill } from "../shared/StatusPill";
import { clock } from "../shared/circleEngine";
import { sim } from "../shared/demoSim";
import { useAuth } from "../shared/AuthContext";
import { EmptyState } from "../shared/forms";
import { useSetupActions } from "../onboarding/SetupChecklist";
import { useChildSchool } from "../shared/HouseholdContext";
import { Banner, Btn, Dl, Err, Lead, Press, Rise, Row, Switch, T, Tag } from "../shared/ui";
import { CircleRows } from "../today/CircleRows";
import { usePickupFlow } from "../today/usePickupFlow";
import type { Weekday } from "../shared/types";

const weekdays: { key: Weekday; label: string }[] = [
  { key: 1, label: "Monday" }, { key: 2, label: "Tuesday" }, { key: 3, label: "Wednesday" }, { key: 4, label: "Thursday" }, { key: 5, label: "Friday" },
];

// Plan is for planning: school times, today's change and the planned arrangement. The live pickup (who answered, the
// collector's journey, the photo for the teacher, cancel and reset) lives on Today and shares the same state. The panels
// below were moved out of Plan's visible interface on purpose. Their state, handlers and APIs are unchanged: set this
// to true to bring them back.
const SHOW_ACTIVE_PICKUP_PANELS = false;

const validTime = /^(?:1[0-2]|[1-9]):[0-5][0-9] (?:AM|PM)$/;

export function PickupPlan() {
  const { household } = useChildSchool();
  return <PickupPlanForChild key={household.pickupScope} />;
}
function PickupPlanForChild() {
  const { theme, temporaryDismissal, setTemporaryDismissal, weeklySchedule, updateWeekdayTime } = useAppContext();
  // One shared answer for Today and Plan: who is collecting and who was asked.
  const pf = usePickupFlow();
  const colors = theme.colors;
  const { child, school, hasChild, household } = useChildSchool();
  const { profile } = useAuth();
  const goSetup = useSetupActions();
  const weekdayNumber = new Date().getDay();
  const today: Weekday = (weekdayNumber === 0 ? 1 : Math.min(weekdayNumber, 5)) as Weekday;
  const todayLabel = weekdays.find((day) => day.key === today)?.label ?? "Today";
  const originalDismissal = weeklySchedule[today];
  const dismissalOverride = temporaryDismissal?.weekday === today ? temporaryDismissal.time : null;
  const dismissal = dismissalOverride ?? originalDismissal;
  const [isDismissalModalVisible, setIsDismissalModalVisible] = useState(false);
  const [selectedDismissal, setSelectedDismissal] = useState(dismissal);
  // The saved regular week lives in shared AppContext (weeklySchedule). Only the unsaved draft below is local.
  const [editingWeekday, setEditingWeekday] = useState<Weekday | null>(null);
  const [draftWeeklyTime, setDraftWeeklyTime] = useState("");
  const editingDayLabel = weekdays.find((day) => day.key === editingWeekday)?.label;
  const pickerTime = editingWeekday !== null ? draftWeeklyTime : selectedDismissal;
  const [notice, setNotice] = useState("");
  const [optInSheet, setOptInSheet] = useState(false);
  const flow = pf.flow;
  const collector = pf.collector;
  const esc = pf.escalation;
  const deadlineLabel = clock(pf.dismissMin - esc.minutesBefore);
  const askedNames = pf.people.filter((p) => p.approved && p.id !== pf.viewerId).map((p) => p.name);
  const flowIsActive = ["asking", "nobody", "helper_assigned", "travelling", "at_school", "collected"].includes(flow.phase);
  const canAsk = flow.phase !== "helper_assigned" && flow.phase !== "asking" && flow.phase !== "travelling" && flow.phase !== "at_school" && flow.phase !== "collected";

  const openDismissalSelector = () => {
    setSelectedDismissal(dismissal);
    setIsDismissalModalVisible(true);
  };

  const openWeeklyEditor = (weekday: Weekday) => {
    setDraftWeeklyTime(weeklySchedule[weekday]);
    setEditingWeekday(weekday);
  };

  const closeTimeSelector = () => {
    setIsDismissalModalVisible(false);
    setEditingWeekday(null);
  };

  const saveWeeklyPreview = () => {
    if (editingWeekday === null || !validTime.test(draftWeeklyTime)) return;
    updateWeekdayTime(child.id, editingWeekday, draftWeeklyTime);
    const keepsOverride = editingWeekday === today && dismissalOverride;
    setNotice(`Regular ${editingDayLabel} time saved: ${draftWeeklyTime}.${keepsOverride ? ` Today still uses ${dismissalOverride}.` : ""}`);
    setEditingWeekday(null);
  };

  const saveDismissal = () => {
    if (!validTime.test(selectedDismissal)) return;
    setTemporaryDismissal({ weekday: today, time: selectedDismissal });
    setIsDismissalModalVisible(false);
    setNotice(`Today's time changed to ${selectedDismissal}. Only today is affected.`);
  };

  const resetDismissal = () => {
    setTemporaryDismissal(null);
    setNotice(`Today is back to the regular time, ${originalDismissal}.`);
  };

  const askCircle = async () => {
    if (pf.busy) return;
    const ok = await pf.run(flow.phase === "nobody" ? "ask_again" : "find_backup");
    if (ok) setNotice(pf.simActive ? "Demo request started. Nobody was contacted." : "Request sent to your family and Trusted Circle.");
  };

  const cancelRound = async () => {
    const ok = await pf.run("cancel_round");
    if (ok) setNotice("Requests cancelled.");
  };

  const saveAutomatic = async (next: { enabled?: boolean; minutesBefore?: number }) => {
    const merged = { ...esc, ...next };
    if (pf.simActive) {
      sim.setEscalation(merged, pf.env);
      setNotice(merged.enabled ? `Automatic backup on. SafeNest asks at ${clock(pf.dismissMin - merged.minutesBefore)} (demo).` : "Automatic backup off.");
      return;
    }
    const ok = await pf.escalationSettings.saveSettings(merged);
    if (ok) setNotice(merged.enabled ? "Automatic backup is on." : "Automatic backup is off.");
  };

  const weeklyMode = editingWeekday !== null;

  // A real account with no child yet has no schedule to show. Demo Mode keeps its sample plan.
  if (!hasChild && !household.demo) {
    const helper = profile?.accountType === "helper";
    return (
      <AppShell title="Pickup Plan" badge="Plan" activeTab="plan">
        <Lead>School times and pickup arrangements for each child.</Lead>
        <ChildSelector />
        {!household.ready ? (
          <T c="muted">Loading...</T>
        ) : helper ? (
          <EmptyState icon="plan" title="No pickup plan to show" body="The pickup plan belongs to the parent. When you are asked to collect a child, the details show on Today.">
            <Btn onPress={() => goSetup("availability")} label="Set my availability">Set my availability</Btn>
          </EmptyState>
        ) : (
          <EmptyState icon="plan" title="No pickup plan yet" body="Add your child and their school first. Then you can set the usual finish time for each weekday here.">
            <Btn onPress={() => goSetup("child")} icon="plus" label="Add your first child">Add your first child</Btn>
          </EmptyState>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell title="Pickup Plan" badge="Plan" activeTab="plan">
      <Lead>School times, today's change and who collects for {child.name}.</Lead>
      <ChildSelector />
      {notice ? <Banner key={notice} kind="ok">{notice}</Banner> : null}

      <SectionHeading title="Today" />
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
            <Icon name="clock" size={22} color={colors.primaryInk} stroke={2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T s={0.85} c="muted">{todayLabel}: school ends</T>
            <Rise key={dismissal} kind="swap"><T s={1.6} w={800} ls={-0.02} tab lh={1.2}>{dismissal}</T></Rise>
          </View>
        </View>
        {dismissalOverride ? (
          <View style={{ backgroundColor: colors.warning, borderRadius: 14, padding: 12 }}>
            <T s={0.9} w={700} c={colors.warningInk} lh={1.35}>Changed for today only. Regular time is {originalDismissal}.</T>
          </View>
        ) : null}
        <Btn kind="p" icon="clock" onPress={openDismissalSelector} label={`Change today's time, currently ${dismissal}`}>Change today's time</Btn>
        {dismissalOverride ? <Btn kind="o" onPress={resetDismissal} label="Reset to regular time">Reset to {originalDismissal}</Btn> : null}
        <T s={0.82} lh={1.4} c="muted">Only affects today. Other days keep their regular time.</T>
      </Card>

      <SectionHeading title="Regular school times" />
      <Card tight>
        {weekdays.map((day, index) => {
          const now = day.key === today;
          return (
            <View
              key={day.key}
              style={{
                flexDirection: "row", alignItems: "center", gap: 8, minHeight: 56, paddingLeft: 16, paddingRight: 4,
                marginHorizontal: -16, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.line,
                backgroundColor: now ? colors.primarySoft : "transparent",
              }}
            >
              <View style={{ flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6 }}>
                <T s={0.98} w={now ? 800 : 600} c={now ? colors.primaryInk : "muted"}>{day.label}</T>
                {now ? <TodayTag /> : null}
              </View>
              <T s={0.98} w={800} c={now ? colors.primaryInk : "ink"} tab>{weeklySchedule[day.key]}</T>
              <Press
                onPress={() => openWeeklyEditor(day.key)}
                label={`Edit ${day.label} regular dismissal time`}
                style={{ minHeight: 44, minWidth: 52, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 }}
              >
                <T s={0.88} w={800} c={colors.primaryInk}>Edit</T>
              </Press>
            </View>
          );
        })}
      </Card>
      <T s={0.82} lh={1.4} c="muted" style={{ marginTop: -6 }}>Edit changes this day every week.</T>

      <SectionHeading title="Today's arrangement" />
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar name={collector.name} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T s={0.82} c="muted">Collector</T>
            <T s={1.05} w={800} lh={1.25}>{arrangementTitle(flow.phase, collector.name, child.name)}</T>
          </View>
        </View>
        <T c="muted" lh={1.4}>{arrangementDetail(flow.phase, collector.name, child.name, pf.dismissal, askedNames.length)}</T>
        {flowIsActive ? (
          <Link href="/" asChild>
            <Press label="See the live pickup on Today" role="link" style={{ minHeight: 44, justifyContent: "center" }}>
              <T w={700} c={colors.primaryInk} style={{ textDecorationLine: "underline" }}>See the live pickup on Today</T>
            </Press>
          </Link>
        ) : null}
        <T s={0.8} lh={1.4} c="muted">{pf.simActive ? "Simulated. " : ""}Requests, answers and the journey are shown on Today. Who can be asked is managed in Circle.</T>
      </Card>

      {SHOW_ACTIVE_PICKUP_PANELS ? (
        <>
      <SectionHeading title="Backup help" />
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T s={1.05} w={700}>{flow.phase === "helper_assigned" ? `${collector.name} is collecting` : flow.phase === "asking" ? "Asking your circle" : flow.phase === "nobody" ? "Nobody available" : "Can't collect today?"}</T>
            <T c="muted" lh={1.4}>
              {flow.recipients.length > 0 || !canAsk
                ? flow.detail
                : "SafeNest asks your whole family and Trusted Circle at once. The first person to accept becomes the collector."}
            </T>
          </View>
          <Rise key={flow.phase} kind="swap">
            <StatusPill label={flow.status} tone={flow.tone} />
          </Rise>
        </View>
        {flow.recipients.length > 0 ? <CircleRows rows={flow.recipients} /> : null}
        {flow.recipients.length === 0 && canAsk ? (
          <Disclosure title="Who will be asked" sub={askedNames.length ? `${askedNames.length} people` : "Nobody yet"}>
            {askedNames.length > 0 ? (
              <View style={{ gap: 8 }}>
                {askedNames.map((name) => (
                  <View key={name} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Avatar name={name} size={32} />
                    <T w={600}>{name}</T>
                  </View>
                ))}
                <T s={0.82} c="muted" lh={1.4}>Approved family and Trusted Circle members who have joined SafeNest. Pending members and you are never asked.</T>
              </View>
            ) : (
              <T c="muted" lh={1.4}>Invite and approve people in Circle first.</T>
            )}
          </Disclosure>
        ) : null}
        {canAsk ? (
          <Btn kind="p" loading={pf.busy} disabled={pf.busy} onPress={() => void askCircle()}>{flow.phase === "nobody" ? "Ask everyone again" : "Ask my circle now"}</Btn>
        ) : null}
        {flow.phase === "asking" || flow.phase === "helper_assigned" ? (
          <Btn kind="o" disabled={pf.busy} onPress={() => void cancelRound()}>{flow.phase === "asking" ? "Cancel requests" : "Cancel and start over"}</Btn>
        ) : null}
        {pf.error ? <Err text={pf.error} /> : null}
        <T s={0.8} lh={1.4} c="muted">{pf.simActive ? "Simulated. Nobody is contacted. Use Demo controls on Today to answer for them." : pf.groupRequests === false ? "Your database can only ask one helper at a time. Group requests need the backend upgrade." : "Sent through SafeNest. Each person answers on their own phone."}</T>
      </Card>

        </>
      ) : null}

      <SectionHeading title="Automatic backup" />
      <Card style={{ gap: 12 }}>
        <Press
          role="switch"
          label="Automatic backup"
          state={{ checked: esc.enabled, disabled: !pf.simActive && pf.escalationSettings.settingsAvailable !== true }}
          disabled={!pf.simActive && pf.escalationSettings.settingsAvailable !== true}
          onPress={() => (esc.enabled ? void saveAutomatic({ enabled: false }) : setOptInSheet(true))}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <T s={1.05} w={700}>Ask for me if I do not answer</T>
            <T s={0.9} c="muted" lh={1.4}>{esc.enabled ? `On. If you may be late and have not answered by ${deadlineLabel}, SafeNest asks everyone together.` : `Off. SafeNest alerts you at ${deadlineLabel} but asks nobody unless you tap.`}</T>
          </View>
          <Switch on={esc.enabled} />
        </Press>
        {!pf.simActive && pf.escalationSettings.settingsAvailable !== true ? (
          <T s={0.85} c="muted" lh={1.4}>Not available yet. It needs the backend upgrade (pickup_broadcast.sql) to be approved and applied first.</T>
        ) : null}
        {esc.enabled ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T s={0.82} c="muted">Ask this long before school ends</T>
              <T w={800} tab>{esc.minutesBefore} min (at {deadlineLabel})</T>
            </View>
            <Btn kind="o" sm label="Ask later" onPress={() => void saveAutomatic({ minutesBefore: Math.max(0, esc.minutesBefore - 1) })}>-1</Btn>
            <Btn kind="o" sm label="Ask earlier" onPress={() => void saveAutomatic({ minutesBefore: Math.min(60, esc.minutesBefore + 1) })}>+1</Btn>
          </View>
        ) : null}
        <T s={0.8} lh={1.4} c="muted">Only starts when SafeNest predicts you will be late and you have not answered. You can turn it off any time.</T>
      </Card>

      <Disclosure title="Child and school details" sub={[child.name, child.age !== null ? String(child.age) : "", child.className ? `Class ${child.className}` : ""].filter(Boolean).join(" · ")}>
        <Row first style={{ paddingTop: 0, paddingBottom: 6 }}>
          <Avatar name={child.name} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T s={1.1} w={800}>{child.name}</T>
            <T s={0.84} c="muted" lh={1.35}>{[child.age !== null ? `${child.age} years` : "", child.className ? `Class ${child.className}` : ""].filter(Boolean).join(" · ") || "Add details in Settings"}</T>
          </View>
        </Row>
        <Dl k="School" v={school.name} />
        <Dl k="Address" v={school.address || "Not added"} />
        <Dl k="Class teacher" v={school.teacher} />
      </Disclosure>

      <Disclosure title="How pickup works" sub="Four short steps">
        <View style={{ gap: 14 }}>
          <Step number="1" title="Check today's plan" detail={`${collector?.name ?? "The collector"} collects at ${dismissal}.`} />
          <Step number="2" title="Backup if you cannot make it" detail={`Say so, or SafeNest asks your family and Trusted Circle together at ${deadlineLabel} if you are late and have not answered.`} />
          <Step number="3" title="Photo shown at school" detail={`${school.teacher} compares the photo with the person at the gate. If it does not match, ${child.name} stays and the teacher messages you directly.`} />
          <Step number="4" title="Collector confirms" detail={`The collector taps that ${child.name} is picked up. This is a demo.`} />
        </View>
      </Disclosure>

      <Sheet
        visible={optInSheet}
        onClose={() => setOptInSheet(false)}
        title="Turn on automatic backup?"
        closeLabel="Close automatic backup"
        footer={
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <Btn kind="o" style={{ flexGrow: 1, flexBasis: 120 }} onPress={() => setOptInSheet(false)}>Not now</Btn>
            <Btn kind="p" style={{ flexGrow: 1, flexBasis: 160 }} icon="check" onPress={() => { setOptInSheet(false); void saveAutomatic({ enabled: true }); }}>Turn on</Btn>
          </View>
        }
      >
        <T lh={1.45}>If SafeNest predicts you will arrive after school ends and you have not answered by {deadlineLabel} ({esc.minutesBefore} minutes before), it will send a request to collect {child.name} to:</T>
        <View style={{ gap: 8 }}>
          {askedNames.length > 0 ? askedNames.map((name) => (
            <View key={name} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Avatar name={name} size={32} />
              <T w={700}>{name}</T>
            </View>
          )) : <T c="muted">Nobody yet. Approve people in Circle first.</T>}
        </View>
        <T s={0.9} c="muted" lh={1.45}>They are asked together. The first to accept becomes the collector and the rest are told it is covered. They see {child.name}'s name and {school.name}. They do not see your location. You can turn this off or change the time here at any time.</T>
        {!pf.simActive ? <T s={0.9} c="muted" lh={1.45}>If you close the app, a scheduled check on the server can still ask them, but only once your backend team has set that up.</T> : null}
      </Sheet>
      <Sheet
        visible={isDismissalModalVisible || weeklyMode}
        onClose={closeTimeSelector}
        title={weeklyMode ? `Regular ${editingDayLabel} time` : "Change today's time"}
        closeLabel="Close time picker"
        footer={
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <Btn kind="o" style={{ flexGrow: 1, flexBasis: 120 }} onPress={closeTimeSelector}>Cancel</Btn>
          <Btn kind="p" style={{ flexGrow: 1, flexBasis: 160 }} icon="check" disabled={!validTime.test(pickerTime)} onPress={weeklyMode ? saveWeeklyPreview : saveDismissal}>Save new time</Btn>
        </View>
        }
      >
        <View style={{ backgroundColor: weeklyMode ? colors.primarySoft : colors.warning, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 }}>
          <T s={0.9} w={700} c={weeklyMode ? colors.primaryInk : colors.warningInk} lh={1.35}>
            {weeklyMode ? `Changes every ${editingDayLabel}.` : `Only affects today (${todayLabel}). Regular time stays ${originalDismissal}.`}
          </T>
        </View>
        <TimeWheelPicker value={pickerTime} onChange={weeklyMode ? setDraftWeeklyTime : setSelectedDismissal} />
        <View style={{ alignItems: "center" }}>
          <T s={0.85} c="muted">New time</T>
          <Rise key={pickerTime} kind="swap"><T s={1.6} w={800} ls={-0.02} tab c={colors.primaryInk}>{pickerTime}</T></Rise>
        </View>
      </Sheet>
    </AppShell>
  );
}

function TodayTag() {
  return <Tag>TODAY</Tag>;
}

function Step({ number, title, detail }: { number: string; title: string; detail: string }) {
  const { theme } = useAppContext();
  const c = theme.colors;
  return (
    <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" }}>
        <T s={0.85} w={800} c={c.primaryInk}>{number}</T>
      </View>
      <View style={{ flex: 1 }}>
        <T w={700}>{title}</T>
        <T s={0.9} c="muted" lh={1.4}>{detail}</T>
      </View>
    </View>
  );
}

function arrangementTitle(phase: string, collector: string, child: string): string {
  switch (phase) {
    case "asking": return "Asking your circle";
    case "nobody": return "Nobody available yet";
    case "helper_assigned": case "travelling": case "at_school": return `${collector} is collecting`;
    case "collected": return `${child} was collected by ${collector}`;
    default: return `${collector} collects`;
  }
}

function arrangementDetail(phase: string, collector: string, child: string, dismissal: string, asked: number): string {
  switch (phase) {
    case "asking": return `A backup request is open. The first person to accept collects ${child}.`;
    case "nobody": return `Nobody could collect ${child} yet. Open Today to decide what happens next.`;
    case "helper_assigned": return `${collector} accepted, so you do not need to collect ${child} today.`;
    case "travelling": case "at_school": return `${collector} is handling today's pickup. ${child} is not collected until ${collector} confirms the pickup.`;
    case "collected": return `Today's pickup is complete.`;
    default: return `You plan to collect ${child} when school ends at ${dismissal}. If you cannot, SafeNest can ask ${asked} ${asked === 1 ? "person" : "people"} together.`;
  }
}
