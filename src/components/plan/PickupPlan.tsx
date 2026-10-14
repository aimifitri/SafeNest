import { StyleSheet, Text, View } from "react-native";
import { AppShell } from "../shared/AppShell";

export function PickupPlan() {
  return (
    <AppShell title="Pickup Plan" badge="Plan" activeTab="plan">
      <Text style={styles.lead}>
        Your scheduled responsibilities and upcoming pickup flow.
      </Text>

      <View style={styles.planCard}>
        <Text style={styles.planTitle}>Today</Text>
        <Text style={styles.planTime}>1:00 PM departure</Text>
        <Text style={styles.planMeta}>Collector: Dad</Text>
        <Text style={styles.planMeta}>Route: School → Home</Text>
      </View>

      <View style={styles.planCard}>
        <Text style={styles.planTitle}>Backup</Text>
        <Text style={styles.planTime}>Auntie Sam available by 12:30 PM</Text>
        <Text style={styles.planMeta}>Status: ready to confirm if needed</Text>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  lead: {
    marginTop: 16,
    marginBottom: 18,
    color: "#607684",
    fontSize: 14,
  },
  planCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DDEAF0",
    padding: 18,
    marginBottom: 14,
  },
  planTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#163545",
  },
  planTime: {
    marginTop: 8,
    color: "#0F7D86",
    fontSize: 15,
    fontWeight: "700",
  },
  planMeta: {
    marginTop: 8,
    color: "#607684",
    fontSize: 13,
  },
});
