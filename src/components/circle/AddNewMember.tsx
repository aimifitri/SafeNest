import type { Dispatch } from "react";
import { useState } from "react";
import { View } from "react-native";
import { HelperForm } from "../household/HelperForm";
import { useAuth } from "../shared/AuthContext";
import { useHousehold } from "../shared/HouseholdContext";
import { SecondaryButton } from "../shared/SecondaryButton";
import { Sheet } from "../shared/Sheet";
import { Banner, Btn, Seg, T } from "../shared/ui";
import { ToggleRow } from "../shared/forms";
import { AddFamilyMember } from "./AddFamilyMember";
import { RealCircleInvitations } from "./RealCircleInvitations";
import { InvitationSheet } from "./InvitationSheet";
import { JoinedCircles } from "./JoinedCircles";
import { canManageDemoInvitations, DEMO_PERSONAS, type CircleDemoState, type CircleDemoAction, type DemoActor } from "./circleDemo";
import { inviteEntry, manualDemoMember, type AddMemberStep } from "./circleMembers";
export type DemoModel = { state: CircleDemoState; dispatch: Dispatch<CircleDemoAction> };
export function DemoMemberships({ model, invitation = false }: { model: DemoModel; invitation?: boolean }) {
  const [personaId, setPersonaId] = useState<DemoActor["id"]>("abu");
  const actor = DEMO_PERSONAS.find(person => person.id === personaId) ?? DEMO_PERSONAS[0];
  return <View style={{ gap: 12 }}>
    <Banner>Abu/Siti simulation only. No account memberships or pickup permissions change.</Banner>
    <Seg<DemoActor["id"]> cur={personaId} onPick={setPersonaId} opts={DEMO_PERSONAS.map(person => ({ value: person.id, label: person.name, a11y: `Fictional persona ${person.name}` }))} />
    {invitation && canManageDemoInvitations(actor) ? <InvitationSheet embedded visible onClose={() => {}} actor={actor} state={model.state} onGenerate={() => model.dispatch({ type: "generate", actor })} onAccept={() => model.dispatch({ type: "accept", actor })} onApprove={() => model.dispatch({ type: "approve", actor })} /> : invitation ? <T c="muted">Select Abu to generate and simulate acceptance and administrator approval. Select Siti to inspect the resulting membership below.</T> : null}
    <JoinedCircles personaName={actor.name} memberships={model.state.memberships.filter(member => member.userId === actor.id)} onLeave={membershipId => model.dispatch({ type: "leave", userId: actor.id, membershipId })} />
  </View>;
}
export function AddNewMember({ model }: { model: DemoModel }) {
  const { demo, session, familyId } = useAuth();
  return <MemberSheet key={`${session?.user.id ?? "demo"}:${familyId}:${demo}`} model={model} />;
}
function MemberSheet({ model }: { model: DemoModel }) {
  const { demo } = useAuth();
  const household = useHousehold();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<AddMemberStep>("choose");
  return <>
    <SecondaryButton label="+ Add New Member" onPress={() => { setStep("choose"); setOpen(true); }} />
    <Sheet visible={open} onClose={() => setOpen(false)} title="Add New Member" closeLabel="Close Add New Member">
      {open ? <View style={{ gap: 12 }}>
        {step === "choose" ? <>
          <Btn kind="s" onPress={() => setStep("manual")}>Add Manually</Btn>
          <Btn kind="s" onPress={() => setStep("invite")}>Invite via Link</Btn>
          <T c="muted">Invitations use a code, not an app link. The recipient must accept; approval is separate.</T>
        </> : <Btn kind="o" onPress={() => setStep("choose")}>Back to options</Btn>}
        {step === "manual" ? <>
          <Banner>{demo ? "Demo only: a simulated member will appear under Family or Trusted Helpers. They start pending and are not approved to collect." : "Secure manual contact creation is unavailable for real accounts. Use Invite via Link to create a pending invitation instead. No direct database writes are performed."}</Banner>
          <View pointerEvents="none" accessibilityState={{ disabled: true }}><ToggleRow first title="Pickup authorization" sub="Off. Adding a contact never grants collection permission." on={false} onChange={() => {}} /></View>
          <HelperForm submissionDisabled={!demo} submitLabel={demo ? "Add simulated member" : "Manual creation unavailable"} onSubmit={async draft => {
            if (!demo) return "Use secure invitations for real accounts.";
            const member = manualDemoMember(draft, "preview");
            const result = await household.addHelper({ name: member.name, relationship: member.role, phone: member.phone, isAdult: draft.isAdult });
            if (!result.ok) return result.error;
            setOpen(false); return null;
          }} />
        </> : null}
        {step === "invite" ? inviteEntry(demo) === "demo" ? <DemoMemberships model={model} invitation /> : <>
          <Banner>This creates a pending Trusted Circle invitation, including for relatives. A code does not authorize pickup. The administrator must verify and approve the accepting person.</Banner>
          <RealCircleInvitations purpose="invite" />
          <Btn kind="o" onPress={() => setStep("family")}>Invite into the household instead</Btn>
        </> : null}
        {step === "family" ? <>
          <Banner>Household membership is separate from Trusted Circle approval. Collection permission stays off in this form.</Banner>
          <AddFamilyMember embedded onDone={() => setStep("invite")} />
        </> : null}
      </View> : null}
    </Sheet>
  </>;
}
