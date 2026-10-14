import { StyleSheet, Text } from "react-native";

import { useAppContext } from "./AppContext";
import type { ThemeTokens } from "./theme";

type SectionHeadingProps = { title: string; accessibilityLabel?: string };

export function SectionHeading({ title, accessibilityLabel }: SectionHeadingProps) {
  const { theme } = useAppContext();
  const styles = makeStyles(theme);
  return <Text accessibilityRole="header" accessibilityLabel={accessibilityLabel} style={styles.text}>{title}</Text>;
}

const makeStyles = (theme: ThemeTokens) => StyleSheet.create({
  text: { color: theme.colors.muted, fontSize: theme.type.section * theme.textScale, fontWeight: "700", letterSpacing: 0.7, textTransform: "uppercase", marginHorizontal: theme.spacing.xs, marginTop: theme.spacing.xs },
});
