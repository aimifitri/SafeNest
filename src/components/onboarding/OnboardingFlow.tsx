import { useState } from "react";
import { View } from "react-native";

import { AuthFrame } from "../auth/AuthFrame";
import { useAuth } from "../shared/AuthContext";
import { useHousehold } from "../shared/HouseholdContext";
import { RELATIONSHIPS } from "../shared/accountRules";
import { ChipChoice, FormField, StepProgress } from "../shared/forms";
import { Banner, Btn, Chip, Err, Input, T } from "../shared/ui";
import { ChildForm } from "../household/ChildForm";
import { HelperForm } from "../household/HelperForm";
import { JoinWithCode } from "../household/JoinWithCode";
import { ShareCode } from "../household/ShareCode";
import { AvailabilityEditor } from "../settings/AvailabilityEditor";
import { useOnboarding } from "./OnboardingContext";

const REL = RELATIONSHIPS.map((r) => ({ value: r, label: r }));
const PARENT_STEPS = ["Welcome", "Your household", "Your child", "Family", "Trusted Circle", "Availability"];
const HELPER_STEPS = ["Welcome", "Join a family", "Availability"];

/**
 * First-time setup. Every step saves to the account as it goes, every step after the first can be skipped, and closing
 * the app keeps your place. Nothing is created for you: a new account stays empty until you add people.
 */
export function OnboardingFlow() {
  const { profile } = useAuth();
  const { step, setStep, finish } = useOnboarding();
  const helper = profile?.accountType === "helper";
  const steps = helper ? HELPER_STEPS : PARENT_STEPS;
  const last = steps.length - 1;
  const at = Math.min(step, last);
  const next = () => (at >= last ? finish("done") : setStep(at + 1));
  const back = () => setStep(Math.max(0, at - 1));

  // A parent's welcome step has its own Continue (it saves the relationship first).
  const showNav = !(at === 0 && !helper);
  const nav = (
    <View style={{ gap: 10 }}>
      <Btn onPress={next} label={at >= last ? "Finish setup" : "Continue"}>{at >= last ? "Finish setup" : "Continue"}</Btn>
      <View style={{ flexDirection: "row", gap: 10 }}>
        {at > 0 ? <Btn kind="o" sm flex onPress={back} label="Back">Back</Btn> : null}
        <Btn kind="t" onPress={() => (at >= last ? finish("skipped") : next())} label={at === 0 ? "Skip setup for now" : "Skip this step"}>{at === 0 ? "Skip setup for now" : "Skip this step"}</Btn>
      </View>
    </View>
  );

  return (
    <AuthFrame title="Set up SafeNest" subtitle={helper ? "A few quick steps." : "Add your family at your own pace."}>
      <StepProgress step={at} total={steps.length} labels={steps} />
      {!helper && at === 0 ? <ParentWelcome onSaved={next} /> : null}
      {helper && at === 0 ? (
        <View style={{ gap: 12 }}>
          <T w={800} s={1.1}>Welcome, {profile?.fullName?.split(" ")[0] || "there"}</T>
          <T c="muted" lh={1.45}>You will help with pickups when a parent asks you. Join their Trusted Circle with the code they send you, then say when you are free.</T>
          <Chip kind="plain">No children or family members are added for you.</Chip>
        </View>
      ) : null}
      {!helper && at === 1 ? <HouseholdStep /> : null}
      {!helper && at === 2 ? <ChildStep onDone={next} /> : null}
      {!helper && at === 3 ? <FamilyStep /> : null}
      {!helper && at === 4 ? <CircleStep /> : null}
      {((!helper && at === 5) || (helper && at === 2)) ? (
        <View style={{ gap: 12 }}>
          <T c="muted" lh={1.45}>Pick the days and hours SafeNest may ask you to help. You can change this any time in Settings.</T>
          <AvailabilityEditor />
        </View>
      ) : null}
      {helper && at === 1 ? (
        <View style={{ gap: 12 }}>
          <T c="muted" lh={1.45}>Ask the parent for a code. You can also skip this and join later in Settings.</T>
          <JoinWithCode onJoined={() => void 0} />
        </View>
      ) : null}
      {showNav ? nav : null}
    </AuthFrame>
  );
}

// Step 0 for a parent has its own Continue so the relationship is saved first.
function ParentWelcome({ onSaved }: { onSaved: () => void }) {
  const { profile, updateProfile } = useAuth();
  const { finish } = useOnboarding();
  const [rel, setRel] = useState(profile?.relationship ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    if (busy || !profile) return;
    setBusy(true);
    setErr("");
    if (rel && rel !== profile.relationship) {
      const r = await updateProfile({ fullName: profile.fullName, phone: profile.phone, dateOfBirth: profile.dateOfBirth, gender: profile.gender, language: profile.language, relationship: rel });
      if (!r.ok) {
        setBusy(false);
        setErr(r.error);
        return;
      }
    }
    setBusy(false);
    onSaved();
  };
  return (
    <View style={{ gap: 14 }}>
      <T w={800} s={1.1}>Welcome, {profile?.fullName?.split(" ")[0] || "there"}</T>
      <T c="muted" lh={1.45}>Your account starts empty. You add your child, your family and your Trusted Circle yourself, and nobody can collect your child until you approve them.</T>
      <FormField label="How are you related to your child?" optional>
        <ChipChoice label="Relationship to your child" options={REL} value={(rel || null) as (typeof RELATIONSHIPS)[number] | null} onChange={setRel} />
      </FormField>
      <Err text={err} />
      <Btn onPress={() => void save()} loading={busy} label="Continue">Continue</Btn>
      <Btn kind="t" onPress={() => finish("skipped")} label="Skip setup for now">Skip setup for now</Btn>
    </View>
  );
}

