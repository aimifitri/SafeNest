import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AppShell } from "../shared/AppShell";
import { useAppContext } from "../shared/AppContext";
import { Avatar } from "../shared/Avatar";
import { Card } from "../shared/Card";
import { PrimaryButton } from "../shared/PrimaryButton";
import { SecondaryButton } from "../shared/SecondaryButton";
import { SectionHeading } from "../shared/SectionHeading";
import { StatusPill } from "../shared/StatusPill";
import { mockData } from "../shared/mockData";
import type { BackupRequestState, VerificationState, Weekday } from "../shared/types";
import type { ThemeTokens } from "../shared/theme";

const weekdays: { key: Weekday; label: string }[] = [
  { key: 1, label: "Monday" }, { key: 2, label: "Tuesday" }, { key: 3, label: "Wednesday" }, { key: 4, label: "Thursday" }, { key: 5, label: "Friday" },
];

export function PickupPlan() {
  const { theme } = useAppContext();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { child, school, schedule, trustedHelpers, pickupStatus, teacherPhotoVerification } = mockData;
  const weekdayNumber = new Date().getDay();
  const today: Weekday = (weekdayNumber === 0 ? 1 : Math.min(weekdayNumber, 5)) as Weekday;
  const todayLabel = weekdays.find((day) => day.key === today)?.label ?? "Today";
  const originalDismissal = schedule.weekdayTimes[today];
  const [temporaryDismissal, setTemporaryDismissal] = useState<string | null>(null);
  const [dismissalDraft, setDismissalDraft] = useState("");
  const [backupState, setBackupState] = useState<BackupRequestState>(mockData.backupRequest.state);
  const [backupHelperId, setBackupHelperId] = useState<string | null>(null);
  const [verificationState, setVerificationState] = useState<VerificationState>(teacherPhotoVerification.state);
  const [notice, setNotice] = useState("");
  const dismissal = temporaryDismissal ?? originalDismissal;
  const collector = [...mockData.familyMembers, ...trustedHelpers].find((person) => person.id === pickupStatus.collectorId);
  const availableHelpers = trustedHelpers.filter((helper) => helper.state === "active");
  const backupHelper = availableHelpers.find((helper) => helper.id === backupHelperId);

  const saveDismissal = () => {
    const value = dismissalDraft.trim();
    if (!/^((0?[1-9])|(1[0-2])):[0-5][0-9]\s?(AM|PM)$/i.test(value)) {
      setNotice("Enter a time like 12:30 PM to save the demo change.");
      return;
    }
    setTemporaryDismissal(value.toUpperCase());
    setDismissalDraft("");
    setNotice(`Temporary dismissal set to ${value.toUpperCase()} for ${todayLabel}.`);
  };

  const resetDismissal = () => {
    setTemporaryDismissal(null);
    setDismissalDraft("");
    setNotice(`Restored the usual ${todayLabel} dismissal time.`);
  };

  const requestBackup = () => {
    const firstAvailable = availableHelpers[0];
    setBackupHelperId(firstAvailable?.id ?? null);
    setBackupState("requested");
    setNotice(firstAvailable ? `Demo request sent to ${firstAvailable.name}.` : "Demo backup request started.");
  };

  const respondToBackup = (accepted: boolean) => {
    setBackupState(accepted ? "accepted" : "declined");
    setNotice(accepted ? `${backupHelper?.name ?? "Helper"} accepted in this demo.` : `${backupHelper?.name ?? "Helper"} cannot help in this demo.`);
  };

  const prepareVerification = () => {
    setVerificationState("awaitingTeacher");
    setNotice("Demo pickup photo prepared for the teacher check.");
  };

  return (
    <AppShell title="Pickup Plan" badge="Plan" activeTab="plan">
      <Text style={styles.lead}>The school schedule and pickup steps for {child.name}.</Text>
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}

      <SectionHeading title="Child and school" />
      <Card style={styles.card}>
        <View style={styles.childHeader}>
          <Avatar name={child.name} size={52} />
          <View style={styles.grow}><Text style={styles.childName}>{child.name}</Text><Text style={styles.muted}>{child.age} years · Class {child.className}</Text></View>
        </View>
        <InfoRow label="School" value={school.name} />
        <InfoRow label="Address" value={school.address} />
        <InfoRow label="Class teacher" value={school.teacher} />
        <InfoRow label="School ends today" value={dismissal} last />
      </Card>

      <SectionHeading title="School ends each day" />
      <Card style={styles.scheduleCard}>
        {weekdays.map((day, index) => <View key={day.key}>
          {index > 0 ? <View style={styles.separator} /> : null}
          <View style={[styles.dayRow, day.key === today && styles.todayRow]}>
            <Text style={[styles.dayName, day.key === today && styles.todayText]}>{day.label}</Text>
            {day.key === today ? <Text style={styles.todayTag}>TODAY</Text> : null}
            <Text style={[styles.dayTime, day.key === today && styles.todayText]}>{day.key === today ? dismissal : schedule.weekdayTimes[day.key]}</Text>
          </View>
        </View>)}
      </Card>

      <Card style={styles.changeCard}>
        <View style={styles.changeHeader}><View style={styles.grow}><Text style={styles.cardTitle}>School ending at a different time?</Text><Text style={styles.muted}>Set a temporary one-day dismissal time for {todayLabel}.</Text></View><StatusPill label="One day" tone="info" /></View>
        {temporaryDismissal ? <View style={styles.overrideRow}><Text style={styles.overrideText}>{todayLabel}: {temporaryDismissal} (usual {originalDismissal})</Text><Pressable accessibilityRole="button" onPress={resetDismissal} style={styles.resetButton}><Text style={styles.resetText}>Reset</Text></Pressable></View> : <>
          <TextInput accessibilityLabel="Temporary school dismissal time" value={dismissalDraft} onChangeText={setDismissalDraft} placeholder="For example, 12:30 PM" placeholderTextColor={theme.colors.muted} keyboardType="numbers-and-punctuation" autoCapitalize="characters" style={styles.input} />
          <PrimaryButton label="Save today's time" onPress={saveDismissal} />
        </>}
        <Text style={styles.simulationNote}>Demo only · This change stays on this screen and resets when you leave.</Text>
      </Card>

      <SectionHeading title="Pickup backup" />
      <Card style={styles.card}>
        <View style={styles.rowTop}><View style={styles.grow}><Text style={styles.cardTitle}>Ask a trusted helper</Text><Text style={styles.muted}>A backup request is simulated locally.</Text></View><StatusPill label={backupStateLabel(backupState)} tone={backupState === "accepted" ? "success" : backupState === "declined" ? "danger" : backupState === "requested" ? "warning" : "neutral"} /></View>
        {backupState === "idle" ? <PrimaryButton label="Request backup pickup" onPress={requestBackup} /> : <>
          {backupHelper ? <View style={styles.helperRow}><Avatar name={backupHelper.name} size={42} /><View style={styles.grow}><Text style={styles.helperName}>{backupHelper.name}</Text><Text style={styles.muted}>{backupHelper.role} · {backupHelper.locationLabel ?? "Location not shared"}</Text></View></View> : null}
          {backupState === "requested" ? <View style={styles.responseActions}>
            <Pressable accessibilityRole="button" onPress={() => respondToBackup(true)} style={styles.acceptButton}><Text style={styles.acceptText}>Simulate accept</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => respondToBackup(false)} style={styles.declineButton}><Text style={styles.declineText}>Simulate decline</Text></Pressable>
          </View> : <SecondaryButton label="Start another demo request" onPress={requestBackup} />}
        </>}
        <Text style={styles.simulationNote}>No family member is contacted by these demo controls.</Text>
      </Card>

      <SectionHeading title="School pickup verification" />
      <Card style={styles.card}>
        <View style={styles.rowTop}><View style={styles.grow}><Text style={styles.cardTitle}>Teacher photo check</Text><Text style={styles.muted}>{school.teacher} confirms the collector before {child.name} leaves.</Text></View><StatusPill label={verificationLabel(verificationState)} tone={verificationState === "approved" ? "success" : verificationState === "rejected" ? "danger" : "info"} /></View>
        <View style={styles.verificationBox}>
          <Avatar name={collector?.name ?? "Collector"} size={44} />
          <View style={styles.grow}><Text style={styles.helperName}>{collector?.name ?? "Pickup collector"}</Text><Text style={styles.muted}>{teacherPhotoVerification.photoDescription}</Text></View>
        </View>
        {verificationState === "notStarted" || verificationState === "rejected" ? <PrimaryButton label="Prepare demo photo check" onPress={prepareVerification} /> : verificationState === "awaitingTeacher" || verificationState === "photoPrepared" ? <View style={styles.responseActions}>
          <Pressable accessibilityRole="button" onPress={() => { setVerificationState("approved"); setNotice("Teacher approval simulated. This is not an identity check."); }} style={styles.acceptButton}><Text style={styles.acceptText}>Simulate teacher OK</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setVerificationState("rejected"); setNotice("Teacher rejection simulated. This is not an identity check."); }} style={styles.declineButton}><Text style={styles.declineText}>Simulate no</Text></Pressable>
        </View> : <SecondaryButton label="Reset demo verification" onPress={() => { setVerificationState("notStarted"); setNotice("Demo teacher check reset."); }} />}
        <Text style={styles.simulationNote}>Simulation only · No photo is captured or sent, and no identity is verified.</Text>
      </Card>

      <SectionHeading title="How it works" />
      <Card style={styles.stepsCard}>
        <Step number="1" title="We watch the pickup plan" detail={`The collector is ${collector?.name ?? "not set"}; school ends at ${dismissal}.`} />
        <Step number="2" title="Ask for backup if needed" detail="If the collector cannot make it, a trusted helper can be asked." />
        <Step number="3" title="Teacher checks the collector" detail={`${school.teacher} can confirm the pickup person before ${child.name} leaves.`} />
        <Step number="4" title="Child leaves after confirmation" detail="The teacher confirmation shown here is a local demo simulation." last />
      </Card>
    </AppShell>
  );

  function InfoRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
    return <View style={[styles.infoRow, last && styles.infoRowLast]}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
  }

  function Step({ number, title, detail, last = false }: { number: string; title: string; detail: string; last?: boolean }) {
    return <View style={styles.stepRow}>
      <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{number}</Text></View>
      <View style={[styles.stepCopy, !last && styles.stepBorder]}><Text style={styles.stepTitle}>{title}</Text><Text style={styles.muted}>{detail}</Text></View>
    </View>;
  }
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

