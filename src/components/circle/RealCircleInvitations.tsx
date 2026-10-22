import { useEffect, useRef, useState } from "react";
import { AppState, Share, Text, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../shared/AuthContext";
import { Card } from "../shared/Card";
import { Banner, Btn, Input, T, useColors } from "../shared/ui";
import { loadAdminFamilies, selectAdminFamily, type AdminFamily } from "./adminFamilies";
import { createInvitationLifecycle } from "./invitationLifecycle";
import { createInvitationApi, type Approval, type Invitation } from "./invitationApi";

const api = createInvitationApi((name, args) => supabase.rpc(name, args));
export function RealCircleInvitations() {
  const { session, familyId, loading } = useAuth();
  if (loading) return <T>Loading your account...</T>;
  if (!session) return <T>Sign in to join a real Circle.</T>;
  return <InvitationFamilies key={session.user.id} userId={session.user.id} currentFamily={familyId} />;
}
function InvitationFamilies({ userId, currentFamily }: { userId: string; currentFamily: string | null }) {
  const [families, setFamilies] = useState<AdminFamily[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const colors = useColors();
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(false); setFamilies([]);
    void loadAdminFamilies(userId, (id, from, to) => supabase.from("family_members")
      .select("family_id,user_id,role,families(id,name)")
      .eq("user_id", id).eq("role", "admin").order("family_id").range(from, to))
      .then(rows => { if (!cancelled) setFamilies(rows); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, revision]);
  const familyId = selectAdminFamily(families, selected, currentFamily);
  return <View style={{ gap: 10 }}>
    <T w={800}>Family administration</T>
    <T c="muted">Select the family for real invitations and approvals. This does not change the family used by Today, Plan or other screens.</T>
    <Btn kind="o" disabled={loading} onPress={() => setRevision(value => value + 1)}>Refresh administrator families</Btn>
    {loading ? <T>Loading administrator families...</T> : error ? <View accessibilityRole="alert"><T c={colors.danger}>Unable to load administrator families. Use Refresh to retry. Joining another Circle is still available below.</T></View> : families.length === 0 ? <T>You have no administrator families.</T> : families.map(family => <Btn key={family.id} kind={family.id === familyId ? "p" : "o"} onPress={() => setSelected(family.id)} label={`Manage ${family.name}, ${family.id}${family.id === familyId ? ", selected" : ""}`}>
      {family.id === familyId ? "Selected: " : "Manage: "}{family.name} ({family.id})
    </Btn>)}
    <AccountInvitations key={`${userId}:${familyId ?? "none"}`} familyId={familyId} isAdmin={familyId !== null} />
  </View>;
}
function AccountInvitations({ familyId, isAdmin }: { familyId: string | null; isAdmin: boolean }) {
  const colors = useColors();
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [queue, setQueue] = useState<Approval[] | null>(null);
  const [verified, setVerified] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const locked = useRef(false);
  const alive = useRef(true);
  const lifecycle = useRef(createInvitationLifecycle());
  const operationTicket = useRef(0);
  const canPublish = () => alive.current && lifecycle.current.isCurrent(operationTicket.current);
  useEffect(() => {
    alive.current = true;
    lifecycle.current.mount(AppState.currentState);
    const listener = AppState.addEventListener("change", state => {
      lifecycle.current.change(state);
      if (state !== "active") {
        setToken(""); setInvitation(null); setVerified({}); setQueue(null); setError("");
        setNotice("Sensitive information cleared. A pending operation may still finish on the server. Refresh memberships or pending requests before retrying; a generated code cannot be recovered here.");
      }
    });
    return () => { alive.current = false; lifecycle.current.dispose(); listener.remove(); };
  }, []);
  async function perform(action: () => Promise<void>) {
    const ticket = lifecycle.current.ticket();
    if (locked.current || !lifecycle.current.isCurrent(ticket)) return;
    operationTicket.current = ticket;
    locked.current = true; setBusy(true); setError(""); setNotice("");
    try { await action(); } catch { if (canPublish()) setError("Action could not be confirmed. Refresh before retrying."); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  async function refreshQueue() {
    if (!familyId) return;
    const result = await api.queue(familyId);
    if (!canPublish()) return;
    setVerified({});
    if (result.ok) setQueue(result.data); else { setQueue(null); setError(result.error); }
  }
  return <Card style={{ gap: 12 }}>
    <T w={800}>Real account: Join Circle</T>
    <T c="muted">These actions use your signed-in account. They are separate from the fictional demo below. Joining stays pending until the family administrator approves.</T>
    <Input accessibilityLabel="Secure invitation code" placeholder="Paste invitation code" value={token} onChangeText={setToken} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={512} editable={!busy} />
    <Btn disabled={busy || !token.trim()} loading={busy} onPress={() => void perform(async () => {
      const entered = token; setToken("");
      const result = await api.accept(entered);
      if (!canPublish()) return;
      if (result.ok) setNotice("Request received. Awaiting administrator approval. Open Joined Circles and tap Refresh to view Pending or Active status.");
      else setError(result.error);
    })}>Request to join Circle</Btn>
    {isAdmin && familyId ? <>
      <T w={800}>Administrator: Invite a helper</T>
      <Input accessibilityLabel="Intended helper name" placeholder="Intended helper name" value={name} onChangeText={setName} maxLength={200} editable={!busy} />
      <Input accessibilityLabel="Helper relationship" placeholder="Relationship (optional)" value={relationship} onChangeText={setRelationship} maxLength={200} editable={!busy} />
      <Btn disabled={busy || !name.trim() || invitation !== null} onPress={() => void perform(async () => {
        const result = await api.create(familyId, name, relationship);
        if (!canPublish()) return;
        if (result.ok) { setInvitation(result.data[0]); setName(""); setRelationship(""); }
        else setError(result.error);
      })}>Generate secure invitation</Btn>
      {invitation ? <View style={{ gap: 8 }}>
        <Banner>This code grants the ability to request membership, never automatic approval. Share privately with the intended person. It is shown only in this session.</Banner>
        <Text selectable style={{ color: colors.ink }} accessibilityLabel="Generated invitation code">{invitation.invite_token}</Text>
        <T s={0.8}>Expires {new Date(invitation.expires_at).toLocaleString()}</T>
        <Btn kind="o" disabled={busy} onPress={() => void perform(async () => {
          await Share.share({ message: `SafeNest invitation code: ${invitation.invite_token}\nEnter this privately in Circle > Real account: Join Circle. Administrator approval is required.` });
        })}>Share invitation privately</Btn>
        <Btn kind="o" disabled={busy} onPress={() => setInvitation(null)}>Dismiss code</Btn>
      </View> : null}
      <T w={800}>Administrator: Pending requests</T>
      <T c="muted">Verify the person independently before approving. Profile names are self-reported; compare the account ID through a trusted channel. If unsure, leave the request pending. Rejection is not available in this phase.</T>
      <Btn kind="o" disabled={busy} onPress={() => void perform(refreshQueue)}>Refresh pending requests</Btn>
      {queue?.length === 0 ? <T>No pending requests.</T> : null}
      {queue?.map(row => <Card key={row.membership_id} style={{ gap: 8 }}>
        <T w={700}>Invited: {row.helper_name}</T>
        <T>Relationship: {row.relationship || "Not specified"}</T>
        <T>Requesting account: {row.accepting_account_name || "Name unavailable"}</T>
        <Text selectable style={{ color: colors.ink }}>Account ID: {row.accepting_account_id}</Text>
        <T s={0.8}>Accepted {new Date(row.accepted_at).toLocaleString()}</T>
        <Btn kind="o" disabled={busy} onPress={() => setVerified(current => ({ ...current, [row.membership_id]: !current[row.membership_id] }))}>{verified[row.membership_id] ? "Identity verified independently (tap to undo)" : "Confirm I verified this person independently"}</Btn>
        <Btn disabled={busy || !verified[row.membership_id]} onPress={() => void perform(async () => {
          const result = await api.approve(row.membership_id);
          if (!canPublish()) return;
          if (!result.ok) { setError(result.error); return; }
          await refreshQueue();
          if (canPublish()) setNotice("Helper approved. They can refresh Joined Circles to see Active status. Membership alone does not grant every pickup permission.");
        })}>Approve helper</Btn>
      </Card>)}
    </> : <T c="muted">Invitation creation and approval require your real family's administrator role.</T>}
    {busy ? <View accessibilityLiveRegion="polite"><T>Working...</T></View> : null}
    {notice ? <Banner>{notice}</Banner> : null}
    {error ? <View accessibilityRole="alert"><T c={colors.danger}>{error}</T></View> : null}
  </Card>;
}
