import { Link } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Animated, AppState, Image, Modal, Platform, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Icon } from "../navigation/Icon";
import { useAppContext } from "../shared/AppContext";
import { AppShell } from "../shared/AppShell";
import { Card } from "../shared/Card";
import { clock } from "../shared/circleEngine";
import { sim } from "../shared/demoSim";
import type { MapDot } from "../shared/MapView";
import { MapView } from "../shared/MapView";
import { mockData } from "../shared/mockData";
import { Banner, Btn, Glass, Press, Rise, SIc, T, useColors, useReduce } from "../shared/ui";
import { HelperAssignments } from "./HelperAssignments";
import { PickupBanner, usePickupBanner } from "./PickupBanner";
import { PickupStatusCard } from "./PickupStatusCard";
import { usePickupFlow } from "./usePickupFlow";
import { DemoSheet, FullMap } from "./DemoControls";
import { DeviceLocationModal } from "./DeviceLocation";

const LOGO = require("../../../assets/images/logo.png");
const PICKUP_WINDOW_BEFORE_MINUTES = 15;
const PICKUP_WINDOW_AFTER_MINUTES = 30;
const PICKUP_ESTIMATE_DISMISSED_KEY = "safenest:pickup-estimate:dismissed";

type PickupPrompt = {
  childId: string;
  childName: string;
  scheduledMinute: number;
  dateKey: string;
  storageKey: string;
};

type PickupEstimate =
  | { kind: "checking" }
  | { kind: "ready"; distanceMeters: number; durationSeconds: number }
  | { kind: "unavailable"; message: string };

function parseScheduledMinute(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\s*$/i.exec(value);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour %= 12;
    if (meridiem === "PM") hour += 12;
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180;
}