const makeStyles = (theme: ThemeTokens) => StyleSheet.create({
  lead: { color: theme.colors.muted, fontSize: theme.type.body * theme.textScale, lineHeight: 21 * theme.textScale, marginTop: theme.spacing.sm, marginBottom: theme.spacing.md },
  notice: { color: theme.colors.primaryInk, backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.control, padding: theme.spacing.sm, fontSize: theme.type.small * theme.textScale, lineHeight: 17 * theme.textScale, fontWeight: "700", marginBottom: theme.spacing.sm },
  card: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.md, gap: theme.spacing.sm },
  childHeader: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, marginBottom: theme.spacing.xs },
  grow: { flex: 1, minWidth: 0 }, childName: { color: theme.colors.ink, fontSize: 19 * theme.textScale, fontWeight: "800" },
  muted: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale, lineHeight: 17 * theme.textScale, marginTop: 3 },
  infoRow: { borderTopWidth: 1, borderTopColor: theme.colors.line, paddingVertical: theme.spacing.sm, gap: 4 }, infoRowLast: { paddingBottom: 0 },
  infoLabel: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale }, infoValue: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "700" },
  scheduleCard: { paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs, marginTop: theme.spacing.sm, marginBottom: theme.spacing.md },
  dayRow: { minHeight: 51, flexDirection: "row", alignItems: "center", gap: theme.spacing.xs }, todayRow: { backgroundColor: theme.colors.primarySoft, marginHorizontal: -theme.spacing.sm, paddingHorizontal: theme.spacing.sm, borderRadius: 12 },
  dayName: { flex: 1, color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "600" }, todayText: { color: theme.colors.primaryInk, fontWeight: "800" },
  todayTag: { color: theme.colors.primaryInk, fontSize: 8 * theme.textScale, letterSpacing: 0.4, fontWeight: "900" }, dayTime: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "700" },
  separator: { height: 1, backgroundColor: theme.colors.line },
  changeCard: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.md, gap: theme.spacing.sm }, changeHeader: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.xs },
  cardTitle: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "800" },
  input: { minHeight: 50, borderWidth: 1, borderColor: theme.colors.line, borderRadius: theme.radius.control, paddingHorizontal: theme.spacing.md, color: theme.colors.ink, backgroundColor: theme.colors.background, fontSize: theme.type.body * theme.textScale },
  simulationNote: { color: theme.colors.muted, fontSize: 10 * theme.textScale, lineHeight: 15 * theme.textScale, textAlign: "center" },
  overrideRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.control, padding: theme.spacing.sm },
  overrideText: { flex: 1, color: theme.colors.primaryInk, fontSize: theme.type.small * theme.textScale, fontWeight: "700" },
  resetButton: { minHeight: 40, paddingHorizontal: theme.spacing.md, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.card, borderRadius: 12 },
  resetText: { color: theme.colors.primaryInk, fontSize: theme.type.small * theme.textScale, fontWeight: "800" },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: theme.spacing.sm },
  helperRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, borderTopWidth: 1, borderTopColor: theme.colors.line, paddingTop: theme.spacing.sm },
  helperName: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "800" },
  responseActions: { flexDirection: "row", gap: theme.spacing.sm },
  acceptButton: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: theme.radius.control, backgroundColor: theme.colors.primary },
  acceptText: { color: theme.colors.onPrimary, fontSize: theme.type.small * theme.textScale, fontWeight: "800", textAlign: "center" },
  declineButton: { minHeight: 48, minWidth: 100, paddingHorizontal: theme.spacing.sm, alignItems: "center", justifyContent: "center", borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.card },
  declineText: { color: theme.colors.danger, fontSize: theme.type.small * theme.textScale, fontWeight: "800", textAlign: "center" },
  verificationBox: { flexDirection: "row", alignItems: "center", gap: theme.spacing.sm, backgroundColor: theme.colors.background, borderRadius: theme.radius.control, borderWidth: 1, borderColor: theme.colors.line, padding: theme.spacing.sm },
  stepsCard: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.lg, paddingBottom: theme.spacing.xs },
  stepRow: { flexDirection: "row", gap: theme.spacing.sm }, stepNumber: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.primarySoft },
  stepNumberText: { color: theme.colors.primaryInk, fontSize: theme.type.small * theme.textScale, fontWeight: "800" },
  stepCopy: { flex: 1, paddingBottom: theme.spacing.md, marginBottom: theme.spacing.md }, stepBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.line },
  stepTitle: { color: theme.colors.ink, fontSize: theme.type.body * theme.textScale, fontWeight: "800" },
});
