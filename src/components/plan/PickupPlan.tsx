import { useLayoutEffect, useState } from "react";
import { View } from "react-native";

import { Icon } from "../navigation/Icon";
import { AppShell } from "../shared/AppShell";
import { useAppContext } from "../shared/AppContext";
import { Avatar } from "../shared/Avatar";
import { Card } from "../shared/Card";
import { PrimaryButton } from "../shared/PrimaryButton";
import { SecondaryButton } from "../shared/SecondaryButton";
import { SectionHeading } from "../shared/SectionHeading";
import { Disclosure } from "../shared/Disclosure";
import { Sheet } from "../shared/Sheet";
import { TimeWheelPicker } from "../shared/TimeWheel";
import { StatusPill } from "../shared/StatusPill";
import { mockData } from "../shared/mockData";
import { Banner, Btn, Dl, Lead, Press, Rise, Row, T, Tag } from "../shared/ui";
import type { BackupRequestState, VerificationState, Weekday } from "../shared/types";

const weekdays: { key: Weekday; label: string }[] = [
  { key: 1, label: "Monday" }, { key: 2, label: "Tuesday" }, { key: 3, label: "Wednesday" }, { key: 4, label: "Thursday" }, { key: 5, label: "Friday" },
];

const validTime = /^(?:1[0-2]|[1-9]):[0-5][0-9] (?:AM|PM)$/;

type VerificationRecord = { collectorId: string | null; state: VerificationState };

// Demo memory survives Plan remounts, but not app restarts. Collector changes
// away and back while Plan is unmounted cannot be detected here.
let savedVerification: VerificationRecord | null = null;

