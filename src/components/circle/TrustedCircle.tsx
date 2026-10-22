import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";

import { SetupChecklist } from "../onboarding/SetupChecklist";
import { HelperForm } from "../household/HelperForm";
import { ShareCode } from "../household/ShareCode";
import { AppShell } from "../shared/AppShell";
import { useAppContext } from "../shared/AppContext";
import { useAuth } from "../shared/AuthContext";
import { Avatar } from "../shared/Avatar";
import { Card } from "../shared/Card";
import { SecondaryButton } from "../shared/SecondaryButton";
import { SectionHeading } from "../shared/SectionHeading";
import { Sheet } from "../shared/Sheet";
import { StatusPill } from "../shared/StatusPill";
import { TimeWheelPicker } from "../shared/TimeWheel";
import { capabilities } from "../shared/accountRules";
import { chooseRecipients, nobodyAvailableMessage, statusLine, type Availability } from "../shared/availability";
import { EmptyState } from "../shared/forms";
import { useChildSchool } from "../shared/HouseholdContext";
import { mockData } from "../shared/mockData";
import { setLocalPendingCount } from "../shared/pendingBadge";
import { useFamilyAvailability } from "../shared/useAvailability";
import { Banner, Btn, Chip, Err, Lead, Press, Rise, SmallBtn, T, Tag, useColors } from "../shared/ui";
import { Icon } from "../navigation/Icon";

// Circle manages who can help. The active backup pickup (request, answers, confirmation) lives on Today.
// A real account sees only the people stored for its own household. Demo Mode shows made-up people and saves nothing.
// Three different things are kept apart on purpose:
//   approved   = a guardian said this person may collect (trusted_helpers.state = 'active')
//   available  = this person's saved hours say SafeNest may ask them right now
//   accepted   = this person said yes to one specific pickup request (shown on Today)

const DEMO_AVAILABILITY: Record<string, { on: boolean; until: string }> = {
  abu: { on: true, until: "3:00 PM" }, siti: { on: false, until: "" }, aiman: { on: false, until: "" },
  ahmad: { on: true, until: "2:00 PM" }, ima: { on: true, until: "2:00 PM" }, salmah: { on: true, until: "2:30 PM" },
};

type Person = { id: string; userId: string | null; name: string; role: string; phone: string; approved: boolean; joined: boolean; kind: "family" | "helper"; canCollect?: boolean };

