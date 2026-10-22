import { View } from "react-native";

import { Avatar } from "../shared/Avatar";
import type { FlowStep } from "../shared/pickupFlow";
import { T, useColors, useTone } from "../shared/ui";

/**
 * Progress of a backup collector's pickup: Asked, Accepted, Travelling, At school, Teacher check, Collected.
 * One bar and one line of text, so it stays readable on a narrow phone. The current step is named in words.
 */
export function StepBar({ steps }: { steps: FlowStep[] }) {
  const tone = useTone();
  const c = useColors();
  const failed = steps.find((s) => s.state === "failed");
  const current = failed ?? steps.find((s) => s.state === "current") ?? steps[steps.length - 1];
  const index = steps.indexOf(current) + 1;
  const allDone = steps.every((s) => s.state === "done");
  const base = tone === "warn" ? "rgba(94,75,0,.18)" : "rgba(255,255,255,.2)";
  const on = tone === "warn" ? "rgba(94,75,0,.85)" : "#FFFFFF";
  const text = allDone ? "Collected. All steps done" : failed ? `Stopped at: ${failed.label}` : `Step ${index} of ${steps.length}: ${current.label}`;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Pickup progress. ${text}.`}
      accessibilityValue={{ min: 0, max: steps.length, now: allDone ? steps.length : index - 1 }}
      style={{ marginTop: 14, gap: 8 }}
    >
      <View style={{ flexDirection: "row", gap: 4 }}>
        {steps.map((s) => (
          <View
            key={s.label}
            style={{
              flex: 1, height: 6, borderRadius: 3,
              backgroundColor: s.state === "failed" ? c.danger : s.state === "done" || s.state === "current" ? on : base,
              opacity: s.state === "current" ? 0.6 : 1,
            }}
          />
        ))}
      </View>
      <T s={0.8} w={700} lh={1.3}>{text}</T>
    </View>
  );
}

/** Who is collecting: name, relationship and the photo on file (what the teacher compares). */
export function CollectorCard({ name, role, simulated, imageUri }: { name: string; role: string; simulated: boolean; imageUri?: string }) {
  const tone = useTone();
  return (
    <View
      accessible
      accessibilityLabel={`Collector: ${name}${role ? `, ${role}` : ""}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: tone === "warn" ? "rgba(94,75,0,.1)" : "rgba(255,255,255,.1)" }}
    >
      <Avatar name={name} size={52} imageUri={imageUri} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T s={0.7} w={600} ls={0.02} up lh={1.3} style={{ opacity: 0.8 }}>Collector</T>
        <T s={1.1} w={800} lh={1.25}>{name}</T>
        <T s={0.82} c="muted" lh={1.3}>{[role, imageUri ? "Approved photo" : simulated ? "Demo photo on file" : "No photo on file"].filter(Boolean).join(" · ")}</T>
      </View>
    </View>
  );
}
