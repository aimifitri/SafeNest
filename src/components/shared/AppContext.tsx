import { createContext, useContext, useMemo, useState } from "react";
import type { PropsWithChildren } from "react";
import { useColorScheme } from "react-native";

import { textScaleValues, themeTokens } from "./theme";
import type { TextScale, ThemeMode, ThemeTokens } from "./theme";
import type { Caregiver } from "./types";

interface AppContextValue {
  selectedCaregiver: Caregiver | null;
  selectCaregiver: (caregiver: Caregiver) => void;
  clearCaregiver: () => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  textScale: TextScale;
  setTextScale: (scale: TextScale) => void;
  theme: ThemeTokens;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [selectedCaregiver, selectCaregiver] = useState<Caregiver | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [textScale, setTextScale] = useState<TextScale>("default");
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
    theme,
  }), [selectedCaregiver, themeMode, textScale, theme]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used inside AppProvider");
  return context;
}