export function TrustedCircle() {
  const { theme, selectedCaregiver } = useAppContext();
  const { profile, isAdmin } = useAuth();
  const { child, hasChild, household: h } = useChildSchool();
  const router = useRouter();
  const colors = theme.colors;
  const c = useColors();
  const caps = capabilities(h.demo ? "parent" : profile?.accountType ?? null, isAdmin);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  // Demo-only local state (Demo Mode keeps the original on-screen toggles).
  const [demoAvail, setDemoAvail] = useState(DEMO_AVAILABILITY);
  const [demoPrimary, setDemoPrimary] = useState<Record<string, boolean>>({ abu: true });
  const [timePicker, setTimePicker] = useState(false);
  const [selectedTime, setSelectedTime] = useState("3:00 PM");

  const me = selectedCaregiver?.id ?? "";
  const helperUserIds = h.helpers.map((x) => x.userId).filter((x): x is string => !!x);
  const memberUserIds = h.members.map((m) => m.userId);
  const availMap = useFamilyAvailability(h.demo ? [] : [...helperUserIds, ...memberUserIds]);

  const helpers: Person[] = h.helpers.map((x) => ({ id: x.id, userId: x.userId, name: x.name, role: x.role, phone: x.phone, approved: x.state === "active", joined: h.demo ? true : !!x.userId, kind: "helper" }));
  const approved = helpers.filter((x) => h.helpers.find((y) => y.id === x.id)?.state === "active");
  const pending = helpers.filter((x) => h.helpers.find((y) => y.id === x.id)?.state === "pending");
  const family: Person[] = h.members.map((m) => ({ id: m.userId, userId: m.userId, name: m.name, role: m.relationship || (m.isAdmin ? "Parent or guardian" : "Family member"), phone: m.phone, approved: m.canCollect, joined: true, kind: "family", canCollect: m.canCollect }));

  const pendingCount = pending.length;
  useEffect(() => {
    setLocalPendingCount(pendingCount);
    return () => setLocalPendingCount(0);
  }, [pendingCount]);

  const now = Date.now();
  const lineFor = (p: Person): { tone: "ok" | "muted" | "warn"; text: string } => {
    if (h.demo) {
      const d = demoAvail[p.id];
      return d?.on ? { tone: "ok", text: `Available until ${d.until || "2:00 PM"}` } : { tone: "muted", text: "Busy" };
    }
    if (!p.joined) return { tone: "muted", text: "Has not joined SafeNest yet" };
    const a: Availability | null = p.userId ? availMap[p.userId] ?? null : null;
    return statusLine(a, now);
  };

  // Who would be asked right now: approved, joined, and available. A preview of the rule, not a send.
  const preview = useMemo(() => {
    const cands = approved
      .filter((p) => p.joined)
      .map((p) => ({ id: p.id, name: p.name, approved: true, availability: (p.userId ? availMap[p.userId] : null) ?? null }));
    const unjoined = approved.filter((p) => !p.joined);
    return { decision: chooseRecipients(cands, now), unjoined };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approved.map((p) => p.id).join(","), availMap]);

  const act = async (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    setError("");
    setNotice("");
    const r = await fn();
    if (r.ok) setNotice(okMsg);
    else setError(("error" in r && r.error) || "That did not work.");
  };

  const makeCode = async (p: Person) => {
    setError("");
    const r = await h.helperInviteCode(p.id);
    if (r.ok) setCodes((cur) => ({ ...cur, [p.id]: r.data }));
    else setError(r.error);
  };

  const phoneOf = (p: Person) => p.phone || "Phone not shared";
  const isDemoCollector = (p: Person) => h.demo && p.id === mockData.pickupStatus.collectorId;

  if (!h.ready) {
    return (
      <AppShell title="Trusted Circle" badge="Circle" activeTab="circle">
        <T c="muted">Loading your circle...</T>
      </AppShell>
    );
  }

  const renderAddSheet = () => (
      <Sheet visible={addOpen} onClose={() => setAddOpen(false)} title="Add a helper" closeLabel="Close add helper dialog">
        <T c="muted" lh={1.4}>{h.demo ? "Demo Mode: this adds a made-up pending person on screen only." : "They are added as pending. Approving them is a separate step, and they can only answer requests after they join with a code."}</T>
        <HelperForm
          submitLabel={h.demo ? "Add demo helper" : "Add to Trusted Circle"}
          onCancel={() => setAddOpen(false)}
          onSubmit={async (d) => {
            const r = await h.addHelper(d);
            if (!r.ok) return r.error;
            setNotice(h.demo ? `${d.name.trim()} added in this demo.` : `${d.name.trim()} was added and is waiting for your approval.`);
            setAddOpen(false);
            return null;
          }}
        />
      </Sheet>
    );

  // Nothing set up: say so, do not invent people.
  if (!h.demo && !hasChild && h.helpers.length === 0) {
    return (
      <AppShell title="Trusted Circle" badge="Circle" activeTab="circle">
        {error || h.error ? <Err text={error || h.error || ""} /> : null}
        <EmptyState icon="circle" title="Your Trusted Circle is empty" body={caps.inviteHelpers ? "These are the adults who may collect your child if you cannot. Nobody is added for you, and nobody is approved until you say so." : "A parent will add you to their Trusted Circle. Then you can say when you are free."}>
          {caps.inviteHelpers ? <Btn onPress={() => setAddOpen(true)} icon="userplus" label="Add your first helper">Add your first helper</Btn> : (
            <Btn onPress={() => router.push({ pathname: "/settings", params: { page: "household" } })} label="Join with an invite code">Join with an invite code</Btn>
          )}
        </EmptyState>
        <SetupChecklist />
        {renderAddSheet()}
      </AppShell>
    );
  }

  return (
    <AppShell title="Trusted Circle" badge="Circle" activeTab="circle">
      <Lead>{hasChild ? `Who can collect ${child.name}. Tap a name for details.` : "Who can collect your child. Tap a name for details."}</Lead>
      {notice ? <Banner key={notice} kind="ok">{notice}</Banner> : null}
      <Err text={error || h.error || ""} />

      {pending.length > 0 ? (
        <>
          <SectionHeading title="Waiting for approval" />
          <Card tight>
            {pending.map((p, index) => (
              <View key={p.id} style={{ borderTopWidth: index > 0 ? 1 : 0, borderTopColor: colors.line, paddingVertical: 12, gap: 10 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 8 }}>
                  <Avatar name={p.name} size={44} />
                  <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 150, minWidth: 0 }}>
                    <T w={700}>{p.name}</T>
                    <T s={0.84} c="muted" lh={1.35}>{p.role} · {phoneOf(p)}</T>
                  </View>
                  <StatusPill label="Pending" tone="warning" />
                </View>
                {caps.approveHelpers || h.demo ? (
                  <>
                    <T s={0.84} c="muted" lh={1.4}>Approving lets SafeNest ask {p.name} to collect {hasChild ? child.name : "your child"}. The teacher still checks who arrives.</T>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <Btn kind="p" sm flex label={`Approve ${p.name}`} onPress={() => void act(() => h.setHelperState(p.id, "active"), `${p.name} approved${h.demo ? " in this demo" : ""}.`)}>Approve</Btn>
                      <Btn kind="o" sm color={colors.danger} label={`Reject ${p.name}`} onPress={() => void act(() => h.setHelperState(p.id, "rejected"), `${p.name} was declined.`)}>Reject</Btn>
                    </View>
                  </>
                ) : (
                  <T s={0.84} c="muted" lh={1.4}>A family admin needs to approve this person.</T>
                )}
                {!h.demo && caps.inviteHelpers ? (
                  codes[p.id] ? <ShareCode code={codes[p.id]} who={p.name} kind="helper" /> : (
                    <Btn kind="s" sm onPress={() => void makeCode(p)} label={`Create a join code for ${p.name}`}>{p.joined ? "New join code" : "Create join code"}</Btn>
                  )
                ) : null}
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeading title="Approved to collect" />
      <Card tight>
        {approved.length ? approved.map((p, i) => renderMember(p, i)) : (
          <View style={{ paddingVertical: 16, gap: 6 }}>
            <T s={0.92} c="muted" lh={1.4}>No approved helpers yet.</T>
            {caps.inviteHelpers ? <T s={0.84} c="muted" lh={1.4}>Add a helper, then approve them. Only approved helpers can be asked.</T> : null}
          </View>
        )}
      </Card>
      {caps.inviteHelpers ? <SecondaryButton label="+ Add New Helper" onPress={() => setAddOpen(true)} /> : null}

      {!h.demo && caps.manageChildren && approved.length > 0 ? (
        <>
          <SectionHeading title="If you are running late" />
          <Card style={{ gap: 8 }}>
            <T s={0.78} w={700} ls={0.06} up c="muted">Who would be asked right now</T>
            {preview.decision.eligible.length > 0 ? (
              <View style={{ gap: 4 }}>
                <T lh={1.4}>Everyone below would be asked at the same time. The first to accept collects, and the rest are told it is covered.</T>
                {preview.decision.eligible.map((x) => <T key={x.id} s={0.92} w={700}>{x.name}</T>)}
              </View>
            ) : (
              <T lh={1.45} c={colors.warningInk}>{nobodyAvailableMessage(preview.decision, approved.length) || "Nobody can be asked right now."}</T>
            )}
            {preview.decision.skipped.filter((s) => s.candidate.approved).map((s) => (
              <T key={s.candidate.id} s={0.86} c="muted" lh={1.35}>Not asked: {s.candidate.name}. {s.why}.</T>
            ))}
            {preview.unjoined.map((p) => <T key={p.id} s={0.86} c="muted" lh={1.35}>Not asked: {p.name}. Has not joined SafeNest yet.</T>)}
            <T s={0.78} c="muted" lh={1.4}>This is a preview of the rule. The group request itself is sent by the backend, and it only applies availability once supabase/account_household.sql is applied. Until then it asks every joined, approved helper.</T>
          </Card>
        </>
      ) : null}

      <SectionHeading title="Family" />
      <Card tight>
        {family.length === 0 ? (
          <View style={{ paddingVertical: 16 }}><T s={0.92} c="muted" lh={1.4}>Just you so far. Invite a family member from Settings, Household and children.</T></View>
        ) : family.map((p, i) => renderMember(p, i))}
      </Card>
      {!h.demo ? <T s={0.8} c="muted" align="center" lh={1.4}>Being family does not let someone collect. Only people marked "Can collect" can.</T> : <T s={0.78} lh={1.4} c="muted" align="center">Simulated demo. Contacts and availability are sample data.</T>}

      {renderAddSheet()}

      <Sheet
        visible={timePicker}
        onClose={() => setTimePicker(false)}
        title="Your pickup availability"
        closeLabel="Close time picker"
        footer={<Btn onPress={() => { setDemoAvail((cur) => ({ ...cur, [me]: { on: true, until: selectedTime } })); setNotice(`Your demo availability is set until ${selectedTime}.`); setTimePicker(false); }} label="Save my availability">Save my availability</Btn>}
      >
        <T c="muted" lh={1.4}>Choose when your availability ends.</T>
        <TimeWheelPicker value={selectedTime} onChange={setSelectedTime} />
        <T s={0.85} c="muted" align="center">Demo only · No real notification is sent.</T>
      </Sheet>
    </AppShell>
  );

  function renderMember(p: Person, index: number) {
    const open = openIds[p.id] ?? false;
    const line = lineFor(p);
    const isMe = p.userId === me || p.id === me;
    const lineColor = line.tone === "ok" ? colors.success : line.tone === "warn" ? colors.warningInk : colors.muted;
    const isPrimary = h.demo && (demoPrimary[p.id] ?? false);
    const can = p.kind === "helper" ? p.approved : p.canCollect === true;
    return (
      <View key={p.id} style={{ borderTopWidth: index > 0 ? 1 : 0, borderTopColor: colors.line }}>
        <Press
          onPress={() => setOpenIds((cur) => ({ ...cur, [p.id]: !open }))}
          label={`${p.name}, ${p.role}. ${line.text}. ${open ? "Hide" : "Show"} details`}
          state={{ selected: open }}
          scaleTo={0.985}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 10 }}
        >
          <Avatar name={p.name} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 6 }}>
              <T w={700}>{isMe && !h.demo ? `${p.name} (you)` : p.name}</T>
              {isDemoCollector(p) ? <Tag>TODAY'S PICKUP</Tag> : null}
            </View>
            <T s={0.84} c="muted" lh={1.35}>{p.role}</T>
            <T s={0.84} w={600} c={lineColor} lh={1.35}>{line.text}</T>
          </View>
          <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
            <Icon name="chev" size={18} color={colors.muted} stroke={2} />
          </View>
        </Press>
        {open ? (
          <Rise kind="swap" style={{ paddingBottom: 12, gap: 10 }}>
            <View style={{ gap: 4 }}>
              <T s={0.88} lh={1.4}>{phoneOf(p)}</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <Chip kind={can ? "ok" : "plain"} icon={can ? "check" : "lock"}>{can ? "Approved to collect" : "Not approved to collect"}</Chip>
                {isPrimary ? <Tag kind="gold" icon="star">PRIMARY EMERGENCY CONTACT</Tag> : null}
              </View>
              <T s={0.8} c="muted" lh={1.4}>Available means SafeNest may ask. It does not approve anyone to collect.</T>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              {isMe ? (
                h.demo ? (
                  <>
                    <SmallBtn role="switch" checked={demoAvail[p.id]?.on ?? false} tone={demoAvail[p.id]?.on ? "on" : "off"} label="My pickup availability" hint="Toggle your own availability for pickup." onPress={() => setDemoAvail((cur) => ({ ...cur, [p.id]: { on: !(cur[p.id]?.on ?? false), until: cur[p.id]?.until || "3:00 PM" } }))}>
                      {demoAvail[p.id]?.on ? "Available" : "Busy"}
                    </SmallBtn>
                    {demoAvail[p.id]?.on ? <SmallBtn tone="on" label="Set my pickup availability" onPress={() => { setSelectedTime(demoAvail[p.id]?.until || "3:00 PM"); setTimePicker(true); }}>{`Until ${demoAvail[p.id]?.until || "3:00 PM"} · Change`}</SmallBtn> : null}
                  </>
                ) : (
                  <SmallBtn tone="on" icon="clock" label="Edit my pickup availability" onPress={() => router.push({ pathname: "/settings", params: { page: "availability" } })}>Edit my availability</SmallBtn>
                )
              ) : (
                <View accessible accessibilityLabel={`${p.name} availability is read only`}>
                  <Chip kind="plain" icon="lock">Only {p.name} can change availability</Chip>
                </View>
              )}
              {h.demo ? (
                <SmallBtn role="switch" checked={isPrimary} tone={isPrimary ? "gold" : "off"} icon="star" label={`${p.name} primary emergency contact`} hint="Toggle this person as a primary emergency contact." onPress={() => setDemoPrimary((cur) => ({ ...cur, [p.id]: !cur[p.id] }))}>
                  {isPrimary ? "Primary contact" : "Make primary contact"}
                </SmallBtn>
              ) : null}
              {p.kind === "helper" && (caps.approveHelpers || h.demo) ? (
                confirmRemove === p.id ? (
                  <SmallBtn tone="danger" label={`Confirm removing ${p.name}`} onPress={() => { setConfirmRemove(null); void act(() => h.removeHelper(p.id), `${p.name} was removed from the Trusted Circle.`); }}>Tap again to remove</SmallBtn>
                ) : (
                  <SmallBtn tone="danger" label={`Remove ${p.name} from trusted circle`} onPress={() => setConfirmRemove(p.id)}>Remove</SmallBtn>
                )
              ) : null}
            </View>
          </Rise>
        ) : null}
      </View>
    );
  }
}
