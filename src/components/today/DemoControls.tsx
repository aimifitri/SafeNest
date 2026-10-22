// Prototype "Demo" panel (frontend only) and the full-screen map. Both are clearly simulated.
import type { ReactNode } from "react";
import { View } from "react-native";

import { Icon } from "../navigation/Icon";
import { useAppContext } from "../shared/AppContext";
import { MapView } from "../shared/MapView";
import type { MapDot } from "../shared/MapView";
import { Sheet } from "../shared/Sheet";
import { askAt, clock } from "../shared/circleEngine";
import { dismissMinutes, sim } from "../shared/demoSim";
import type { LocationMode } from "../shared/demoSim";
import { Banner, Btn, LRow, Press, Seg, T, useColors } from "../shared/ui";
import type { usePickupFlow } from "./usePickupFlow";
import { Card } from "../shared/Card";
import { Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type PF = ReturnType<typeof usePickupFlow>;

/** Label, value and two buttons. Used for the demo clock, the dismissal time and the travel delay. */
function Stepper({ label, value, onMinus, onPlus, minusLabel, plusLabel, minus = "-5", plus = "+5" }: { label: string; value: string; onMinus: () => void; onPlus: () => void; minusLabel: string; plusLabel: string; minus?: string; plus?: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 56, paddingVertical: 6, paddingHorizontal: 12, borderTopWidth: 1, borderTopColor: c.line }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <T s={0.82} c="muted" lh={1.3}>{label}</T>
        <T w={800} tab>{value}</T>
      </View>
      <Btn kind="o" sm onPress={onMinus} label={minusLabel}>{minus}</Btn>
      <Btn kind="o" sm onPress={onPlus} label={plusLabel}>{plus}</Btn>
    </View>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <T s={0.82} w={700} up ls={0.04} c="muted">{title}</T>
      {children}
    </View>
  );
}

