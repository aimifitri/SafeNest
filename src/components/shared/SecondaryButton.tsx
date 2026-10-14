import { Pressable, StyleSheet, Text } from "react-native";
import type { ReactNode } from "react";

import { useAppContext } from "./AppContext";
import type { ButtonProps } from "./PrimaryButton";
import type { ThemeTokens } from "./theme";

type SecondaryButtonProps = ButtonProps & { leadingIcon?: ReactNode };

export function SecondaryButton({ label, onPress, disabled = false, loading = false, accessibilityLabel, leadingIcon }: SecondaryButtonProps) {
  const { theme } = useAppContext();
  const styles = makeStyles(theme);
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled: disabled || loading, busy: loading }} disabled={disabled || loading} onPress={onPress} style={({ pressed }) => [styles.button, (disabled || loading) && styles.disabled, pressed && styles.pressed]}>
    {leadingIcon}<Text style={styles.text}>{label}</Text>
  </Pressable>;
}

const makeStyles = (theme: ThemeTokens) => StyleSheet.create({
  button: { minHeight: 54, borderRadius: theme.radius.control, paddingHorizontal: theme.spacing.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: theme.spacing.sm, backgroundColor: theme.colors.primarySoft, borderColor: theme.colors.line, borderWidth: 1 },
  text: { color: theme.colors.primaryInk, fontSize: theme.type.body * theme.textScale, fontWeight: "700", textAlign: "center" },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
