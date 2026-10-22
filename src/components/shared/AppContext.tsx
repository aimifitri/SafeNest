
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { PropsWithChildren } from "react";
import { AppState, useColorScheme } from "react-native";

import type {
  FontStyle,
  TextScale,
  ThemeMode,
  ThemeTokens,
} from "./theme";
import {
  DEFAULT_FONT_STYLE,
  getFontSpec,
  textScaleValues,
  themeTokens,
} from "./theme";

import { useAuth } from "./AuthContext";
import { useHousehold } from "./HouseholdContext";
import { fetchPlan, savePlanDay } from "./householdApi";
import {
  cancelRequest,
  completeRequest,
  createBackupRequest,
  fetchFirstChild,
  fetchLatestRequest,
  isUuid,
  subscribeToRequests,
  toUiRequest,
} from "./backupApi";
import type { ApiResult, StoredChild } from "./backupApi";
import { mockData } from "./mockData";

import type {
  BackupRequest,
  BackupRequestState,
  Caregiver,
  ContactState,
  PickupSchedule,
  TrustedHelper,
  Weekday,
} from "./types";

// Use the existing schedule structure.
type WeekdayTimes = PickupSchedule["weekdayTimes"];

type TemporaryDismissal = {
  weekday: Weekday;
  time: string;
};

interface AppContextValue {
  selectedCaregiver: Caregiver | null;
  selectCaregiver: (caregiver: Caregiver) => void;
  clearCaregiver: () => void;

  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;

  textScale: TextScale;
  setTextScale: (scale: TextScale) => void;

  // Font style picked in Settings. Applied app-wide through theme.fontFamily.
  fontStyle: FontStyle;
  setFontStyle: (style: FontStyle) => void;

  // Regular Monday-Friday dismissal schedule.
  weeklySchedule: WeekdayTimes;

  // false for a real account until at least one weekday is saved. Demo Mode counts as set up.
  planConfigured: boolean;
  planError: string | null;

  // Update only one day for the current child.
  updateWeekdayTime: (
    childId: string,
    weekday: Weekday,
    time: string
  ) => void;

  // Temporary dismissal remains independent.
  temporaryDismissal: TemporaryDismissal | null;
  setTemporaryDismissal: (
    override: TemporaryDismissal | null
  ) => void;

  // backupRequest.simulated === true: local demo. false: stored in Supabase and answered by the real helper.
  // The action functions resolve true only after the server confirmed the change.
  backupRequest: BackupRequest;
  // true when this family has a stored child, so requests to real helpers go through Supabase.
  backupLive: boolean;
  // Database id of that child (null while the app is still on the demo child).
  storedChildId: string | null;
  // Where the school is, if saved (children.school_latitude / school_longitude). Needed for travel-time estimates.
  schoolLocation: { latitude: number; longitude: number } | null;
  backupBusy: boolean;
  backupError: string | null;
  dismissBackupError: () => void;
  requestBackupPickup: (helperId?: string) => Promise<boolean>;
  // Demo only. Ignored for real requests, which only the chosen helper can answer.
  respondToBackupPickup: (
    state: Extract<
      BackupRequestState,
      "accepted" | "declined"
    >
  ) => void;
  // Cancels an open request (or hides an answered one).
  resetBackupRequest: () => Promise<boolean>;
  completeBackupPickup: () => Promise<boolean>;

  trustedHelpers: TrustedHelper[];
  setTrustedHelperState: (
    helperId: string,
    state: ContactState
  ) => void;

  theme: ThemeTokens;
}

const AppContext = createContext<AppContextValue | null>(
  null
);