function HouseholdStep() {
  const h = useHousehold();
  const [name, setName] = useState(h.familyName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const save = async () => {
    if (busy) return;
    setBusy(true);
    setErr("");
    const r = await h.renameFamily(name);
    setBusy(false);
    if (r.ok) setMsg("Saved.");
    else setErr(r.error);
  };
  return (
    <View style={{ gap: 14 }}>
      <T c="muted" lh={1.45}>Your household was created when you signed up. Give it a name your family will recognise.</T>
      <FormField label="Household name">
        <Input value={name} onChangeText={setName} autoCapitalize="words" accessibilityLabel="Household name" />
      </FormField>
      <Err text={err} />
      {msg ? <Banner kind="ok">{msg}</Banner> : null}
      <Btn kind="s" onPress={() => void save()} loading={busy} label="Save household name">Save name</Btn>
    </View>
  );
}

function ChildStep({ onDone }: { onDone: () => void }) {
  const h = useHousehold();
  if (h.child) {
    return (
      <View style={{ gap: 12 }}>
        <Banner kind="ok">{h.child.name} is added{h.child.schoolName ? ` at ${h.child.schoolName}` : ""}.</Banner>
        <T s={0.86} c="muted">You can edit or add more children later in Settings.</T>
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      <T c="muted" lh={1.45}>Add your child so SafeNest can plan school pickups. You can skip this and do it later.</T>
      <ChildForm
        submitLabel="Save child and continue"
        onSubmit={async (d) => {
          const r = await h.addChild(d);
          if (!r.ok) return r.error;
          onDone();
          return null;
        }}
      />
    </View>
  );
}

function FamilyStep() {
  const h = useHousehold();
  const [rel, setRel] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const make = async () => {
    if (busy) return;
    setBusy(true);
    setMsg("");
    const r = await h.familyInviteCode({ relationship: rel, canCollect: false });
    setBusy(false);
    if (r.ok) setCode(r.data);
    else setMsg(r.missing ? "Family invitations need the backend upgrade (supabase/account_household.sql). You can still add people to your Trusted Circle on the next step." : r.error);
  };
  return (
    <View style={{ gap: 14 }}>
      <T c="muted" lh={1.45}>Another parent or guardian can join your household with a code. Joining does not let them collect your child. You decide that separately.</T>
      <FormField label="Their relationship to your child" optional>
        <ChipChoice label="Their relationship to your child" options={REL} value={(rel || null) as (typeof RELATIONSHIPS)[number] | null} onChange={setRel} />
      </FormField>
      <Err text={msg} />
      {code ? <ShareCode code={code} who={rel || "your family member"} kind="family" /> : <Btn kind="s" icon="userplus" onPress={() => void make()} loading={busy} label="Create invite code">Create invite code</Btn>}
    </View>
  );
}

function CircleStep() {
  const h = useHousehold();
  const [added, setAdded] = useState<{ id: string; name: string } | null>(null);
  const [approved, setApproved] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  if (added) {
    return (
      <View style={{ gap: 12 }}>
        <Banner kind="ok">{added.name} is waiting for your approval.</Banner>
        {!approved ? (
          <>
            <T c="muted" lh={1.45}>Approving lets SafeNest ask {added.name} to collect {h.child?.name ?? "your child"}. The teacher still checks who arrives.</T>
            <Btn onPress={async () => { const r = await h.setHelperState(added.id, "active"); if (r.ok) setApproved(true); else setErr(r.error); }} label={`Approve ${added.name}`}>Approve {added.name}</Btn>
          </>
        ) : (
          <Chip kind="ok" icon="check">{added.name} is approved</Chip>
        )}
        <Err text={err} />
        {code ? (
          <ShareCode code={code} who={added.name} kind="helper" />
        ) : (
          <Btn kind="s" onPress={async () => { const r = await h.helperInviteCode(added.id); if (r.ok) setCode(r.data); else setErr(r.error); }} label={`Create a join code for ${added.name}`}>Create a join code for {added.name}</Btn>
        )}
        <T s={0.82} c="muted" lh={1.4}>{added.name} cannot answer requests until they create an account and enter the code.</T>
        <Btn kind="o" sm onPress={() => { setAdded(null); setApproved(false); setCode(""); setErr(""); }} label="Add another person">Add another person</Btn>
      </View>
    );
  }
  return (
    <View style={{ gap: 12 }}>
      <T c="muted" lh={1.45}>The Trusted Circle is the short list of adults who may collect your child if you cannot. You can build it later.</T>
      <HelperForm
        onSubmit={async (d) => {
          const r = await h.addHelper(d);
          if (!r.ok) return r.error;
          setAdded({ id: r.data, name: d.name.trim() });
          return null;
        }}
      />
    </View>
  );
}

