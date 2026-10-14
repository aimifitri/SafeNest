import { Link } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type AppShellProps = {
  title: string;
  badge?: string;
  children: React.ReactNode;
  activeTab: "home" | "circle" | "plan" | "settings";
};

const tabs = [
  { key: "home", label: "Home", href: "/" },
  { key: "circle", label: "Circle", href: "/circle" },
  { key: "plan", label: "Plan", href: "/plan" },
  { key: "settings", label: "Profile", href: "/settings" },
] as const;

export function AppShell({ title, badge, children, activeTab }: AppShellProps) {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>

      <View style={styles.navBar}>
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;

          return (
            <Link key={tab.key} href={tab.href} asChild>
              <Pressable style={styles.navButton}>
                <Text
                  style={[styles.navLabel, isActive && styles.navLabelActive]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            </Link>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F4F8FB",
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F4F8FB",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#163545",
  },
  badge: {
    backgroundColor: "#EAF4F5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeText: {
    color: "#0F7D86",
    fontSize: 11,
    fontWeight: "700",
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 140,
  },
  navBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E3EBEF",
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  navButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  navLabel: {
    color: "#7C8E97",
    fontSize: 12,
    fontWeight: "700",
  },
  navLabelActive: {
    color: "#0F7D86",
  },
});
