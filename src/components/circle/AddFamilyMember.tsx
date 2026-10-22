import { useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { useAuth } from "../shared/AuthContext";
import { useHousehold } from "../shared/HouseholdContext";
import { capabilities } from "../shared/accountRules";
import { FormField, ToggleRow } from "../shared/forms";
import { SecondaryButton } from "../shared/SecondaryButton";
import { Sheet } from "../shared/Sheet";
import { Banner, Btn, Err, Input, T } from "../shared/ui";
import { ShareCode } from "../household/ShareCode";
import { createInvitationLifecycle } from "./invitationLifecycle";

export function AddFamilyMember({ embedded = false, onDone }: { embedded?: boolean; onDone?: () => void }) {
  const { session, demo, familyId, profile, isAdmin } = useAuth();
  return <FamilyMemberForm embedded={embedded} onDone={onDone} key={`${session?.user.id ?? "demo"}:${familyId}:${demo}:${isAdmin}:${profile?.accountType}`} />;
}
function FamilyMemberForm({ embedded, onDone }: { embedded: boolean; onDone?: () => void }) {
  const { demo, profile, isAdmin } = useAuth();
  const household = useHousehold();
  const allowed = demo || capabilities(profile?.accountType ?? null, isAdmin).inviteFamily;
  const [open, setOpen] = useState(false);
  const [relationship, setRelationship] = useState("");
  const [canCollect, setCanCollect] = useState(false);
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(false);
  const lifecycle = useRef(createInvitationLifecycle());
  const clear = () => { setCode(""); setRelationship(""); setCanCollect(false); setPreview(false); setError(""); };
  const close = () => { lifecycle.current.change("inactive"); lifecycle.current.change(AppState.currentState); clear(); setOpen(false); onDone?.(); };
  useEffect(() => {
    mounted.current = true; lifecycle.current.mount(AppState.currentState);
    const listener = AppState.addEventListener("change", state => {
      lifecycle.current.change(state);
      if (state !== "active") { clear(); setOpen(false); }
    });
    return () => { mounted.current = false; lifecycle.current.dispose(); listener.remove(); };
  }, []);
  const submit = async () => {
    const ticket = lifecycle.current.ticket();
    if (locked.current || !allowed || !lifecycle.current.isCurrent(ticket)) return;
    if (demo) { setPreview(true); return; }
    locked.current = true; setBusy(true); setError("");
    try {
      const result = await household.familyInviteCode({ relationship: relationship.trim(), canCollect: embedded ? false : canCollect });
      if (!lifecycle.current.isCurrent(ticket)) return;
      if (result.ok) setCode(result.data);
      else setError(result.missing ? "Family invitations are unavailable on this server. A backend owner must verify the reviewed household invitation deployment. No member was added by this form." : "Unable to confirm the invitation. You must be a household administrator and guardian. Check your connection and existing household invitations before retrying.");
    } catch {
      if (lifecycle.current.isCurrent(ticket)) setError("Unable to confirm the invitation. Check existing household invitations before retrying.");
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const content = (
      <View style={{ gap: 12 }}>
        <T c="muted">Invite a person who has their own SafeNest account. Their name and contact details come from their profile after they accept; this does not add a person directly.</T>
        {demo ? <Banner>Demo preview only. No invitation, code or family membership is created.</Banner> : null}
        {code ? <ShareCode code={code} who={relationship.trim() || "your family member"} kind="family" /> : preview ? <Banner>Demo invitation preview: {relationship.trim() || "Family member"}. {canCollect ? "Can collect" : "Not authorized to collect"}. No account was changed.</Banner> : <>
          <FormField label="Relationship to your child" optional>
            <Input accessibilityLabel="Relationship to your child" placeholder="For example, aunt or grandparent" value={relationship} onChangeText={setRelationship} maxLength={40} editable={!busy} />
          </FormField>
          {busy ? <T>Creating invitation...</T> : <View pointerEvents={embedded ? "none" : "auto"} accessibilityState={{ disabled: embedded }}><ToggleRow first title="Also allow them to collect" sub={embedded ? "Collection permission is off in Add New Member. Manage it separately after the person joins." : "Off by default. Family membership does not automatically authorize collection."} on={embedded ? false : canCollect} onChange={setCanCollect} /></View>}
          <Err text={error} />
          <Btn disabled={busy || !allowed || (!demo && !household.familyId)} loading={busy} onPress={() => void submit()}>{demo ? "Preview demo invitation" : "Create family invitation"}</Btn>
        </>}
        <Btn kind="o" onPress={close}>Close</Btn>
      </View>
  );
  if (embedded) return content;
  return <>
    <SecondaryButton label="+ Add New Family Member" accessibilityLabel="Add New Family Member" disabled={!allowed} onPress={() => { clear(); setOpen(true); }} />
    {!allowed ? <T s={0.8} c="muted">A household administrator with a parent or guardian account can invite family members.</T> : null}
    <Sheet visible={open} onClose={close} title="Add Family Member" closeLabel="Close add family member form">{content}</Sheet>
  </>;
}
