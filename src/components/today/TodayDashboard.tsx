import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppShell } from "../shared/AppShell";

export function TodayDashboard() {
  return (
    <AppShell title="SafeNest" badge="Today" activeTab="home">
      <Text style={styles.greeting}>Hello, Leena 👋</Text>
      <Text style={styles.subtitle}>Here’s your family pickup overview for today.</Text>

      <View style={styles.cardPrimary}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardLabel}>TODAY'S PICKUP</Text>
          <View style={styles.statusPill}>
            <Text style={styles.statusText}>On track</Text>
          </View>
        </View>

        <Text style={styles.childName}>Aiman’s school pickup</Text>
        <Text style={styles.detail}>📍 Primary School</Text>
        <Text style={styles.detail}>🕐 Pickup deadline: 1:00 PM</Text>

        <View style={styles.divider} />

        <Text style={styles.smallLabel}>CONFIRMED COLLECTOR</Text>
        <Text style={styles.collector}>Dad</Text>

        <Pressable style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Request backup pickup</Text>
        </Pressable>

        <Link href="/plan" asChild>
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>View journey</Text>
          </Pressable>
        </Link>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>1</Text>
          <Text style={styles.summaryLabel}>Pickup today</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>2</Text>
          <Text style={styles.summaryLabel}>Trusted contacts</Text>
        </View>
      </View>

      <Link href="/circle" asChild>
        <Pressable style={styles.inlineLink}>
          <Text style={styles.inlineLinkText}>See trusted circle</Text>
        </Pressable>
      </Link>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  greeting: {
    marginTop: 18,
    fontSize: 24,
    fontWeight: "800",
    color: "#163545",
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 20,
    color: "#607684",
    fontSize: 14,
  },
  cardPrimary: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: "#DFEAF0",
    shadowColor: "#123747",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#6D7F8A",
  },
  statusPill: {
    backgroundColor: "#DFF5EE",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    color: "#1D7C5D",
    fontSize: 11,
    fontWeight: "700",
  },
  childName: {
    marginTop: 18,
    fontSize: 21,
    fontWeight: "800",
    color: "#163545",
  },
  detail: {
    marginTop: 10,
    color: "#566C7B",
    fontSize: 14,
  },
  divider: {
    height: 1,
    backgroundColor: "#E7EEF2",
    marginVertical: 18,
  },
  smallLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#728795",
  },
  collector: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: "700",
    color: "#163545",
  },
  primaryButton: {
    marginTop: 22,
    backgroundColor: "#2E8B70",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  secondaryButton: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D9E3EA",
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#F9FBFC",
  },
  secondaryButtonText: {
    color: "#163545",
    fontWeight: "700",
    fontSize: 14,
  },
  summaryRow: {
    marginTop: 24,
    flexDirection: "row",
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E3EBF1",
    padding: 18,
  },
  summaryValue: {
    color: "#0F7D86",
    fontSize: 28,
    fontWeight: "800",
  },
  summaryLabel: {
    marginTop: 6,
    color: "#607684",
    fontSize: 12,
  },
  inlineLink: {
    marginTop: 22,
    paddingVertical: 12,
    alignItems: "center",
  },
  inlineLinkText: {
    color: "#0F7D86",
    fontWeight: "700",
    fontSize: 14,
  },
});
