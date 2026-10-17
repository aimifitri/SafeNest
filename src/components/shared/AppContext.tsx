
import {
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";

import type { PropsWithChildren } from "react";
import { useColorScheme } from "react-native";

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

import { mockData } from "./mockData";

import type {
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

  backupRequest: typeof mockData.backupRequest;
  requestBackupPickup: (helperId?: string) => void;
  respondToBackupPickup: (
    state: Extract<
      BackupRequestState,
      "accepted" | "declined"
    >
  ) => void;
  resetBackupRequest: () => void;

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

  // Initial schedule comes from existing mock data.
  const [weeklySchedule, setWeeklySchedule] =
    useState<WeekdayTimes>(() => ({
      ...mockData.schedule.weekdayTimes,
    }));

  // Save one weekday without changing other days.
  const updateWeekdayTime = (
    childId: string,
    weekday: Weekday,
    time: string
  ) => {
    // Single-child prototype: only Laila is supported.
    if (childId !== mockData.child.id) {
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

    setWeeklySchedule((current) => ({
      ...current,
      [weekday]: normalizedTime,
    }));
  };

  const [
    temporaryDismissal,
    setTemporaryDismissal,
  ] = useState<TemporaryDismissal | null>(null);

  const [backupRequest, setBackupRequest] =
    useState(mockData.backupRequest);

  const [trustedHelpers, setTrustedHelpers] =
    useState<TrustedHelper[]>(() =>
      mockData.trustedHelpers.map((helper) => ({
        ...helper,
      }))
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
      updateWeekdayTime,

      // Existing temporary override.
      temporaryDismissal,
      setTemporaryDismissal,

      // Existing backup pickup behaviour.
      backupRequest,
      requestBackupPickup: (helperId) =>
        setBackupRequest({
          state: "requested",
          helperId,
          simulated: true,
        }),

      respondToBackupPickup: (state) =>
        setBackupRequest((current) => ({
          ...current,
          state,
        })),

      resetBackupRequest: () =>
        setBackupRequest(mockData.backupRequest),

      // Existing trusted helper behaviour.
      trustedHelpers,
      setTrustedHelperState: (helperId, state) =>
        setTrustedHelpers((current) =>
          current.map((helper) =>
            helper.id === helperId
              ? { ...helper, state }
              : helper
          )
        ),

      theme,
    }),
    [
      selectedCaregiver,
      themeMode,
      textScale,
      fontStyle,
      weeklySchedule,
      temporaryDismissal,
      backupRequest,
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