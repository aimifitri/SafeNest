import { AppShell } from "../shared/AppShell";
import { StyleSheet, Text, View } from "react-native";

const members = [
  { name: "Dad", role: "Primary collector", status: "Confirmed" },
  { name: "Auntie Sam", role: "Backup helper", status: "Available" },
  { name: "Grandma", role: "School contact", status: "Pending" },
];

export function TrustedCircle() {
  return (
    <AppShell title="Trusted Circle" badge="Circle" activeTab="circle">
      <Text style={styles.lead}>
        Approved pickup contacts and backup helpers.
      </Text>

      {members.map((member) => (
        <View key={member.name} style={styles.memberCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{member.name.charAt(0)}</Text>
          </View>

          <View style={styles.memberInfo}>
            <Text style={styles.name}>{member.name}</Text>
            <Text style={styles.role}>{member.role}</Text>
          </View>

          <View style={styles.statusPill}>
            <Text style={styles.statusText}>{member.status}</Text>
          </View>
        </View>
      ))}
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
  memberCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DDE9EE",
    padding: 16,
    marginBottom: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#DFF1F3",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#0F7D86",
    fontWeight: "800",
    fontSize: 18,
  },
  memberInfo: {
    flex: 1,
  },
  name: {
    color: "#163545",
    fontSize: 17,
    fontWeight: "700",
  },
  role: {
    marginTop: 4,
    color: "#6A7D8A",
    fontSize: 12,
  },
  statusPill: {
    backgroundColor: "#EDF7F4",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    color: "#1C7B60",
    fontSize: 11,
    fontWeight: "700",
  },
});
