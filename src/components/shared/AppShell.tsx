import { Link } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppContext } from "./AppContext";
import type { ThemeTokens } from "./theme";

type AppShellProps = {
  title: string;
  badge?: string;
  children: ReactNode;
  activeTab: "home" | "circle" | "plan" | "settings";
};

const tabs = [
  { key: "home", label: "Today", href: "/" },
  { key: "circle", label: "Circle", href: "/circle" },
  { key: "plan", label: "Plan", href: "/plan" },
  { key: "settings", label: "Settings", href: "/settings" },
] as const;

export function AppShell({ title, badge, children, activeTab }: AppShellProps) {
  const { theme } = useAppContext();
  const insets = useSafeAreaInsets();
  const styles = makeStyles(theme, insets.top, insets.bottom);
  return <View style={styles.screen}>
    <View style={styles.header}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {badge ? <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View> : null}
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    <View accessibilityRole="tablist" style={styles.navBar}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        // Expo's generated typed-route union is stale in this checkout for the existing routes.
        return <Link key={tab.key} href={tab.href as never} asChild>
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: isActive }} accessibilityLabel={tab.label} style={styles.navButton}>
            <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{tab.label}</Text>
          </Pressable>
        </Link>;
      })}
    </View>
  </View>;
}

const makeStyles = (theme: ThemeTokens, topInset: number, bottomInset: number) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: { paddingTop: Math.max(topInset, theme.spacing.xl), paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.sm, flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: theme.colors.background },
  title: { fontSize: theme.type.title * theme.textScale, fontWeight: "800", color: theme.colors.ink },
  badge: { backgroundColor: theme.colors.primarySoft, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.xs },
  badgeText: { color: theme.colors.primaryInk, fontSize: theme.type.small * theme.textScale, fontWeight: "700" },
  content: { paddingHorizontal: theme.spacing.lg, paddingBottom: 100 + bottomInset },
  navBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-around", backgroundColor: theme.colors.card, borderTopWidth: 1, borderTopColor: theme.colors.line, paddingTop: theme.spacing.sm, paddingBottom: Math.max(bottomInset, theme.spacing.sm), paddingHorizontal: theme.spacing.xs },
  navButton: { minWidth: 64, alignItems: "center", paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.sm, borderRadius: 12 },
  navLabel: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale, fontWeight: "700" },
  navLabelActive: { color: theme.colors.primary },
});
