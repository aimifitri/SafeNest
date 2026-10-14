import { StyleSheet, Text, View } from "react-native";

import { useAppContext } from "./AppContext";
import type { ThemeTokens } from "./theme";

type StatusPillProps = { label: string; tone?: "neutral" | "success" | "warning" | "danger" | "info" };

export function StatusPill({ label, tone = "neutral" }: StatusPillProps) {
  const { theme } = useAppContext();
  const styles = makeStyles(theme);
  return <View style={[styles.pill, styles[tone]]}><Text style={[styles.text, tone === "warning" && styles.warningText, tone === "danger" && styles.dangerText]}>{label}</Text></View>;
}

const makeStyles = (theme: ThemeTokens) => StyleSheet.create({
  pill: { alignSelf: "flex-start", borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  text: { color: theme.colors.primaryInk, fontSize: theme.type.small * theme.textScale, fontWeight: "700" },
  neutral: { backgroundColor: theme.colors.primarySoft },
  info: { backgroundColor: theme.colors.primarySoft },
  success: { backgroundColor: theme.colors.successSoft },
  warning: { backgroundColor: theme.colors.warning },
  warningText: { color: theme.colors.warningInk },
  danger: { backgroundColor: theme.colors.dangerSoft },
  dangerText: { color: theme.colors.danger },
});
