import { useRef, useState } from "react";
import { View } from "react-native";

import { RealCircleInvitations } from "../circle/RealCircleInvitations";
import { useAuth } from "../shared/AuthContext";
import { useHousehold } from "../shared/HouseholdContext";
import { FormField } from "../shared/forms";
import { acceptFamilyInvite } from "../shared/householdApi";
import { Banner, Btn, Err, Input, T } from "../shared/ui";

/**
 * Enter the code a parent shared. A Trusted Circle code links this account to the helper entry the parent created
 * (existing accept_helper_invite). A family code adds this account to the household (needs account_household.sql).
 * Nothing is joined until the database accepts the code.
 */
export function JoinWithCode({ onJoined }: { onJoined?: () => void }) {
  const { retryAccount, demo } = useAuth();
  const household = useHousehold();
  const [kind, setKind] = useState<"circle" | "family">("circle");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const lock = useRef(false);

  if (demo) return <T c="muted">Demo Mode does not use invite codes.</T>;

  const join = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setDone("");
    try {
      const asFamily = await acceptFamilyInvite(code);
      if (asFamily.ok) {
        setDone("You joined the household.");
        setCode("");
        retryAccount();
        onJoined?.();
        return;
      }
      // Prefer the helper error unless the family function exists and gave a more useful answer.
      setError(asFamily.error);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <Btn kind="o" disabled={busy} onPress={() => { setCode(""); setError(""); setDone(""); setKind(kind === "circle" ? "family" : "circle"); }}>{kind === "circle" ? "Use a household membership code instead" : "Use a Trusted Circle invitation instead"}</Btn>
      {kind === "circle" ? <RealCircleInvitations /> : <>
      <Banner>Household membership is separate from being a pending or approved Trusted Circle helper.</Banner>
      <FormField label="Invite code" hint="Paste the whole code your family member sent you.">
        <Input value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} placeholder="Paste code" accessibilityLabel="Invite code" returnKeyType="done" onSubmitEditing={() => void join()} />
      </FormField>
      <Err text={error} />
      {done ? <Banner kind="ok">{done}</Banner> : null}
      <Btn onPress={() => void join()} loading={busy} disabled={code.trim().length < 16} label="Join with code">Join</Btn>
      </>}
    </View>
  );
}
