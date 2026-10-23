import { useState } from "react";
import { View } from "react-native";

import { Btn, T } from "../shared/ui";
import { useSoundEffects } from "../shared/SoundEffects";

export type JourneyStep = "none" | "started" | "at_school";

// The collector's buttons: start, arrived at school, confirm handover. Used for a parent
// collecting themselves (Today) and for a helper (their request card).
// The handover needs a second tap so a slip does not close the journey.
export function JourneySteps({
  childName,
  step,
  busy,
  startLabel,
  onStart,
  onArrived,
  onHandover,
  onCancel,
}: {
  childName: string;
  step: JourneyStep;
  busy: boolean;
  startLabel: string;
  onStart: () => void;
  onArrived: () => void;
  onHandover: () => void;
  onCancel: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { playPickupChime } = useSoundEffects();

  if (step === "none") {
    return (
      <Btn kind="p" loading={busy} disabled={busy} onPress={() => { playPickupChime(); onStart(); }}>
        {startLabel}
      </Btn>
    );
  }

  if (step === "started") {
    return (
      <View style={{ gap: 10 }}>
        <Btn kind="p" loading={busy} disabled={busy} onPress={() => { playPickupChime(); onArrived(); }}>
          I've arrived at school
        </Btn>
        <Btn kind="o" disabled={busy} onPress={onCancel}>
          Cancel journey
        </Btn>
      </View>
    );
  }

  if (!confirming) {
    return (
      <View style={{ gap: 10 }}>
        <Btn kind="p" disabled={busy} onPress={() => setConfirming(true)}>
          I've picked up {childName}
        </Btn>
        <Btn kind="o" disabled={busy} onPress={onCancel}>
          Cancel journey
        </Btn>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <T s={0.9} lh={1.4} c="muted">
        This records that {childName} is with you and ends the journey. The school does not verify it.
      </T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Btn kind="p" flex loading={busy} disabled={busy} onPress={() => { playPickupChime(); onHandover(); }}>
          Yes, confirm
        </Btn>
        <Btn kind="o" flex disabled={busy} onPress={() => setConfirming(false)}>
          Not yet
        </Btn>
      </View>
    </View>
  );
}
