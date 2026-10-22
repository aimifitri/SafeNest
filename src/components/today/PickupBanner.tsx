import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "react-native-reanimated";

import { Icon } from "../navigation/Icon";
import { anim } from "../shared/motion";
import type { PickupPhase } from "../shared/pickupFlow";
import Animated from "react-native-reanimated";
import { Press, T, useColors } from "../shared/ui";

// The in-app notification from the prototype ("{child} has been picked up by {name}"). It is a banner inside the app.
// It is NOT a push notification: nothing is sent to anyone's lock screen. It says so.

type Note = { id: number; kind: "ok" | "info" | "bad"; title: string; sub: string };
const SHOW_MS = 7000;

/** Watches the pickup phase and raises one banner when something the parent cares about happens. */
export function usePickupBanner(args: { phase: PickupPhase; collector: string; childName: string; simulated: boolean; whenLabel: string }) {
  const { phase, collector, childName, simulated, whenLabel } = args;
  const [note, setNote] = useState<Note | null>(null);
  const prev = useRef<PickupPhase | null>(null);
  const id = useRef(0);

  useEffect(() => {
    const before = prev.current;
    prev.current = phase;
    if (before === null || before === phase) return; // nothing on first render, nothing for the same phase
    const tail = simulated ? "Demo notification. Shown in the app only. No push notification was sent." : "Shown in the app. Push notifications are not set up yet.";
    let next: Omit<Note, "id"> | null = null;
    if (phase === "collected" && before !== "will_collect") {
      next = { kind: "ok", title: `${childName} has been picked up by ${collector}.`, sub: `${whenLabel}. ${tail}` };
    } else if (phase === "helper_assigned") {
      next = { kind: "info", title: `${collector} will collect ${childName}.`, sub: tail };
    }
    if (next) setNote({ id: ++id.current, ...next });
    else if (phase === "late" || phase === "on_time" || phase === "asking") setNote(null);
  }, [phase, collector, childName, simulated, whenLabel]);

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote((n) => (n && n.id === note.id ? null : n)), SHOW_MS);
    return () => clearTimeout(t);
  }, [note]);

  return { note, dismiss: () => setNote(null) };
}

export function PickupBanner({ note, onDismiss }: { note: Note | null; onDismiss: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  if (!note) return null;
  const bg = note.kind === "ok" ? c.successSoft : note.kind === "bad" ? c.dangerSoft : c.card;
  const fg = note.kind === "ok" ? c.success : note.kind === "bad" ? c.danger : c.primaryInk;
  return (
    <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, bottom: 84 + insets.bottom, zIndex: 50 }}>
      <Animated.View
        key={note.id}
        accessibilityRole={note.kind === "bad" ? "alert" : "none"}
        accessibilityLiveRegion={note.kind === "bad" ? "assertive" : "polite"}
        style={[
          { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 16, backgroundColor: bg, borderWidth: 1, borderColor: fg, boxShadow: "0 8px 28px rgba(18,55,71,.22)" },
          anim("swap", { ms: 380 }, reduce),
        ]}
      >
        <View style={{ marginTop: 2 }}><Icon name={note.kind === "bad" ? "bell" : "check"} size={18} color={fg} stroke={2.4} /></View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <T s={0.98} w={800} c={fg} lh={1.3}>{note.title}</T>
          <T s={0.8} c={fg} lh={1.35} style={{ opacity: 0.85 }}>{note.sub}</T>
        </View>
        <Press onPress={onDismiss} label="Dismiss notification" style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: -10, marginRight: -10 }}>
          <Icon name="x" size={16} color={fg} stroke={2.2} />
        </Press>
      </Animated.View>
    </View>
  );
}
