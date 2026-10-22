import { useState } from "react";
import { Linking, View } from "react-native";

import { useAuth } from "../shared/AuthContext";
import { useHousehold } from "../shared/HouseholdContext";
import { Avatar } from "../shared/Avatar";
import { Card } from "../shared/Card";
import { SectionHeading } from "../shared/SectionHeading";
import { Sheet } from "../shared/Sheet";
import { RELATIONSHIPS, capabilities } from "../shared/accountRules";
import { ChipChoice, EmptyState, FormField, ToggleRow } from "../shared/forms";
import type { HChild } from "../shared/householdApi";
import { Banner, Btn, Chip, Dl, Err, Input, SmallBtn, T, useColors } from "../shared/ui";
import { ChildForm, draftFromChild } from "../household/ChildForm";
import { JoinWithCode } from "../household/JoinWithCode";
import { ShareCode } from "../household/ShareCode";

const REL = RELATIONSHIPS.map((r) => ({ value: r, label: r }));

async function openWhatsApp(phone: string): Promise<string | null> {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("00") ? digits.slice(2) : digits.startsWith("0") ? `60${digits.slice(1)}` : digits;
  if (intl.length < 9) return "Add a valid teacher phone number first.";
  try {
    await Linking.openURL(`https://wa.me/${intl}`);
    return null;
  } catch {
    return "Unable to open WhatsApp.";
  }
}