async function resolveSchoolCoordinate(
  saved: { latitude: number; longitude: number } | null,
  signal: AbortSignal,
): Promise<{ latitude: number; longitude: number }> {
  if (saved && isValidCoordinate(saved.latitude, saved.longitude)) return saved;

  const address = `${mockData.school.name}, ${mockData.school.address}`;
  let nativeGeocodeError: string | null = null;
  if (Platform.OS !== "web") {
    try {
      const results = await Location.geocodeAsync(address);
      const first = results[0];
      if (first && isValidCoordinate(first.latitude, first.longitude)) {
        return { latitude: first.latitude, longitude: first.longitude };
      }
      nativeGeocodeError = "The device geocoder returned no school coordinates.";
    } catch (cause) {
      nativeGeocodeError = cause instanceof Error ? cause.message : "The device geocoder failed.";
    }
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`,
      { signal, headers: { Accept: "application/json" } },
    );
    if (!response.ok) throw new Error(`Address lookup returned status ${response.status}.`);
    const payload: unknown = await response.json();
    if (!Array.isArray(payload) || !isRecord(payload[0])) {
      throw new Error("No coordinates were found for the school address.");
    }
    const latitude = Number(payload[0].lat);
    const longitude = Number(payload[0].lon);
    if (!isValidCoordinate(latitude, longitude)) {
      throw new Error("The school address returned invalid coordinates.");
    }
    return { latitude, longitude };
  } catch (cause) {
    if (signal.aborted) throw cause;
    const fallbackError = cause instanceof Error ? cause.message : "Address lookup failed.";
    throw new Error([nativeGeocodeError, fallbackError].filter(Boolean).join(" "));
  }
}

function formatPickupDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function formatPickupDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} hr ${minutes % 60} min` : `${minutes} min`;
}

function formatPickupEta(seconds: number): string {
  return new Date(Date.now() + seconds * 1000).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function PickupEstimateModal({
  visible,
  childName,
  estimate,
  backupMessage,
  backupBusy,
  storageError,
  onClose,
  onGo,
  onActivateBackup,
  onExited,
}: {
  visible: boolean;
  childName: string;
  estimate: PickupEstimate;
  backupMessage: string;
  backupBusy: boolean;
  storageError: string;
  onClose: () => void;
  onGo: () => void;
  onActivateBackup: () => void;
  onExited: () => void;
}) {
  const colors = useColors();
  const reduceMotion = useReduce();
  const insets = useSafeAreaInsets();
  const [rendered, setRendered] = useState(false);
  const renderedRef = useRef(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

  useEffect(() => {
    if (visible) {
      renderedRef.current = true;
      setRendered(true);
      opacity.setValue(0);
      translateY.setValue(reduceMotion ? 0 : 14);
      const frame = requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: reduceMotion ? 0 : 250, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: reduceMotion ? 0 : 250, useNativeDriver: true }),
        ]).start();
      });
      return () => cancelAnimationFrame(frame);
    }

    if (!renderedRef.current) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: reduceMotion ? 0 : 250, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: reduceMotion ? 0 : 14, duration: reduceMotion ? 0 : 250, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (!finished) return;
      renderedRef.current = false;
      setRendered(false);
      onExitedRef.current();
    });
  }, [visible, reduceMotion, opacity, translateY]);

  if (!rendered) return null;

  return (
    <Modal
      visible={rendered}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View style={{ flex: 1, justifyContent: "center", paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12, paddingHorizontal: 18, backgroundColor: colors.scrim, opacity }}>
        <Animated.View style={{
          width: "100%",
          maxWidth: 440,
          alignSelf: "center",
          padding: 20,
          borderRadius: 20,
          backgroundColor: colors.card,
          gap: 14,
          elevation: 12,
          transform: [{ translateY }],
        }}>
          <View style={{ alignItems: "flex-end", marginBottom: -10 }}>
            <Press onPress={onClose} label="Close pickup estimate" style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
              <Icon name="x" size={20} color={colors.ink} stroke={2} />
            </Press>
          </View>

          <View style={{ minHeight: 112, alignItems: "center", justifyContent: "center", padding: 16, gap: 6, borderRadius: 16, backgroundColor: colors.primarySoft }}>
            {estimate.kind === "checking" ? (
              <>
                <T s={0.98} w={700} c={colors.primaryInk} align="center">Calculating estimate...</T>
                <T s={0.82} c={colors.primaryInk} align="center">Distance and duration</T>
              </>
            ) : estimate.kind === "ready" ? (
              <>
                <T s={1.22} w={800} c={colors.primaryInk} align="center">
                  {formatPickupDistance(estimate.distanceMeters)} · {formatPickupDuration(estimate.durationSeconds)}
                </T>
                <T s={0.88} w={700} c={colors.primaryInk} align="center">ETA {formatPickupEta(estimate.durationSeconds)}</T>
              </>
            ) : (
              <>
                <T s={0.98} w={700} c={colors.primaryInk} align="center">Estimate unavailable</T>
                <T s={0.78} c={colors.primaryInk} align="center" lh={1.35}>{estimate.message}</T>
              </>
            )}
          </View>

          {storageError ? <T s={0.78} c={colors.danger} lh={1.35}>{storageError}</T> : null}
          {backupMessage ? <T s={0.82} c={colors.primaryInk} lh={1.35}>{backupMessage}</T> : null}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Btn kind="p" flex onPress={onGo} label="Go to the GPS route to this child's school">GO</Btn>
            <Btn kind="o" flex onPress={onActivateBackup} disabled={backupBusy} loading={backupBusy} label="Activate backup pickup">
              Activate backup
            </Btn>
          </View>

          <T s={0.82} w={800} c="muted" align="center" up>PICK UP {childName} NOW</T>
          <T s={0.7} c="muted" align="center">Route and arrival estimates are approximate; live traffic is not included.</T>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// Where each person's dot sits on the 400x320 illustrated map. The collector's dot follows pickupStatus.currentPlace.
const PLACE_XY: Record<string, [number, number]> = { office: [60, 250], road: [180, 165], school: [250, 112] };
const SCHOOL_XY: [number, number] = [252, 114];
const BASE_XY: Record<string, [number, number]> = {
  siti: [95, 75],
  aiman: [352, 100],
  ima: [40, 150],
  ahmad: [340, 170],
  abu: [200, 222],
  salmah: [30, 215],
};

export function TodayDashboard() {
  const { theme, selectedCaregiver, trustedHelpers, weeklySchedule, temporaryDismissal, schoolLocation } = useAppContext();
  const pf = usePickupFlow();
  const { flow, collector, dismissal } = pf;
  const { child, school, familyMembers } = mockData;
  const caregiver = selectedCaregiver?.name ?? "Abu";
  const hour = pf.simActive ? Math.floor(pf.nowMin / 60) : new Date().getHours();
  const greeting = hour < 12 ? "Good morning," : hour < 17 ? "Good afternoon," : "Good evening,";
  const [demoOpen, setDemoOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [pickupPrompt, setPickupPrompt] = useState<PickupPrompt | null>(null);
  const [pickupPromptVisible, setPickupPromptVisible] = useState(false);
  const [pickupEstimate, setPickupEstimate] = useState<PickupEstimate>({ kind: "checking" });
  const [backupMessage, setBackupMessage] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [storageError, setStorageError] = useState("");
  const dismissedKeys = useRef(new Set<string>());
  const presentedKeys = useRef(new Set<string>());
  const pendingGo = useRef(false);
  const reduceMotion = useReduce();
  const readyHelpers = trustedHelpers.filter((helper) => helper.state === "active").length;

  useEffect(() => {
    let active = true;
    let checking = false;
    const checkPickupWindow = async () => {
      if (checking || locationOpen || pendingGo.current) return;
      checking = true;
      try {
        const now = new Date();
        const weekday = now.getDay();
        if (weekday < 1 || weekday > 5) {
          setPickupPromptVisible(false);
          return;
        }
        const scheduledTime = temporaryDismissal?.weekday === weekday
          ? temporaryDismissal.time
          : weeklySchedule[weekday as 1 | 2 | 3 | 4 | 5];
        const scheduledMinute = parseScheduledMinute(scheduledTime);
        if (scheduledMinute === null) {
          setPickupPromptVisible(false);
          return;
        }
        const minuteNow = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
        const difference = minuteNow - scheduledMinute;
        if (difference < -PICKUP_WINDOW_BEFORE_MINUTES || difference > PICKUP_WINDOW_AFTER_MINUTES) {
          setPickupPromptVisible(false);
          return;
        }

        const dateKey = localDateKey(now);
        const storageKey = `${PICKUP_ESTIMATE_DISMISSED_KEY}:${child.id}:${dateKey}`;
        if (dismissedKeys.current.has(storageKey) || presentedKeys.current.has(storageKey)) return;

        const candidates = [{ childId: child.id, childName: child.name, scheduledMinute, dateKey, storageKey }]
          .sort((first, second) => first.scheduledMinute - second.scheduledMinute);
        for (const candidate of candidates) {
          try {
            const dismissed = await AsyncStorage.getItem(candidate.storageKey);
            if (!active) return;
            if (dismissed !== null) {
              dismissedKeys.current.add(candidate.storageKey);
              continue;
            }
          } catch (cause) {
            if (!active) return;
            const reason = cause instanceof Error ? cause.message : "Unknown storage error.";
            setStorageError(`Could not check today's saved pickup reminder. ${reason}`);
          }
          presentedKeys.current.add(candidate.storageKey);
          setPickupPrompt(candidate);
          setPickupPromptVisible(true);
          return;
        }
        setPickupPromptVisible(false);
      } finally {
        checking = false;
      }
    };

    void checkPickupWindow();
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void checkPickupWindow();
    }, 60_000);
    const appStateListener = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkPickupWindow();
    });
    return () => {
      active = false;
      clearInterval(timer);
      appStateListener.remove();
    };
  }, [child.id, child.name, locationOpen, temporaryDismissal, weeklySchedule]);

  useEffect(() => {
    if (!pickupPromptVisible || !pickupPrompt) return;
    let cancelled = false;
    const controller = new AbortController();
    setPickupEstimate({ kind: "checking" });

    void (async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        if (!cancelled) {
          setPickupEstimate({
            kind: "unavailable",
            message: "Open GO to allow location access and calculate the route.",
          });
        }
        return;
      }

      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const destination = await resolveSchoolCoordinate(schoolLocation, controller.signal);
      const url = `https://router.project-osrm.org/route/v1/driving/${position.coords.longitude},${position.coords.latitude};${destination.longitude},${destination.latitude}?overview=false`;
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Routing service returned status ${response.status}.`);
      const payload: unknown = await response.json();
      if (!isRecord(payload) || payload.code !== "Ok" || !Array.isArray(payload.routes) || !isRecord(payload.routes[0])) {
        throw new Error("No driving route was found for the current location and school.");
      }
      const route = payload.routes[0];
      if (typeof route.distance !== "number" || !Number.isFinite(route.distance) || typeof route.duration !== "number" || !Number.isFinite(route.duration)) {
        throw new Error("The routing service returned an invalid distance or duration.");
      }
      if (!cancelled) {
        setPickupEstimate({ kind: "ready", distanceMeters: route.distance, durationSeconds: route.duration });
      }
    })().catch((cause: unknown) => {
      if (cancelled || controller.signal.aborted) return;
      const reason = cause instanceof Error ? cause.message : "Unknown estimate error.";
      setPickupEstimate({ kind: "unavailable", message: reason });
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [pickupPrompt?.storageKey, pickupPromptVisible, schoolLocation]);

  const dismissPickupPrompt = useCallback(async () => {
    if (!pickupPrompt) return;
    dismissedKeys.current.add(pickupPrompt.storageKey);
    try {
      await AsyncStorage.setItem(pickupPrompt.storageKey, "dismissed");
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "Unknown storage error.";
      setStorageError(`This reminder could not be saved as dismissed. It may appear again: ${reason}`);
      Alert.alert("Reminder not saved", "This pickup reminder could not be saved as dismissed and may appear again.");
    }
    setPickupPromptVisible(false);
  }, [pickupPrompt]);

  const goToPickupRoute = useCallback(() => {
    pendingGo.current = true;
    setPickupPromptVisible(false);
  }, []);

  const handlePickupPromptExited = useCallback(() => {
    if (pendingGo.current) {
      pendingGo.current = false;
      setPickupPrompt(null);
      setLocationOpen(true);
      return;
    }
    setPickupPrompt(null);
  }, []);

  const activateBackup = async () => {
    setBackupMessage("");
    setBackupBusy(true);
    try {
      const started = await pf.run("find_backup");
      setBackupMessage(started
        ? pf.simActive
          ? "Backup pickup preview activated. No helper was contacted."
          : "A backup pickup request was started."
        : "No backup pickup could be started. Check the trusted helper flow and try again.");
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "Unknown backup request error.";
      setBackupMessage(`Unable to activate backup pickup. ${reason}`);
    } finally {
      setBackupBusy(false);
    }
  };

  // Map dots (simulated map). The collector's dot follows the phase. In the demo a backup collector's marker moves
  // along the map while travelling (made-up progress, shown as simulated). In real mode nothing is tracked, so the
  // marker only jumps between "at home", "on the way" and "at school".
  const atSchoolPhases = ["at_school", "collected"];
  const place = flow.phase === "travelling" || flow.phase === "helper_assigned" ? "road" : atSchoolPhases.includes(flow.phase) ? "school" : "office";
  const collected = flow.phase === "collected";
  const helperCollector = collector.kind !== "parent";
  const travel = pf.simActive ? pf.demo.state.travel : null;
  const dots: MapDot[] = [...familyMembers, ...trustedHelpers.filter((helper) => helper.state === "active")].map((person) => {
    const isCollector = person.name === collector.name;
    const home = BASE_XY[person.id] ?? [200, 250];
    let xy: [number, number] = isCollector ? PLACE_XY[place] : home;
    if (isCollector && helperCollector) {
      if (flow.phase === "helper_assigned") xy = home;
      else if (flow.phase === "travelling") xy = travel === null ? PLACE_XY.road : [home[0] + (SCHOOL_XY[0] - home[0]) * travel, home[1] + (SCHOOL_XY[1] - home[1]) * travel];
      else if (atSchoolPhases.includes(flow.phase)) xy = SCHOOL_XY;
    }
    return { id: person.id, name: person.name, x: xy[0], y: xy[1], ring: isCollector && !collected, hidden: isCollector && collected };
  });
  const banner = usePickupBanner({ phase: flow.phase, collector: collector.name, childName: child.name, simulated: pf.simActive, whenLabel: `Picked up at ${clock(pf.nowMin)}` });
  const mapNote = flow.phase === "travelling" && pf.simActive ? "Simulated movement" : "Simulated map";

  return (
    <View style={{ flex: 1 }}>
    <AppShell
      title="SafeNest"
      badge="Today"
      activeTab="home"
      header={<TodayMap dots={dots} trail={collected} note={mapNote} clockLabel={pf.simActive ? clock(pf.nowMin) : null} onDemo={() => setDemoOpen(true)} onExpand={() => setMapOpen(true)} onLocation={() => setLocationOpen(true)} />}
    >
      <HelperAssignments />

      <Rise i={0} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", rowGap: 8, columnGap: 12 }}>
        <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 0 }}>
          <T s={0.85} c="muted">{greeting}</T>
          <T s={1.1} w={700} ls={-0.01}>{caregiver}</T>
        </View>
        <ChildChip name={child.name} dismissal={dismissal} />
      </Rise>

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

      <PickupStatusCard pf={pf} childName={child.name} />

      <Rise i={2}>
        <Card tight>
          <NavRow first href="/plan" icon="plan" title="Pickup plan" sub={`${child.name} · ${school.name}`} />
          <NavRow href="/circle" icon="circle" title="Trusted circle" sub={`${readyHelpers} helper${readyHelpers === 1 ? "" : "s"} ready to collect`} />
        </Card>
      </Rise>
      <DemoSheet visible={demoOpen} onClose={() => setDemoOpen(false)} pf={pf} />
      <FullMap visible={mapOpen} onClose={() => setMapOpen(false)} dots={dots} trail={collected} />
      <DeviceLocationModal visible={locationOpen} onClose={() => setLocationOpen(false)} />
      {pickupPrompt ? (
        <PickupEstimateModal
          visible={pickupPromptVisible}
          childName={pickupPrompt.childName}
          estimate={pickupEstimate}
          backupMessage={backupMessage}
          backupBusy={backupBusy}
          storageError={storageError}
          onClose={() => void dismissPickupPrompt()}
          onGo={goToPickupRoute}
          onActivateBackup={() => void activateBackup()}
          onExited={handlePickupPromptExited}
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

/** Full-bleed illustrated map with the frosted overlay chips. */
function TodayMap({ dots, trail, note, clockLabel, onDemo, onExpand, onLocation }: { dots: MapDot[]; trail: boolean; note: string; clockLabel: string | null; onDemo: () => void; onExpand: () => void; onLocation: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const h = Math.min(380, Math.max(240, winH * 0.4)) + insets.top;
  const topY = Math.max(12, insets.top + 8);
  return (
    <View style={{ height: h, backgroundColor: c.map, overflow: "hidden" }}>
      <MapView dots={dots} trail={trail} label="Illustrated simulated map showing the school and pickup route" />
      <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, top: topY, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Glass style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5, paddingLeft: 5, paddingRight: 12 }}>
          <Image source={LOGO} style={{ width: 30, height: 30, borderRadius: 15 }} />
          <T w={700} ls={-0.01}>SafeNest</T>
        </Glass>
        {clockLabel ? (
          <Glass style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 38 }}>
            <Icon name="clock" size={16} color={c.primaryInk} stroke={2} />
            <T s={0.85} w={800} c={c.primaryInk} tab>{clockLabel}</T>
          </Glass>
        ) : null}
        <Press onPress={onDemo} label="Open demo controls" hint="Preview simulated pickup situations" style={{ minHeight: 44, justifyContent: "center" }}>
          <Glass style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 38 }}>
            <Icon name="sliders" size={16} color={c.primaryInk} stroke={2} />
            <T s={0.85} w={700} c={c.primaryInk}>Demo</T>
          </Glass>
        </Press>
      </View>
      <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, bottom: 36, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <View pointerEvents="none">
          <Glass style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, height: 34 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.trail }} />
            <T s={0.8} w={600} c="muted">{note}</T>
          </Glass>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Press onPress={onLocation} label="Open this phone's live location" style={{ minHeight: 44, justifyContent: "center" }}>
            <Glass style={{ height: 38, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10 }}>
              <Icon name="look" size={16} color={c.primaryInk} stroke={2} />
              <T s={0.78} w={700} c={c.primaryInk}>My GPS</T>
            </Glass>
          </Press>
          <Press onPress={onExpand} label="Open full screen simulated map" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Glass style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", paddingHorizontal: 0 }}>
              <Icon name="expand" size={18} color={c.primaryInk} stroke={2} />
            </Glass>
          </Press>
        </View>
      </View>
    </View>
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