export function DemoSheet({ visible, onClose, pf }: { visible: boolean; onClose: () => void; pf: PF }) {
  const { theme } = useAppContext();
  const c = theme.colors;
  const s = pf.demo.state;
  const env = pf.env;
  const dismiss = dismissMinutes(s, env);
  const deadline = askAt(dismiss, s.escalation);
  const round = s.engine.stage === "circle";
  const waiting = Object.entries(s.engine.replies).filter(([, r]) => r === "wait").map(([id]) => env.people.find((p) => p.id === id)).filter(Boolean);
  const Seg3 = Seg;
  const cancellable = !["plan", "committed", "collected"].includes(s.engine.stage);

  return (
    <Sheet visible={visible} onClose={onClose} title="Demo controls" closeLabel="Close demo controls">
      <Banner>Prototype only. A demo clock, a made-up location and made-up answers. Nothing is tracked and nobody is contacted.</Banner>

      {pf.realMode ? (
        <Group title="What Today shows">
          <Seg3<"real" | "demo">
            opts={[{ value: "real", label: "Real", a11y: "Show the real pickup" }, { value: "demo", label: "Demo", a11y: "Preview the demo" }]}
            cur={s.forced ? "demo" : "real"}
            onPick={(v) => sim.setForced(v === "demo")}
          />
        </Group>
      ) : null}

      <Group title="Quick setups">
        <Card tight style={{ paddingHorizontal: 4 }}>
          {PRESETS.map((p, i) => (
            <LRow key={p.key} first={i === 0} on={false} a11y={`Set up: ${p.label}`} onPress={() => sim.preset(p.key, env)}>
              <T w={700}>{p.label}</T>
              <T s={0.84} c="muted" lh={1.35}>{p.detail}</T>
            </LRow>
          ))}
        </Card>
      </Group>

      <Group title="Time">
        <Card tight style={{ paddingHorizontal: 0 }}>
          <View style={{ padding: 12, gap: 2 }}>
            <T s={0.82} c="muted">Demo clock</T>
            <T s={1.8} w={800} tab ls={-0.02}>{clock(s.now)}</T>
            <T s={0.84} c="muted" lh={1.35}>Automatic backup starts at {clock(deadline)} if you have not answered.</T>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
            <Btn kind="o" sm onPress={() => sim.advance(5, env)}>+5 min</Btn>
            <Btn kind="o" sm onPress={() => sim.advance(15, env)}>+15 min</Btn>
            <Btn kind="s" sm onPress={() => sim.setNow(deadline, env)} label={`Jump to ${clock(deadline)}`}>Jump to {clock(deadline)}</Btn>
          </View>
          <Stepper label="Now" value={clock(s.now)} minusLabel="Move the clock back 5 minutes" plusLabel="Move the clock forward 5 minutes" onMinus={() => sim.advance(-5, env)} onPlus={() => sim.advance(5, env)} />
          <Stepper label={s.dismissOverride === null ? "School ends (Pickup Plan time)" : "School ends (demo time)"} value={clock(dismiss)} minusLabel="School ends 5 minutes earlier" plusLabel="School ends 5 minutes later" onMinus={() => sim.setDismiss(dismiss - 5, env)} onPlus={() => sim.setDismiss(dismiss + 5, env)} />
          {s.dismissOverride !== null ? <View style={{ padding: 12 }}><Btn kind="o" sm onPress={() => sim.setDismiss(null, env)}>Use the Pickup Plan time</Btn></View> : null}
        </Card>
      </Group>

      <Group title="Where the parent is">
        <Seg3<"office" | "road" | "school">
          opts={[{ value: "office", label: "At work", a11y: "Parent is at work" }, { value: "road", label: "On the way", a11y: "Parent is on the way" }, { value: "school", label: "At school", a11y: "Parent is at school" }]}
          cur={s.place}
          onPick={(v) => sim.setPlace(v, env)}
        />
        <Card tight style={{ paddingHorizontal: 0 }}>
          <Stepper label="Travel delay (traffic)" value={`${s.delay} min`} minusLabel="Less delay" plusLabel="More delay" onMinus={() => sim.setDelay(s.delay - 5, env)} onPlus={() => sim.setDelay(s.delay + 5, env)} />
        </Card>
        <Seg3<LocationMode>
          opts={[
            { value: "granted", label: "Location works", a11y: "Location works" },
            { value: "denied", label: "Permission denied", a11y: "Location permission denied" },
            { value: "no_gps", label: "No GPS", a11y: "Phone cannot find its location" },
            { value: "offline", label: "Offline", a11y: "Route service unreachable" },
          ]}
          cur={s.location}
          onPick={(v) => sim.setLocation(v, env)}
        />
      </Group>

      <Group title="Automatic backup">
        <Seg3<"on" | "off">
          opts={[{ value: "on", label: "On", a11y: "Automatic backup on" }, { value: "off", label: "Off", a11y: "Automatic backup off" }]}
          cur={s.escalation.enabled ? "on" : "off"}
          onPick={(v) => sim.setEscalation({ enabled: v === "on" }, env)}
        />
        <Card tight style={{ paddingHorizontal: 0 }}>
          <Stepper label="Ask this long before school ends" value={`${s.escalation.minutesBefore} min`} minusLabel="Ask later" plusLabel="Ask earlier" minus="-1" plus="+1" onMinus={() => sim.setEscalation({ minutesBefore: Math.max(0, s.escalation.minutesBefore - 1) }, env)} onPlus={() => sim.setEscalation({ minutesBefore: Math.min(60, s.escalation.minutesBefore + 1) }, env)} />
        </Card>
      </Group>

      <Group title="How the circle answers">
        <Seg3<"yes" | "nobody">
          opts={[{ value: "yes", label: "Someone says yes", a11y: "Someone says yes" }, { value: "nobody", label: "Nobody can", a11y: "Nobody can" }]}
          cur={s.nobody ? "nobody" : "yes"}
          onPick={(v) => sim.setNobody(v === "nobody")}
        />
        <Seg3<"auto" | "manual">
          opts={[{ value: "auto", label: "Answers arrive by themselves", a11y: "Answers arrive by themselves" }, { value: "manual", label: "I answer for them", a11y: "I answer for each person" }]}
          cur={s.autoReplies ? "auto" : "manual"}
          onPick={(v) => sim.setAutoReplies(v === "auto")}
        />
        {round && !s.autoReplies && waiting.length > 0 ? (
          <Card tight style={{ paddingHorizontal: 0 }}>
            {waiting.map((p, i) => p ? (
              <View key={p.id} style={{ gap: 8, padding: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line }}>
                <T w={700}>{p.name}</T>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <Btn kind="p" sm onPress={() => pf.demo.answer(p.id, "yes")}>Accepts</Btn>
                  <Btn kind="o" sm onPress={() => pf.demo.answer(p.id, "no")}>Declines</Btn>
                  <Btn kind="o" sm onPress={() => pf.demo.answer(p.id, "none")}>No response</Btn>
                </View>
              </View>
            ) : null)}
          </Card>
        ) : null}
      </Group>

      <Group title="Cancel and reset">
        <T s={0.84} c="muted" lh={1.4}>The travel, arrival and teacher buttons sit on the Today card at the step they belong to. Resetting lives here only.</T>
        {cancellable ? <Btn kind="o" onPress={() => { void pf.run("cancel_round"); }}>Cancel and start over</Btn> : null}
        <Btn kind="o" onPress={() => sim.reset(env)}>Restart demo</Btn>
      </Group>
      <T s={0.82} c="muted" align="center" lh={1.4}>Today and Pickup Plan use the same demo state. Circle only manages who can help.</T>
    </Sheet>
  );
}

