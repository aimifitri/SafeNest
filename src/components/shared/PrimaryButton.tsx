import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import type { ReactNode } from "react";

import { useAppContext } from "./AppContext";
import type { ThemeTokens } from "./theme";

export type ButtonProps = { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; accessibilityLabel?: string; leadingIcon?: ReactNode };

export function PrimaryButton({ label, onPress, disabled = false, loading = false, accessibilityLabel, leadingIcon }: ButtonProps) {
  const { theme } = useAppContext();
  const styles = makeStyles(theme);
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: disabled || loading, busy: loading }} disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, styles.primary, (disabled || loading) && styles.disabled, pressed && styles.pressed]}>
    {loading ? <ActivityIndicator color={theme.colors.onPrimary} /> : leadingIcon}
    <Text style={[styles.text, styles.primaryText]}>{label}</Text>
  </Pressable>;
}

const makeStyles = (theme: ThemeTokens) => StyleSheet.create({
  button: { minHeight: 54, borderRadius: theme.radius.control, paddingHorizontal: theme.spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.spacing.sm },
  primary: { backgroundColor: theme.colors.primary },
  text: { fontSize: theme.type.body * theme.textScale, fontWeight: "700", textAlign: "center" },
  primaryText: { color: theme.colors.onPrimary },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
