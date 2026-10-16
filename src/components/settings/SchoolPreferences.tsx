import { useState } from "react";
import { View } from "react-native";

import { Card } from "../shared/Card";
import { SectionHeading } from "../shared/SectionHeading";
import { mockData } from "../shared/mockData";
import { Press, SIc, Switch, T, useColors } from "../shared/ui";

const preferenceOptions = [
  {
    key: "pickup",
    label: "Pickup alerts",
    description: "A reminder before school pickup time.",
    icon: "bell",
  },
  {
    key: "gate",
    label: "Gate status",
    description: `When ${mockData.child.name} is released for pickup.`,
    icon: "school",
  },
  {
    key: "delay",
    label: "Delay alerts",
    description: "When a pickup arrival time changes.",
    icon: "clock",
  },
] as const;

type PreferenceKey = (typeof preferenceOptions)[number]["key"];
type Preferences = Record<PreferenceKey, boolean>;

export function SchoolPreferences() {
  const c = useColors();
  const [preferences, setPreferences] = useState<Preferences>({
    pickup: true,
    gate: true,
    delay: true,
  });

  function togglePreference(key: PreferenceKey) {
    setPreferences((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <>
      <SectionHeading title="Notifications" />
      <Card tight>
        {preferenceOptions.map((option, index) => {
          const enabled = preferences[option.key];

          return (
            <Press
              key={option.key}
              role="switch"
              label={option.label}
              hint={option.description}
              state={{ checked: enabled }}
              scaleTo={0.985}
              onPress={() => togglePreference(option.key)}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, padding: 10, borderTopWidth: index > 0 ? 1 : 0, borderTopColor: c.line }}
            >
              <SIc name={option.icon} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T w={700}>{option.label}</T>
                <T s={0.84} c="muted" lh={1.35}>{option.description}</T>
              </View>
              <Switch on={enabled} />
            </Press>
          );
        })}
        <View style={{ paddingHorizontal: 10, paddingBottom: 10 }}>
          <T s={0.78} lh={1.4} c="muted">Simulated. No notifications are sent.</T>
        </View>
      </Card>
    </>
  );
}
