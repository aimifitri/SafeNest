import { createContext, useContext, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import { useColorScheme } from "react-native";

import { textScaleValues, themeTokens } from "./theme";
import type { TextScale, ThemeMode, ThemeTokens } from "./theme";
import { mockData } from "./mockData";
import type { BackupRequestState, Caregiver, ContactState, TrustedHelper, Weekday } from "./types";

interface AppContextValue {
  selectedCaregiver: Caregiver | null;
  selectCaregiver: (caregiver: Caregiver) => void;
  clearCaregiver: () => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  textScale: TextScale;
  setTextScale: (scale: TextScale) => void;
  temporaryDismissal: { weekday: Weekday; time: string } | null;
  setTemporaryDismissal: (override: { weekday: Weekday; time: string } | null) => void;
  backupRequest: typeof mockData.backupRequest;
  requestBackupPickup: (helperId?: string) => void;
  respondToBackupPickup: (state: Extract<BackupRequestState, "accepted" | "declined">) => void;
  resetBackupRequest: () => void;
  trustedHelpers: TrustedHelper[];
  setTrustedHelperState: (helperId: string, state: ContactState) => void;
  theme: ThemeTokens;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [selectedCaregiver, selectCaregiver] = useState<Caregiver | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [textScale, setTextScale] = useState<TextScale>("default");
  const [temporaryDismissal, setTemporaryDismissal] = useState<{ weekday: Weekday; time: string } | null>(null);
  const [backupRequest, setBackupRequest] = useState(mockData.backupRequest);
  const [trustedHelpers, setTrustedHelpers] = useState<TrustedHelper[]>(() => mockData.trustedHelpers.map((helper) => ({ ...helper })));
  const resolvedTheme = themeMode === "system" ? (systemScheme === "dark" ? "dark" : "light") : themeMode;
  const theme = useMemo<ThemeTokens>(() => ({
    ...themeTokens[resolvedTheme],
    textScale: textScaleValues[textScale],
  }), [resolvedTheme, textScale]);
  const value = useMemo<AppContextValue>(() => ({
    selectedCaregiver,
    selectCaregiver,
    clearCaregiver: () => selectCaregiver(null),
    themeMode,
    setThemeMode,
    textScale,
    setTextScale,
    temporaryDismissal,
    setTemporaryDismissal,
    backupRequest,
    requestBackupPickup: (helperId) => setBackupRequest({ state: "requested", helperId, simulated: true }),
    respondToBackupPickup: (state) => setBackupRequest((current) => ({ ...current, state })),
    resetBackupRequest: () => setBackupRequest(mockData.backupRequest),
    trustedHelpers,
    setTrustedHelperState: (helperId, state) => setTrustedHelpers((current) => current.map((helper) => helper.id === helperId ? { ...helper, state } : helper)),
    theme,
  }), [selectedCaregiver, themeMode, textScale, temporaryDismissal, backupRequest, trustedHelpers, theme]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used inside AppProvider");
  return context;
}