export function PickupPlan() {
  const {
    theme, trustedHelpers, temporaryDismissal, setTemporaryDismissal,
    backupRequest, requestBackupPickup, respondToBackupPickup, resetBackupRequest,
    weeklySchedule, updateWeekdayTime,
  } = useAppContext();
  const colors = theme.colors;
  const { child, school, pickupStatus, teacherPhotoVerification } = mockData;
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
  const availableHelpers = trustedHelpers.filter(
    (helper) => helper.state === "active"
  );
  const [draftHelperId, setDraftHelperId] = useState<string | null>(availableHelpers[0]?.id ?? null);
  const [notice, setNotice] = useState("");
  const backupState = backupRequest.state;
  const hasBackupRequest = backupState !== "idle";
  const isBackupResolved = backupState === "accepted" || backupState === "declined";
  const draftHelper = availableHelpers.find((helper) => helper.id === draftHelperId) ?? availableHelpers[0];
  // Existing requests always belong to the context helper, never the local draft.
  const selectedBackupHelperId = hasBackupRequest ? backupRequest.helperId : draftHelper?.id;
  const backupHelper = hasBackupRequest
    ? trustedHelpers.find((helper) => helper.id === backupRequest.helperId)
    : undefined;
  const requestHelper = hasBackupRequest
    ? availableHelpers.find((helper) => helper.id === backupRequest.helperId)
    : draftHelper;
  const scheduledCollector = [...mockData.familyMembers, ...trustedHelpers].find((person) => person.id === pickupStatus.collectorId);
  const collector = backupState === "accepted" ? backupHelper ?? scheduledCollector : scheduledCollector;
  const collectorId = collector?.id ?? null;
  const [verification, setVerification] = useState<VerificationRecord>(() =>
    savedVerification?.collectorId === collectorId
      ? savedVerification
      : { collectorId, state: "notStarted" },
  );
  // Never display the previous collector's decision, even before the reset commits.
  const verificationState = verification.collectorId === collectorId ? verification.state : "notStarted";

  useLayoutEffect(() => {
    if (savedVerification?.collectorId !== collectorId) {
      savedVerification = { collectorId, state: "notStarted" };
    }
    setVerification(savedVerification);
  }, [collectorId]);

  const setVerificationState = (state: VerificationState) => {
    // A missing collector cannot receive a teacher decision.
    if (collectorId === null) return;
    const next: VerificationRecord = { collectorId, state };
    savedVerification = next;
    setVerification(next);
  };

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

  const requestBackup = () => {
    if (!requestHelper) return;
    requestBackupPickup(requestHelper.id);
    setNotice(`Demo request sent to ${requestHelper.name}.`);
  };

  const selectBackupHelper = (helperId: string) => {
    if (isBackupResolved) return;
    setDraftHelperId(helperId);
    if (backupState === "requested") {
      const helper = availableHelpers.find((item) => item.id === helperId);
      requestBackupPickup(helperId);
      setNotice(helper ? `Demo request updated to ${helper.name}.` : "Demo backup request updated.");
    }
  };

  const respondToBackup = (accepted: boolean) => {
    respondToBackupPickup(accepted ? "accepted" : "declined");
    setNotice(accepted ? `${backupHelper?.name ?? "Helper"} accepted in this demo.` : `${backupHelper?.name ?? "Helper"} cannot help in this demo.`);
  };

  const prepareVerification = () => {
    setVerificationState("awaitingTeacher");
    setNotice("Demo pickup photo prepared for the teacher check.");
  };

  const weeklyMode = editingWeekday !== null;

  return (
    <AppShell title="Pickup Plan" badge="Plan" activeTab="plan">
      <Lead>School times, backup help and the teacher check for {child.name}.</Lead>
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

      <SectionHeading title="Backup collector" />
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T s={1.05} w={700}>{backupState === "idle" ? "Can't collect today?" : "Backup request"}</T>
            <T c="muted" lh={1.4}>{backupState === "idle" ? "Pick a helper and ask them." : backupState === "requested" ? "Waiting for the helper to answer." : backupState === "accepted" ? "The helper will collect." : "The helper cannot collect."}</T>
          </View>
          <Rise key={backupState} kind="swap">
            <StatusPill label={backupStateLabel(backupState)} tone={backupState === "accepted" ? "success" : backupState === "declined" ? "danger" : backupState === "requested" ? "warning" : "neutral"} />
          </Rise>
        </View>
        {availableHelpers.length === 0 && !hasBackupRequest ? (
          <View>
            <T w={700}>No approved helpers yet</T>
            <T c="muted" lh={1.4}>Invite and approve a helper in Circle first.</T>
          </View>
        ) : null}
        {availableHelpers.length > 0 ? (
          <View style={{ gap: 8 }}>
            {availableHelpers.map((helper) => {
              const picked = selectedBackupHelperId === helper.id;
              return (
                <Press
                  key={helper.id}
                  role="radio"
                  label={`${helper.name}, ${helper.role}`}
                  state={{ checked: picked, disabled: isBackupResolved }}
                  disabled={isBackupResolved}
                  onPress={() => selectBackupHelper(helper.id)}
                  style={{
                    minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5,
                    borderColor: picked ? colors.primary : colors.line, backgroundColor: picked ? colors.primarySoft : colors.background,
                    opacity: isBackupResolved && !picked ? 0.6 : 1,
                    transitionProperty: ["backgroundColor", "borderColor"], transitionDuration: 200,
                  } as object}
                >
                  <Avatar name={helper.name} size={36} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T s={0.95} w={700} c={picked ? colors.primaryInk : "ink"}>{helper.name}</T>
                    <T s={0.82} c="muted" lh={1.3}>{helper.role}</T>
                  </View>
                  {picked ? <Icon name="check" size={18} color={colors.primaryInk} stroke={2.6} /> : null}
                </Press>
              );
            })}
          </View>
        ) : null}
        {backupState === "idle" || backupState === "accepted" || backupState === "declined" ? (
          <PrimaryButton label={backupState === "idle" ? "Request backup pickup" : "Ask again"} disabled={!requestHelper} onPress={requestBackup} />
        ) : (
          <View style={{ gap: 8 }}>
            <T s={0.85} w={700} c="muted">Simulate the helper's answer:</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Btn kind="p" flex onPress={() => respondToBackup(true)}>Helper accepts</Btn>
              <Btn kind="o" flex color={colors.danger} onPress={() => respondToBackup(false)}>Helper declines</Btn>
            </View>
          </View>
        )}
        {backupState !== "idle" ? <SecondaryButton label="Clear request" onPress={resetBackupRequest} /> : null}
        <T s={0.8} lh={1.4} c="muted">Simulated. No one is contacted.</T>
      </Card>

      <SectionHeading title="Teacher check" />
      <Card style={{ gap: 12 }}>
        <View style={{ gap: 10 }}>
          <View>
            <T s={1.05} w={700}>{school.teacher} confirms the collector</T>
            <T c="muted" lh={1.4}>Before {child.name} leaves with {collector?.name ?? "the collector"}.</T>
          </View>
          <Rise key={verificationState} kind="swap">
            <StatusPill label={verificationLabel(verificationState)} tone={verificationState === "approved" ? "success" : verificationState === "rejected" ? "danger" : "info"} />
          </Rise>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 14, padding: 12, borderRadius: 18, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.line }}>
          <Avatar name={collector?.name ?? "Collector"} size={48} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T w={800}>{collector?.name ?? "Pickup collector"}</T>
            <T s={0.84} c="muted" lh={1.35}>{teacherPhotoVerification.photoDescription}</T>
          </View>
        </View>
        {verificationState === "notStarted" || verificationState === "rejected" ? (
          <PrimaryButton label="Prepare demo photo check" onPress={prepareVerification} />
        ) : verificationState === "awaitingTeacher" || verificationState === "photoPrepared" ? (
          <View style={{ gap: 8 }}>
            <T s={0.85} w={700} c="muted">Simulate the teacher's answer:</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              <Btn kind="p" flex onPress={() => { setVerificationState("approved"); setNotice("Teacher approval simulated. This is not an identity check."); }}>Simulate teacher OK</Btn>
              <Btn kind="o" flex color={colors.danger} onPress={() => { setVerificationState("rejected"); setNotice("Teacher rejection simulated. This is not an identity check."); }}>Simulate no</Btn>
            </View>
          </View>
        ) : (
          <SecondaryButton label="Reset demo verification" onPress={() => { setVerificationState("notStarted"); setNotice("Demo teacher check reset."); }} />
        )}
        <T s={0.8} lh={1.4} c="muted">Simulated. No photo is taken and no identity is verified.</T>
      </Card>

      <Disclosure title="Child and school details" sub={`${child.name}, ${child.age} · Class ${child.className}`}>
        <Row first style={{ paddingTop: 0, paddingBottom: 6 }}>
          <Avatar name={child.name} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T s={1.1} w={800}>{child.name}</T>
            <T s={0.84} c="muted" lh={1.35}>{child.age} years · Class {child.className}</T>
          </View>
        </Row>
        <Dl k="School" v={school.name} />
        <Dl k="Address" v={school.address} />
        <Dl k="Class teacher" v={school.teacher} />
      </Disclosure>

      <Disclosure title="How pickup works" sub="Four short steps">
        <View style={{ gap: 14 }}>
          <Step number="1" title="Check today's plan" detail={`${collector?.name ?? "The collector"} collects at ${dismissal}.`} />
          <Step number="2" title="Ask for backup if needed" detail="A trusted helper can be asked from here or from Today." />
          <Step number="3" title="Teacher checks" detail={`${school.teacher} confirms the collector before ${child.name} leaves.`} />
          <Step number="4" title="Child leaves" detail="After the teacher says OK. This is a demo." />
        </View>
      </Disclosure>

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

function backupStateLabel(state: BackupRequestState): string {
  if (state === "requested") return "Waiting";
  if (state === "accepted") return "Accepted";
  if (state === "declined") return "Declined";
  return "Not requested";
}

function verificationLabel(state: VerificationState): string {
  if (state === "approved") return "Teacher OK · Demo";
  if (state === "rejected") return "Teacher said no · Demo";
  if (state === "awaitingTeacher") return "Awaiting teacher · Demo";
  if (state === "photoPrepared") return "Photo prepared · Demo";
  return "Not started · Demo";
}

