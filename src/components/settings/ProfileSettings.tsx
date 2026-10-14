import { AppShell } from "../shared/AppShell";
import { StyleSheet, Text, View } from "react-native";

const settings = [
  "Notifications",
  "Privacy",
  "Pickup preferences",
  "Custom alerts",
];

export function ProfileSettings() {
  return (
    <AppShell title="Profile" badge="Me" activeTab="settings">
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>L</Text>
        </View>

        <View>
          <Text style={styles.name}>Leena</Text>
          <Text style={styles.subtext}>Primary caregiver</Text>
        </View>
      </View>

      {settings.map((item) => (
        <View key={item} style={styles.settingRow}>
          <Text style={styles.settingText}>{item}</Text>
          <Text style={styles.chevron}>{">"}</Text>
        </View>
      ))}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DDEAF0",
    padding: 18,
    marginTop: 16,
    marginBottom: 20,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#EAF7F5",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#0F7D86",
    fontSize: 22,
    fontWeight: "800",
  },
  name: {
    color: "#163545",
    fontSize: 20,
    fontWeight: "800",
  },
  subtext: {
    color: "#607684",
    fontSize: 13,
    marginTop: 4,
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E3EBF1",
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 10,
  },
  settingText: {
    color: "#163545",
    fontSize: 15,
    fontWeight: "600",
  },
  chevron: {
    color: "#7C8E97",
    fontSize: 18,
    fontWeight: "700",
  },
});
