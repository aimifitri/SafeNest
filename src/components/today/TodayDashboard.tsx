import { Link, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, View } from "react-native";

import { Icon } from "../navigation/Icon";
import { useAppContext } from "../shared/AppContext";
import { AppShell } from "../shared/AppShell";
import { Card } from "../shared/Card";
import { clock } from "../shared/circleEngine";
import { sim } from "../shared/demoSim";
import { useAuth } from "../shared/AuthContext";
import { useChildSchool } from "../shared/HouseholdContext";
import { EmptyState } from "../shared/forms";
import { NextStepCard, SetupChecklist, useSetupActions } from "../onboarding/SetupChecklist";
import { Banner, Btn, Press, Rise, SIc, Switch, T, useColors } from "../shared/ui";
import { HelperAssignments } from "./HelperAssignments";
import { PickupBanner, usePickupBanner } from "./PickupBanner";
import { PickupStatusCard } from "./PickupStatusCard";
import { usePickupFlow } from "./usePickupFlow";
import { DemoSheet } from "./DemoControls";
import { DeviceLocationModal } from "./DeviceLocation";
import { usePhoneLocation } from "../shared/usePhoneLocation";
import { TodayGpsHeader } from "./TodayGpsHeader";
import { todayMapModel } from "./todayMapModel";
import { useSharedLocations } from "./useSharedLocations";
import { useFamilyAvailability } from "../shared/useAvailability";
import { statusLine } from "../shared/availability";
import { mockData } from "../shared/mockData";
import { createProceedPickup, schoolNavigationTarget } from "./proceedPickup";
import { PickupStatusModal } from "./PickupStatusModal";
import { usePickupEvents } from "./usePickupEvents";
import { demoEventScope, eventStoreKey } from "../shared/pickupEvents";
import { showInlinePickupStatus, demoPickupAlertKey, acknowledgePickupAlert, hasPickupAcknowledgement, pickupAlertKey, shouldShowPickupAlert } from "../shared/pickupStatus";

const EVENT_SETTLE_MS = 600;