export function AppProvider({
  children,
}: PropsWithChildren) {
  const systemScheme = useColorScheme();

  const [
    selectedCaregiver,
    selectCaregiver,
  ] = useState<Caregiver | null>(null);

  const [themeMode, setThemeMode] =
    useState<ThemeMode>("system");

  const [textScale, setTextScale] =
    useState<TextScale>("default");

  const [fontStyle, setFontStyle] =
    useState<FontStyle>(DEFAULT_FONT_STYLE);

  const household = useHousehold();
  const hhChildId = household.child?.id ?? null;

  // Demo Mode starts from the sample schedule. A real account starts from a neutral default until its own plan is
  // loaded from Supabase (public.pickup_plans); planConfigured says whether the parent has saved one.
  const [weeklySchedule, setWeeklySchedule] =
    useState<WeekdayTimes>(() => ({
      ...mockData.schedule.weekdayTimes,
    }));
  const [planConfigured, setPlanConfigured] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    setPlanError(null);
    if (household.demo) {
      setWeeklySchedule({ ...mockData.schedule.weekdayTimes });
      setPlanConfigured(true);
      return;
    }
    const base: WeekdayTimes = { 1: "1:00 PM", 2: "1:00 PM", 3: "1:00 PM", 4: "1:00 PM", 5: "1:00 PM" };
    setWeeklySchedule(base);
    setPlanConfigured(false);
    if (!hhChildId) return;
    let active = true;
    void fetchPlan(hhChildId).then((res) => {
      if (!active) return;
      if (!res.ok) {
        setPlanError(res.error);
        return;
      }
      const saved = res.data;
      setWeeklySchedule({ ...base, ...Object.fromEntries(Object.entries(saved).filter(([k]) => Number(k) >= 1 && Number(k) <= 5)) } as WeekdayTimes);
      setPlanConfigured(Object.keys(saved).length > 0);
    });
    return () => {
      active = false;
    };
  }, [household.demo, hhChildId]);

  // Save one weekday without changing other days.
  const updateWeekdayTime = (
    childId: string,
    weekday: Weekday,
    time: string
  ) => {
    // Only the child SafeNest is currently about can be changed.
    const currentChildId = household.demo ? mockData.child.id : hhChildId;
    if (!currentChildId || childId !== currentChildId) {
      return;
    }

    // Keep the prototype's 12-hour time format.
    const normalizedTime = time.trim();
    const isValidTime =
      /^(?:1[0-2]|[1-9]):[0-5][0-9] (?:AM|PM)$/.test(
        normalizedTime
      );

    if (!isValidTime) {
      return;
    }

    // Only accept Monday-Friday.
    if (
      !Number.isInteger(weekday) ||
      weekday < 1 ||
      weekday > 5
    ) {
      return;
    }

    const previous = weeklySchedule[weekday];
    setWeeklySchedule((current) => ({
      ...current,
      [weekday]: normalizedTime,
    }));
    if (household.demo) return;
    // A real account: save it, and put the old time back if the save fails so the screen never lies.
    const fid = household.familyId;
    if (!fid) return;
    setPlanError(null);
    void savePlanDay(fid, currentChildId, weekday, normalizedTime).then((res) => {
      if (res.ok) {
        setPlanConfigured(true);
      } else {
        setPlanError(res.error);
        setWeeklySchedule((current) => ({ ...current, [weekday]: previous }));
      }
    });
  };

  const [
    temporaryDismissal,
    setTemporaryDismissal,
  ] = useState<TemporaryDismissal | null>(null);

  const { session, familyId } = useAuth();
  const [backupRequest, setBackupRequest] =
    useState<BackupRequest>(mockData.backupRequest);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [dbChild, setDbChild] = useState<StoredChild | null>(null);
  const dbChildId = dbChild?.id ?? null;
  const backupRef = useRef<BackupRequest>(backupRequest);
  const busyRef = useRef(false);
  const dismissedId = useRef<string | null>(null);

  useEffect(() => {
    backupRef.current = backupRequest;
  }, [backupRequest]);

  // The child stored for this family. Without one, backup requests stay a local demo.
  const userId = session?.user.id;
  useEffect(() => {
    if (!familyId || !userId) {
      setDbChild(null);
      return;
    }
    let active = true;
    void fetchFirstChild(familyId).then((child) => {
      if (active) setDbChild(child);
    });
    return () => {
      active = false;
    };
  }, [familyId, userId, household.version]);

  const refreshBackup = useCallback(async () => {
    if (!dbChildId) return;
    const res = await fetchLatestRequest(dbChildId);
    if (!res.ok) {
      // Keep the last known state. Do not pretend it is fresh.
      setBackupError(res.error);
      return;
    }
    const current = backupRef.current;
    // Do not wipe a demo that is in progress.
    if (current.simulated && current.state !== "idle") return;
    setBackupRequest(toUiRequest(res.data, dismissedId.current));
  }, [dbChildId]);

  // Load, then follow changes live. Also re-check when the app returns to the foreground.
  useEffect(() => {
    if (!dbChildId) return;
    void refreshBackup();
    const unsubscribe = subscribeToRequests(dbChildId, () => void refreshBackup());
    const appState = AppState.addEventListener("change", (next) => {
      if (next === "active") void refreshBackup();
    });
    return () => {
      unsubscribe();
      appState.remove();
      dismissedId.current = null;
      setBackupRequest(mockData.backupRequest);
    };
  }, [dbChildId, refreshBackup]);

  // One server action at a time, so a double tap cannot send two requests.
  const runLive = async (action: () => Promise<ApiResult<unknown>>): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBackupBusy(true);
    setBackupError(null);
    try {
      const res = await action();
      if (!res.ok) setBackupError(res.error);
      await refreshBackup();
      return res.ok;
    } finally {
      busyRef.current = false;
      setBackupBusy(false);
    }
  };

  const requestBackupPickup = async (helperId?: string): Promise<boolean> => {
    if (dbChildId && isUuid(helperId)) {
      const current = backupRef.current;
      return runLive(async () => {
        // Switching helper: close the open request first.
        if (current.id && current.state === "requested" && current.helperId !== helperId) {
          const cancelled = await cancelRequest(current.id);
          if (!cancelled.ok) return cancelled;
        }
        return createBackupRequest(dbChildId, helperId);
      });
    }
    setBackupRequest({ state: "requested", helperId, simulated: true });
    return true;
  };

  const resetBackupRequest = async (): Promise<boolean> => {
    const current = backupRef.current;
    if (current.simulated || !current.id) {
      setBackupRequest(mockData.backupRequest);
      return true;
    }
    if (current.state === "declined") {
      dismissedId.current = current.id;
      setBackupRequest({ state: "idle", simulated: false });
      return true;
    }
    return runLive(() => cancelRequest(current.id as string));
  };

  const completeBackupPickup = async (): Promise<boolean> => {
    const current = backupRef.current;
    if (current.simulated || !current.id || current.state !== "accepted") return false;
    return runLive(() => completeRequest(current.id as string));
  };

  // Trusted Circle helpers come from the household: sample people in Demo Mode, stored people for a real account.
  const trustedHelpers = useMemo<TrustedHelper[]>(
    () => household.helpers.map((h) => ({ id: h.id, name: h.name, role: h.role, state: h.state })),
    [household.helpers],
  );

  const resolvedTheme =
    themeMode === "system"
      ? systemScheme === "dark"
        ? "dark"
        : "light"
      : themeMode;

  const theme = useMemo<ThemeTokens>(
    () => ({
      ...themeTokens[resolvedTheme],
      textScale: textScaleValues[textScale],
      fontFamily: getFontSpec(fontStyle).regular,
      font: getFontSpec(fontStyle),
    }),
    [resolvedTheme, textScale, fontStyle]
  );

  const value = useMemo<AppContextValue>(
    () => ({
      selectedCaregiver,
      selectCaregiver,
      clearCaregiver: () =>
        selectCaregiver(null),

      themeMode,
      setThemeMode,

      textScale,
      setTextScale,

      fontStyle,
      setFontStyle,

      // Shared weekly schedule.
      weeklySchedule,
      planConfigured,
      planError,
      updateWeekdayTime,

      // Existing temporary override.
      temporaryDismissal,
      setTemporaryDismissal,

      // Existing backup pickup behaviour.
      backupRequest,
      backupLive: dbChildId !== null,
      storedChildId: dbChildId,
      schoolLocation: dbChild?.school ?? null,
      backupBusy,
      backupError,
      dismissBackupError: () => setBackupError(null),
      requestBackupPickup,

      respondToBackupPickup: (state) =>
        setBackupRequest((current) =>
          current.simulated ? { ...current, state } : current
        ),

      resetBackupRequest,
      completeBackupPickup,

      // Existing trusted helper behaviour.
      trustedHelpers,
      setTrustedHelperState: (helperId, state) => {
        void household.setHelperState(helperId, state);
      },

      theme,
    }),
    [
      selectedCaregiver,
      themeMode,
      textScale,
      fontStyle,
      weeklySchedule,
      planConfigured,
      planError,
      household.demo,
      temporaryDismissal,
      backupRequest,
      backupBusy,
      backupError,
      dbChildId,
      dbChild,
      refreshBackup,
      trustedHelpers,
      theme,
    ]
  );

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error(
      "useAppContext must be used inside AppProvider"
    );
  }

  return context;
}