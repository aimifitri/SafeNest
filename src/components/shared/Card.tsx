import { StyleSheet, View } from "react-native";
import type { ReactNode } from "react";

import { useAppContext } from "./AppContext";
import type { ThemeTokens } from "./theme";

type CardProps = { children: ReactNode; variant?: "default" | "hero" | "warning"; style?: object };

export function Card({ children, variant = "default", style }: CardProps) {
  const { theme } = useAppContext();
  const styles = makeStyles(theme);
  return <View style={[styles.base, styles[variant], style]}>{children}</View>;
}

const makeStyles = (theme: ThemeTokens) => StyleSheet.create({
  base: { backgroundColor: theme.colors.card, borderColor: theme.colors.line, borderWidth: 1, borderRadius: theme.radius.card, padding: theme.spacing.md, shadowColor: theme.colors.ink, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  default: {},
  hero: { backgroundColor: theme.colors.heroStart, borderColor: theme.colors.heroStart },
  warning: { backgroundColor: theme.colors.warning, borderColor: theme.colors.warning },
});