/** Children, household members, family invitations and who is authorized to collect. Membership and authorization are separate. */
export function HouseholdPage() {
  const c = useColors();
  const { profile, isAdmin, demo, session } = useAuth();
  const h = useHousehold();
  const caps = capabilities(profile?.accountType ?? (demo ? "parent" : null), isAdmin);
  const [childSheet, setChildSheet] = useState<{ mode: "add" } | { mode: "edit"; child: HChild } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [rel, setRel] = useState("");
  const [mayCollect, setMayCollect] = useState(false);
  const [code, setCode] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [renameErr, setRenameErr] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const me = session?.user.id;

  if (!h.ready) return <T c="muted">Loading your household...</T>;

  const approved = h.helpers.filter((x) => x.state === "active");
  const authorizedFamily = h.members.filter((m) => m.canCollect);

  const makeInvite = async () => {
    if (inviteBusy) return;
    setInviteBusy(true);
    setInviteMsg("");
    setCode("");
    const res = await h.familyInviteCode({ relationship: rel, canCollect: mayCollect });
    setInviteBusy(false);
    if (res.ok) setCode(res.data);
    else setInviteMsg(res.missing ? "Family invitations need the backend upgrade (supabase/account_household.sql). Until your team applies it, add this person to the Trusted Circle instead." : res.error);
  };

  return (
    <View style={{ gap: 16 }}>
      {notice ? <Banner kind="ok">{notice}</Banner> : null}
      <Err text={error || h.error || ""} />

      <SectionHeading title="Household" />
      <Card tight>
        <Dl first k="Name" v={h.familyName || "Not available"} />
        <Dl k="Members" v={String(h.members.length)} />
      </Card>
      {caps.inviteFamily && !demo ? (
        <Btn kind="o" sm onPress={() => { setNameDraft(h.familyName); setRenameErr(""); setRenameOpen(true); }} label="Rename household">Rename household</Btn>
      ) : null}

      <SectionHeading title="Children" />
      {h.children.length === 0 ? (
        <Card>
          <EmptyState icon="school" title="No child added yet" body={caps.manageChildren ? "Add your child so SafeNest can plan school pickups." : "Only a parent or guardian can add a child."}>
            {caps.manageChildren ? <Btn onPress={() => setChildSheet({ mode: "add" })} icon="plus" label="Add your first child">Add your first child</Btn> : null}
          </EmptyState>
        </Card>
      ) : (
        h.children.map((ch) => (
          <Card key={ch.id} tight>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}>
              <Avatar name={ch.name} size={48} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T s={1.05} w={800} lh={1.3}>{ch.age !== null ? `${ch.name}, age ${ch.age}` : ch.name}</T>
                <T s={0.86} c="muted">{ch.className ? `Class ${ch.className}` : "No class added"}</T>
              </View>
            </View>
            <Dl k="School" v={ch.schoolName || "Not added"} />
            <Dl k="School address" v={ch.schoolAddress || "Not added"} />
            <Dl k="Class teacher" v={ch.teacherName || "Not added"} />
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line }}>
              <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 120 }}>
                <T s={0.95} c="muted">Teacher phone</T>
                <T s={0.95} w={700} tab>{ch.teacherPhone || "Not added"}</T>
              </View>
              {ch.teacherPhone ? (
                <SmallBtn tone="on" icon="chat" onPress={() => void openWhatsApp(ch.teacherPhone).then((m) => m && setError(m))} label={`Message ${ch.teacherName || "the teacher"} on WhatsApp`}>WhatsApp</SmallBtn>
              ) : null}
            </View>
            {caps.manageChildren && !demo ? (
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap", paddingTop: 10, paddingBottom: 6 }}>
                <Btn kind="o" sm onPress={() => setChildSheet({ mode: "edit", child: ch })} label={`Edit ${ch.name}`}>Edit</Btn>
                {isAdmin ? (
                  confirmDelete === ch.id ? (
                    <Btn kind="o" sm color={c.danger} onPress={async () => {
                      const r = await h.deleteChild(ch.id);
                      setConfirmDelete(null);
                      if (r.ok) setNotice(`${ch.name} was removed.`);
                      else setError(r.error);
                    }} label={`Confirm removing ${ch.name}`}>Tap again to remove</Btn>
                  ) : (
                    <Btn kind="t" onPress={() => setConfirmDelete(ch.id)} label={`Remove ${ch.name}`}>Remove</Btn>
                  )
                ) : null}
              </View>
            ) : null}
          </Card>
        ))
      )}
      {caps.manageChildren && h.children.length > 0 && !demo ? (
        <Btn kind="dash" icon="plus" onPress={() => setChildSheet({ mode: "add" })} label="Add another child">Add another child</Btn>
      ) : null}

      <SectionHeading title="People in your household" />
      <Card tight>
        {h.members.length === 0 ? (
          <View style={{ paddingVertical: 14 }}><T c="muted">Just you so far.</T></View>
        ) : (
          h.members.map((m, i) => (
            <View key={m.userId} style={{ paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line, gap: 8 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Avatar name={m.name} size={44} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T w={700}>{m.userId === me ? `${m.name} (you)` : m.name}</T>
                  <T s={0.84} c="muted" lh={1.35}>{[m.isAdmin ? "Admin" : "Member", m.relationship].filter(Boolean).join(" · ")}</T>
                </View>
                <Chip kind={m.canCollect ? "ok" : "plain"}>{m.canCollect ? "Can collect" : "Not authorized to collect"}</Chip>
              </View>
              {caps.removeMembers && m.userId !== me && !demo ? (
                <Btn kind="s" sm onPress={async () => {
                  const r = await h.setMemberCanCollect(m.userId, !m.canCollect);
                  if (r.ok) setNotice(m.canCollect ? `${m.name} can no longer be asked to collect.` : `${m.name} can now be asked to collect when they are available.`);
                  else setError(r.error);
                }} label={m.canCollect ? `Stop ${m.name} from collecting` : `Allow ${m.name} to collect`}>{m.canCollect ? "Remove collect permission" : "Allow to collect"}</Btn>
              ) : null}
              {caps.removeMembers && m.userId !== me && !demo ? (
                confirmRemove === m.userId ? (
                  <Btn kind="o" sm color={c.danger} onPress={async () => {
                    const r = await h.removeMember(m.userId);
                    setConfirmRemove(null);
                    if (r.ok) setNotice(`${m.name} was removed from the household.`);
                    else setError(r.error);
                  }} label={`Confirm removing ${m.name}`}>Tap again to remove {m.name}</Btn>
                ) : (
                  <Btn kind="t" onPress={() => setConfirmRemove(m.userId)} label={`Remove ${m.name} from the household`}>Remove from household</Btn>
                )
              ) : null}
            </View>
          ))
        )}
      </Card>
      {!h.namesAvailable && !demo ? (
        <T s={0.8} c="muted" lh={1.4}>Other members show as "Family member" until the team applies supabase/account_household.sql, which lets members see each other's names.</T>
      ) : null}
      <T s={0.84} c="muted" lh={1.45}>Being in the household does not let someone collect your child. Only people you authorize below can, and the teacher still checks who arrives.</T>

      {caps.inviteFamily && !demo ? (
        <>
          <Btn kind="s" icon="userplus" onPress={() => { setCode(""); setInviteMsg(""); setRel(""); setMayCollect(false); setInviteOpen(true); }} label="Invite a family member">Invite a family member</Btn>
          {h.familyInvites.length > 0 ? (
            <Card tight>
              {h.familyInvites.map((inv, i) => (
                <View key={inv.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T w={700}>{inv.relationship || "Family member"}</T>
                    <T s={0.84} c="muted">Waiting for them to enter the code</T>
                  </View>
                  <SmallBtn tone="danger" onPress={async () => { const r = await h.revokeInvite(inv.id); if (!r.ok) setError(r.error); }} label="Cancel this invitation">Cancel</SmallBtn>
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      <SectionHeading title="Authorized to collect" />
      <Card tight>
        {approved.length === 0 && authorizedFamily.length === 0 ? (
          <View style={{ paddingVertical: 14 }}><T c="muted" lh={1.4}>Nobody besides you yet. Add and approve people in the Trusted Circle.</T></View>
        ) : (
          <>
            {authorizedFamily.map((m, i) => (
              <View key={m.userId} style={{ flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: c.line }}>
                <Avatar name={m.name} size={36} /><View style={{ flex: 1 }}><T w={700}>{m.name}</T><T s={0.84} c="muted">Family member</T></View>
              </View>
            ))}
            {approved.map((x, i) => (
              <View key={x.id} style={{ flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 12, borderTopWidth: i === 0 && authorizedFamily.length === 0 ? 0 : 1, borderTopColor: c.line }}>
                <Avatar name={x.name} size={36} /><View style={{ flex: 1 }}><T w={700}>{x.name}</T><T s={0.84} c="muted">{x.role}{x.userId ? "" : " · has not joined yet"}</T></View>
              </View>
            ))}
          </>
        )}
      </Card>

      {!demo ? (
        <>
          <SectionHeading title="Join another family" />
          <Card>
            <T s={0.9} c="muted" lh={1.45}>If someone sent you an invite code, enter it here.</T>
            <View style={{ height: 12 }} />
            <JoinWithCode />
          </Card>
        </>
      ) : null}

      <Sheet visible={childSheet !== null} onClose={() => setChildSheet(null)} title={childSheet?.mode === "edit" ? "Edit child" : "Add child"} closeLabel="Close child form">
        {childSheet ? (
          <ChildForm
            initial={childSheet.mode === "edit" ? draftFromChild(childSheet.child) : undefined}
            submitLabel={childSheet.mode === "edit" ? "Save changes" : "Save child"}
            onCancel={() => setChildSheet(null)}
            onSubmit={async (d) => {
              const r = childSheet.mode === "edit" ? await h.updateChild(childSheet.child.id, d) : await h.addChild(d);
              if (!r.ok) return r.error;
              setNotice(childSheet.mode === "edit" ? "Child details saved." : `${d.name.trim()} was added.`);
              setChildSheet(null);
              return null;
            }}
          />
        ) : null}
      </Sheet>

      <Sheet visible={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite a family member" closeLabel="Close invitation">
        <T c="muted" lh={1.45}>They create their own SafeNest account, then enter the code. SafeNest does not email or text it for you.</T>
        <FormField label="Relationship to your child">
          <ChipChoice label="Relationship to your child" options={REL} value={(rel || null) as (typeof RELATIONSHIPS)[number] | null} onChange={setRel} />
        </FormField>
        <Card tight>
          <ToggleRow first title="Also allow them to collect" sub="Off by default. Family can see the household without being allowed to collect." on={mayCollect} onChange={setMayCollect} />
        </Card>
        <Err text={inviteMsg} />
        {code ? <ShareCode code={code} who={rel || "your family member"} kind="family" /> : <Btn onPress={() => void makeInvite()} loading={inviteBusy} label="Create invite code">Create invite code</Btn>}
      </Sheet>

      <Sheet visible={renameOpen} onClose={() => setRenameOpen(false)} title="Rename household" closeLabel="Close rename" footer={<View style={{ gap: 10 }}><Err text={renameErr} /><Btn onPress={async () => { const r = await h.renameFamily(nameDraft); if (!r.ok) return setRenameErr(r.error); setRenameOpen(false); setNotice("Household renamed."); }} label="Save name">Save name</Btn></View>}>
        <FormField label="Household name" required>
          <Input value={nameDraft} onChangeText={setNameDraft} autoCapitalize="words" accessibilityLabel="Household name" />
        </FormField>
      </Sheet>
    </View>
  );
}