export function TodayDashboard() {
  const { household } = useChildSchool();
  return <TodayDashboardForChild key={household.pickupScope} />;
}
function TodayDashboardForChild() {
  const { theme, selectedCaregiver, trustedHelpers, schoolLocation } = useAppContext();
  const [todayActive, setTodayActive] = useState(false);
  const pf = usePickupFlow(todayActive);
  const { flow, collector, dismissal } = pf;
  const { child, school, hasChild, household } = useChildSchool();
  const { profile, session } = useAuth();
  const goSetup = useSetupActions();
  const caregiver = selectedCaregiver?.name ?? "";
  const hour = pf.simActive ? Math.floor(pf.nowMin / 60) : new Date().getHours();
  const greeting = hour < 12 ? "Good morning," : hour < 17 ? "Good afternoon," : "Good evening,";
  const [demoOpen, setDemoOpen] = useState(false);
  // Includes the native sheet's closing animation/dismissal, not just its requested visibility.
  const [demoPresented, setDemoPresented] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [pickupPopupChildId, setPickupPopupChildId] = useState<string | null>(null);
  const [pickupPopupVisible, setPickupPopupVisible] = useState(false);
  const activeToday = useRef(false);
  const [proceedGate] = useState(createProceedPickup);
  const [proceedBusy, setProceedBusy] = useState(false);
  const [proceedError, setProceedError] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupBanner, setBackupBanner] = useState<{ message: string; empty: boolean } | null>(null);
  const [circleScrollRequest, setCircleScrollRequest] = useState(0);
  const circleCardRef = useRef<View>(null);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [automaticWarnings, setAutomaticWarnings] = useState(true);
  const [warningPreferenceReady, setWarningPreferenceReady] = useState(false);
  const backupActionLock = useRef(false);
  const previousJourney = useRef(false);
  const pendingGpsOpen = useRef(false);
  const pendingBackupRequest = useRef(false);
  const readyHelpers = trustedHelpers.filter((helper) => helper.state === "active").length;
  const phone = usePhoneLocation(household.pickupScope, todayActive && !pf.simActive && !locationOpen);
  const gpsTarget = schoolNavigationTarget(child, school, schoolLocation);
  // Real accounts: only live locations other people chose to share with this account. Demo Mode: fictional positions only.
  const sharedLocations = useSharedLocations(todayActive && !pf.simActive && !!session, session?.user.id ?? null);
  const sharerIds = useMemo(() => sharedLocations.items.flatMap((i) => (i.userId ? [i.userId] : [])), [sharedLocations.items]);
  const sharerAvailability = useFamilyAvailability(sharerIds);
  const availabilityById = useMemo(() => Object.fromEntries(Object.entries(sharerAvailability).map(([id, a]) => [id, statusLine(a, Date.now()).text])), [sharerAvailability]);
  const demoPlaceLabels = useMemo(() => pf.simActive
    ? Object.fromEntries([...mockData.familyMembers, ...mockData.trustedHelpers].flatMap((p) => ("locationLabel" in p && p.locationLabel ? [[p.id, String(p.locationLabel).replace(/\s*\(demo\)/i, "")]] : [])))
    : undefined, [pf.simActive]);
  useFocusEffect(useCallback(() => {
    activeToday.current = true; setTodayActive(true); setProceedBusy(false);
    return () => {
      activeToday.current = false; proceedGate.invalidate();
      // Leaving Today with the pop-up open counts as having seen it, so it does not come back by itself.
      if (popupShown.current) { popupShown.current = false; void acknowledgeEvents.current(); }
      pendingGpsOpen.current = false; pendingBackupRequest.current = false;
      setTodayActive(false); setDemoOpen(false); setLocationOpen(false); setPickupPopupVisible(false);
    };
  }, [proceedGate]));


  const day = new Date(pf.nowMs).toDateString();
  const baseAcknowledgement = pickupAlertKey(session?.user.id ?? "demo", household.familyId, child.id, pf.simActive, day, pf.dismissMin);
  const acknowledgement = pf.simActive ? demoPickupAlertKey(baseAcknowledgement, household.pickupScope, pf.demo.state.resetVersion) : baseAcknowledgement;
  // Automatic Pickup Status: every meaningful new pickup fact has a stable key; closing the pop-up acknowledges what it showed.
  const events = usePickupEvents({
    storeKey: pf.simActive ? demoEventScope(household.pickupScope, pf.demo.state.resetVersion) : eventStoreKey(session?.user.id ?? "none", household.familyId, child.id),
    persist: !pf.simActive && !!session, source: pf.eventSource, ready: pf.eventsReady,
  });
  const acknowledgeEvents = useRef(events.acknowledge);
  acknowledgeEvents.current = events.acknowledge;
  const popupShown = useRef(false);
  const previousReset = useRef(pf.demo.state.resetVersion);
  useEffect(() => {
    if (previousReset.current === pf.demo.state.resetVersion) return;
    previousReset.current = pf.demo.state.resetVersion;
    if (!pf.simActive) return;
    proceedGate.invalidate();
    pendingGpsOpen.current = false; pendingBackupRequest.current = false;
    setProceedBusy(false); setProceedError(null); setBackupBusy(false); setBackupBanner(null);
    setPickupPopupVisible(false); setPickupPopupChildId(null); setLocationOpen(false);
  }, [pf.simActive, pf.demo.state.resetVersion, proceedGate]);
  const canCheck = household.demo || profile?.accountType === "parent";
  const warningPreferenceKey = "pickup-in-app-warnings:" + JSON.stringify([session?.user.id ?? "demo", household.familyId, child.id]);
  useEffect(() => {
    let active = true;
    if (pf.simActive) { setAutomaticWarnings(true); setWarningPreferenceReady(true); return; }
    setWarningPreferenceReady(false);
    void AsyncStorage.getItem(warningPreferenceKey).then(saved => {
      if (active) { setAutomaticWarnings(saved !== "off"); setWarningPreferenceReady(true); }
    }).catch(() => { /* Automatic interruption stays disabled if preferences cannot be read. */ });
    return () => { active = false; };
  }, [warningPreferenceKey, pf.simActive]);
  const toggleWarnings = () => {
    const next = !automaticWarnings;
    setAutomaticWarnings(next);
    if (!pf.simActive) void AsyncStorage.setItem(warningPreferenceKey, next ? "on" : "off").catch(() => {
      setBackupBanner({ message: "The in-app warning preference changed for this session, but could not be saved.", empty: false });
    });
  };

  useEffect(() => {
    const sub = AppState.addEventListener("change", next => setForeground(next === "active"));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let active = true;
    const consider = async () => {
      const eligible = () => shouldShowPickupAlert(pf.status, {
        now: pf.nowMin, dismissal: pf.dismissMin, foreground, enabled: automaticWarnings && warningPreferenceReady,
        acknowledged: hasPickupAcknowledgement(acknowledgement), parentResponded: pf.parentResponded,
        blocked: !todayActive || !pf.statusReady || !hasChild || !canCheck || locationOpen || demoPresented || pickupPopupChildId !== null || pickupPopupVisible || pendingGpsOpen.current,
      });
      if (!eligible()) return;
      // Demo acknowledgements are memory-only. Real acknowledgements survive screen/app restarts.
      if (!pf.simActive) {
        try {
          if (await AsyncStorage.getItem(acknowledgement)) { acknowledgePickupAlert(acknowledgement); return; }
        } catch {
          // Refuse automatic interruption if the acknowledgement cannot be checked. Manual access still works.
          return;
        }
      }
      if (!active || !eligible()) return;
      setPickupPopupChildId(child.id);
      setPickupPopupVisible(true);
    };
    void consider();
    return () => { active = false; };
  }, [todayActive, automaticWarnings, warningPreferenceReady, acknowledgement, pf.status.kind, pf.statusReady, pf.nowMin, pf.dismissMin, pf.parentResponded, foreground, canCheck, hasChild, locationOpen, demoPresented, pickupPopupChildId, pickupPopupVisible, child.id, pf.simActive]);

  // Automatic pop-up for a new meaningful pickup event. One pop-up only: while it is open (or any other sheet is),
  // newer events simply update what it shows and are acknowledged when the user closes it.
  useEffect(() => {
    popupShown.current = pickupPopupVisible;
  }, [pickupPopupVisible]);
  const eventBlocked = !todayActive || !foreground || !hasChild || !canCheck || locationOpen || demoPresented || pickupPopupChildId !== null || pickupPopupVisible || pendingGpsOpen.current;
  const pendingEventKey = events.pending?.key ?? null;
  useEffect(() => {
    if (pendingEventKey === null || eventBlocked) return;
    // A short settle time folds a burst of updates (several replies at once) into one pop-up with the latest information.
    const timer = setTimeout(() => {
      setProceedError(null);
      setPickupPopupChildId(child.id);
      setPickupPopupVisible(true);
    }, EVENT_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [pendingEventKey, eventBlocked, child.id]);

  const closePickupPopup = useCallback(async () => {
    proceedGate.invalidate(); setProceedBusy(false);
    acknowledgePickupAlert(acknowledgement);
    setPickupPopupVisible(false);
    popupShown.current = false;
    const saved = await acknowledgeEvents.current();
    if (!saved) setBackupBanner({ message: "This update is dismissed for this session, but the acknowledgement could not be saved.", empty: false });
    if (!pf.simActive) {
      try { await AsyncStorage.setItem(acknowledgement, "acknowledged"); }
      catch { setBackupBanner({ message: "This warning is dismissed for this session, but the acknowledgement could not be saved.", empty: false }); }
    }
  }, [acknowledgement, pf.simActive, proceedGate]);

  const proceedWithPickup = async () => {
    if (pf.busy || backupBusy || proceedBusy) return;
    setProceedBusy(true); setProceedError(null);
    const demoVersion = pf.demo.state.resetVersion;
    const result = await proceedGate.run(() => pf.run("still_collect"), () => activeToday.current && AppState.currentState === "active" && (!pf.simActive || sim.get().resetVersion === demoVersion),
      () => { pendingGpsOpen.current = true; void closePickupPopup(); });
    if (activeToday.current) {
      setProceedBusy(false);
      if (result === "failed") setProceedError("Pickup commitment could not be confirmed. Try again; Phone GPS has not been opened.");
    }
  };
  const reviewPickup = () => { void closePickupPopup(); setCircleScrollRequest(value => value + 1); };
  useEffect(() => {
    if (flow.phase === "collected" || (previousJourney.current && !pf.journeyActive)) {
      setLocationOpen(false); // Normal visibility cleanup stops the local GPS watcher.
      // The Pickup Status pop-up stays: for a finished pickup it is the completion update, closed by the user.
      pendingGpsOpen.current = false;
    }
    previousJourney.current = pf.journeyActive;
  }, [flow.phase, pf.journeyActive]);

  const openGpsForPickup = useCallback(() => {
    pendingGpsOpen.current = true;
    void closePickupPopup();
  }, [closePickupPopup]);

  const activateCircleBackup = useCallback(async () => {
    if (backupActionLock.current) return;
    if (["helper_assigned", "travelling", "at_school", "collected"].includes(flow.phase)) {
      setCircleScrollRequest(value => value + 1); setBackupBusy(false); return;
    }
    const eligiblePeople = pf.people.filter((person) => person.approved && person.id !== pf.viewerId);
    if (flow.phase === "asking") {
      const count = flow.recipients.length;
      setBackupBanner({
        message: count > 0 ? `A backup request is already active for ${count} people` : "A backup request is already active",
        empty: false,
      });
      setCircleScrollRequest((request) => request + 1);
      setBackupBusy(false);
      return;
    }
    if (eligiblePeople.length === 0) {
      setBackupBanner({ message: "No one in your circle yet", empty: true });
      setBackupBusy(false);
      return;
    }

    const demoVersion = pf.demo.state.resetVersion;
    backupActionLock.current = true;
    setBackupBusy(true);
    try {
      const started = await pf.run(flow.phase === "nobody" ? "ask_again" : "find_backup");
      if (pf.simActive && sim.get().resetVersion !== demoVersion) return;
      if (!started) {
        setBackupBanner({
          message: pf.error ?? "Nobody could be asked. Check that your circle has approved members.",
          empty: false,
        });
        setBackupBusy(false);
        return;
      }
      const askedCount = pf.groupRequests === false
        ? Math.min(1, eligiblePeople.length)
        : eligiblePeople.length;
      setBackupBanner({
        message: pf.simActive
          ? `Demo request sent to ${askedCount} ${askedCount === 1 ? "person" : "people"}. Nobody was contacted.`
          : `Backup request sent to ${askedCount} ${askedCount === 1 ? "person" : "people"}.`,
        empty: false,
      });
      setCircleScrollRequest((request) => request + 1);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown backup request error.";
      setBackupBanner({ message: `Unable to start a backup request. ${reason}`, empty: false });
    } finally {
      backupActionLock.current = false;
      setBackupBusy(false);
    }
  }, [flow.phase, flow.recipients.length, pf]);

  const closePopupAndActivateBackup = useCallback(() => {
    if (backupBusy || !pf.simActive) return;
    pendingBackupRequest.current = true;
    setBackupBusy(true);
    void closePickupPopup();
  }, [backupBusy, closePickupPopup, pf.simActive]);

  const onPickupPopupExited = useCallback(() => {
    setPickupPopupChildId(null);
    if (pendingGpsOpen.current) {
      pendingGpsOpen.current = false;
      if (activeToday.current && flow.phase !== "collected") setLocationOpen(true);
      return;
    }
    if (pendingBackupRequest.current) {
      pendingBackupRequest.current = false;
      void activateCircleBackup();
    }
  }, [activateCircleBackup, flow.phase]);

  const banner = usePickupBanner({ phase: flow.phase, collector: collector.name, childName: child.name, simulated: pf.simActive, whenLabel: `Picked up at ${clock(pf.nowMin)}` });
  const mapModel = todayMapModel({ demo: pf.simActive, childId: child.id, schoolName: gpsTarget.name, school: gpsTarget.coordinate,
    snapshot: phone.snapshot, now: Date.now(), simulation: pf.demo.state, collector, phase: flow.phase,
    people: pf.people, viewerId: pf.viewerId, shared: pf.simActive ? [] : sharedLocations.items, availabilityById, demoPlaceLabels });
  const headerMap = <TodayGpsHeader key={`${household.pickupScope}:${pf.simActive ? "demo" : "real"}`}
    model={mapModel}
    snapshot={phone.snapshot} demo={pf.simActive} gpsOpen={locationOpen} clockLabel={pf.simActive ? clock(pf.nowMin) : null}
    onDemo={() => { if (!locationOpen && pickupPopupChildId === null && !demoPresented) { setDemoPresented(true); setDemoOpen(true); } }} onGps={() => { if (!demoPresented && pickupPopupChildId === null) setLocationOpen(true); }}
    onRefresh={() => { void phone.refresh().catch(() => {}); }} onAllow={() => { void phone.request().catch(() => {}); }}
    onSettings={() => { void Linking.openSettings(); }} />;
  const phoneGps = <DeviceLocationModal
        key={household.pickupScope}
        visible={locationOpen && todayActive}
        onClose={() => setLocationOpen(false)}
        schoolName={gpsTarget.name}
        schoolAddress={gpsTarget.address}
        schoolLocation={gpsTarget.coordinate}
        requireSavedSchoolLocation
        demoPreview={pf.simActive}
        allowSharing={!pf.simActive}
        initialCenter={pf.simActive ? null : mapModel.point}
        demoEtaMinutes={pf.simActive && pf.eta.kind === "ready" ? pf.eta.minutes : null}
        onLocationUpdate={update => {
          if (activeToday.current && !pf.simActive) phone.accept({ timestamp: update.timestamp, coords: { latitude: update.latitude, longitude: update.longitude, accuracy: update.accuracy } });
        }}
      />;

  // A real account with no child yet: no sample people. Say what is missing and offer the next step.
  if (!hasChild && !household.demo) {
    const helper = profile?.accountType === "helper";
    return (
      <AppShell title="SafeNest" badge="Today" activeTab="home" header={canCheck ? headerMap : undefined}>
        {phoneGps}
        <DemoSheet visible={demoOpen} onClose={() => setDemoOpen(false)} onExited={() => setDemoPresented(false)} pf={pf} />
        {!pf.simActive ? <HelperAssignments /> : null}
        {household.error ? <Banner>{household.error}</Banner> : null}
        {!household.ready ? (
          <T c="muted">Loading...</T>
        ) : helper ? (
          <>
            <EmptyState icon="today" title="Nothing to collect right now" body="When a parent asks you to collect their child, the request shows up here. Set when you are available so you are only asked at good times.">
              <Btn onPress={() => goSetup("availability")} label="Set my availability">Set my availability</Btn>
            </EmptyState>
            <SetupChecklist title="Your setup" />
          </>
        ) : (
          <>
            <EmptyState icon="school" title="Add your first child" body="SafeNest plans school pickups around your child's school and finish time. Nothing is shown until you add them.">
              <Btn onPress={() => goSetup("child")} icon="plus" label="Add your first child">Add your first child</Btn>
            </EmptyState>
            <SetupChecklist />
          </>
        )}
      </AppShell>
    );
  }

  return (
    <View style={{ flex: 1 }}>
    <AppShell
      title="SafeNest"
      badge="Today"
      activeTab="home"
      scrollTargetRef={circleCardRef}
      scrollRequest={circleScrollRequest}
      header={headerMap}
    >
      {!pf.simActive ? <HelperAssignments /> : null}

      <Rise i={0} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", rowGap: 8, columnGap: 12 }}>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 0 }}>
          <T s={0.85} c="muted">{greeting}</T>
          <T s={1.1} w={700} ls={-0.01}>{caregiver}</T>
        </View>
        <ChildChip name={child.name} dismissal={dismissal} />
      </Rise>

      {canCheck ? <Rise i={1}>
        <Press role="switch" label="In-app delay warnings" state={{ checked: automaticWarnings }} disabled={!warningPreferenceReady} onPress={toggleWarnings} style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <T s={0.84}>In-app delay warnings</T><Switch on={automaticWarnings} />
        </Press>
        <T s={0.8} c="muted">{pf.status.title} {pf.simActive ? "Demo estimate." : "This phone's driving estimate; no live traffic."}</T>
      </Rise> : null}

      {pf.simActive ? (
        <Rise i={1}>
          <View style={{ gap: 8, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.line, backgroundColor: theme.colors.primarySoft }}>
            <T s={0.9} w={700} c={theme.colors.primaryInk} lh={1.3}>Demo clock {clock(pf.nowMin)}. School ends {pf.dismissal}.</T>
            <T s={0.84} c={theme.colors.primaryInk} lh={1.4}>Simulated: time, location and answers. Nobody is contacted. Open Demo controls to move the clock.</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <Btn kind="o" sm onPress={() => setDemoOpen(true)}>Demo controls</Btn>
              {pf.realMode ? <Btn kind="o" sm onPress={() => sim.setForced(false)}>Back to real state</Btn> : null}
            </View>
          </View>
        </Rise>
      ) : null}

      {pf.notice ? (
        <Rise i={1} kind="swap">
          <Banner>{pf.notice}</Banner>
        </Rise>
      ) : null}

      {backupBanner ? (
        <Rise i={1} kind="swap">
          <View style={{ gap: 8 }}>
            <Banner>{backupBanner.message}</Banner>
            {backupBanner.empty ? (
              <Link href="/circle" asChild>
                <Press
                  label="Open the Circle tab"
                  role="link"
                  style={{ alignSelf: "flex-start", minHeight: 44, justifyContent: "center", paddingHorizontal: 14, borderWidth: 1.5, borderColor: theme.colors.line, borderRadius: 12 }}
                >
                  <T s={0.92} w={700} c={theme.colors.primaryInk}>Open Circle</T>
                </Press>
              </Link>
            ) : null}
          </View>
        </Rise>
      ) : null}

      <View ref={circleCardRef}>
        {/* Late-estimate decisions belong to the modal; retain request, commitment and journey cards. */}
        {showInlinePickupStatus(flow.phase, pf.status) ? <PickupStatusCard pf={pf} childName={child.name} /> : null}
      </View>

      <NextStepCard />

      <Rise i={2}>
        <Card tight>
          <NavRow first href="/plan" icon="plan" title="Pickup plan" sub={`${child.name} · ${school.name}`} />
          <NavRow href="/circle" icon="circle" title="Trusted circle" sub={`${readyHelpers} helper${readyHelpers === 1 ? "" : "s"} ready to collect`} />
        </Card>
      </Rise>
      <DemoSheet visible={demoOpen} onClose={() => setDemoOpen(false)} onExited={() => setDemoPresented(false)} pf={pf} />
      {phoneGps}

      {child && pickupPopupChildId === child.id ? (
        <PickupStatusModal
          visible={pickupPopupVisible}
          childName={child.name}
          schoolName={school.name}
          pf={pf}
          proceedBusy={proceedBusy}
          proceedError={proceedError}
          onClose={() => void closePickupPopup()}
          onGo={openGpsForPickup}
          onExited={onPickupPopupExited}
          onProceed={() => void proceedWithPickup()}
          onReview={reviewPickup}
          onActivateBackup={closePopupAndActivateBackup}
          backupBusy={backupBusy}
        />
      ) : null}
    </AppShell>
    <PickupBanner note={banner.note} onDismiss={banner.dismiss} />
    </View>
  );
}

function NavRow({ href, icon, title, sub, first }: { href: "/plan" | "/circle"; icon: string; title: string; sub: string; first?: boolean }) {
  const c = useColors();
  return (
    <Link href={href} asChild>
      <Press label={`${title}. ${sub}`} scaleTo={0.985} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingVertical: 10, borderTopWidth: first ? 0 : 1, borderTopColor: c.line }}>
        <SIc name={icon} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <T w={700}>{title}</T>
          <T s={0.84} c="muted" lh={1.35}>{sub}</T>
        </View>
        <Icon name="chev" size={18} color={c.muted} stroke={2} />
      </Press>
    </Link>
  );
}

function ChildChip({ name, dismissal }: { name: string; dismissal: string | null }) {
  const c = useColors();
  return (
    <View style={{ flexShrink: 1, maxWidth: "100%", flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, paddingLeft: 6, paddingRight: 12, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: 999 }}>
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.primarySoft, alignItems: "center", justifyContent: "center" }}>
        <T s={0.8} w={700} c={c.primaryInk}>{name[0]}</T>
      </View>
      <View style={{ flexShrink: 1 }}>
        <T s={0.88} w={600} lh={1.25}>{dismissal ? `${name} · ends ${dismissal}` : name}</T>
      </View>
    </View>
  );
}

/** Warm banner for a one-off dismissal change or a backup request update. */