const PRESETS = [
  { key: "late", label: "Late, no answer (the 12:30 example)", detail: "Now 12:30. School ends 1:00. You would arrive 1:10." },
  { key: "ontime", label: "On time", detail: "You arrive well before school ends." },
  { key: "nobody", label: "Late, nobody can help", detail: "Everyone declines or does not answer." },
  { key: "no_gps", label: "Phone cannot find its location", detail: "SafeNest cannot tell if you are late." },
  { key: "denied", label: "Location permission denied", detail: "SafeNest cannot tell if you are late." },
  { key: "auto_off", label: "Automatic backup is off", detail: "Late, but SafeNest only alerts you." },
] as const;

export function FullMap({ visible, onClose, dots, trail }: { visible: boolean; onClose: () => void; dots: MapDot[]; trail: boolean }) {
  const { theme } = useAppContext();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  const topBar = Math.max(14, insets.top + 8) + 48 + 10;
  const bottomBar = Math.max(16, insets.bottom + 8) + 56;
  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={["portrait", "landscape"]}>
      <View style={{ flex: 1, backgroundColor: c.map }}>
        {/* The artwork fills the whole screen; the whole scene is framed between the top bar and the disclaimer. */}
        <MapView
          dots={dots}
          trail={trail}
          fit="contain"
          inset={{ top: topBar, bottom: bottomBar }}
          label="Full screen illustrated map with the school and family members. Locations are simulated."
        />
        <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, top: Math.max(14, insets.top + 8), flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ backgroundColor: c.card, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: c.line }}>
            <T s={0.9} w={700}>Full map</T>
          </View>
          <Press onPress={onClose} label="Close full screen map" style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, alignItems: "center", justifyContent: "center" }}>
            <Icon name="x" size={20} color={c.primaryInk} stroke={2.4} />
          </Press>
        </View>
        <View pointerEvents="none" style={{ position: "absolute", left: 16, right: 16, bottom: Math.max(16, insets.bottom + 8), alignItems: "center" }}>
          <View style={{ backgroundColor: c.card, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: c.line, maxWidth: "100%" }}>
            <T s={0.82} w={600} c="muted" align="center" lh={1.35}>Simulated map. Locations and route are not real.</T>
          </View>
        </View>
      </View>
    </Modal>
  );
}
