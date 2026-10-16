import { useState } from "react";
import { Image, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar } from "./Avatar";
import { useAppContext } from "./AppContext";
import { mockData } from "./mockData";
import { Press, Rise, T } from "./ui";

const LOGO = require("../../../assets/images/logo.png");

export function ProfileSelection() {
  const { theme, selectCaregiver } = useAppContext();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  const [w, setW] = useState(0);
  const shadow = theme.isDark
    ? "0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.35)"
    : "0 1px 2px rgba(18,55,71,.06), 0 8px 24px rgba(18,55,71,.10)";
  const gap = 14;
  const cols = Math.max(1, Math.floor((w + gap) / 144));
  const iw = w ? (w - gap * (cols - 1)) / cols : 130;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          paddingTop: Math.max(28, insets.top + 16),
          paddingBottom: Math.max(28, insets.bottom + 16),
          paddingHorizontal: 16,
        }}
      >
        <Image source={LOGO} style={{ width: 72, height: 72, borderRadius: 36 }} accessibilityLabel="SafeNest" />
        <View accessibilityRole="header" style={{ marginTop: 14 }}>
          <T s={1.9} w={800} ls={-0.03} lh={1.15} align="center">Who’s using SafeNest?</T>
        </View>
        <View style={{ marginTop: 6 }}>
          <T c="muted" align="center">Choose a family profile to explore the pickup demo.</T>
        </View>

        <View style={{ width: "100%", flexGrow: 1, justifyContent: "center" }}>
          <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ width: "100%", flexDirection: "row", flexWrap: "wrap", gap, paddingVertical: 28 }}>
            {mockData.caregivers.map((caregiver, i) => (
              <Rise key={caregiver.id} i={i + 1} style={{ width: iw }}>
                <Press
                  onPress={() => selectCaregiver(caregiver)}
                  label={`Continue as ${caregiver.name}`}
                  scaleTo={0.96}
                  style={{ alignItems: "center", gap: 10, paddingVertical: 20, paddingHorizontal: 10, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: 24, boxShadow: shadow }}
                >
                  <Avatar name={caregiver.name} size={84} />
                  <T s={1.1} w={700}>{caregiver.name}</T>
                  <View style={{ marginTop: -8 }}><T c="muted">{caregiver.role}</T></View>
                </Press>
              </Rise>
            ))}
          </View>
        </View>

        <T s={0.88} lh={1.4} c="muted" align="center">Demo profile selection only. No account is created or authenticated.</T>
      </ScrollView>
    </View>
  );
}
