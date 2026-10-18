import { useEffect, useReducer, useState } from "react";
import { View } from "react-native";

import { Icon } from "../navigation/Icon";
import { AppShell } from "../shared/AppShell";
import { useAppContext } from "../shared/AppContext";
import { Avatar } from "../shared/Avatar";
import { Card } from "../shared/Card";
import { PrimaryButton } from "../shared/PrimaryButton";
import { SecondaryButton } from "../shared/SecondaryButton";
import { SectionHeading } from "../shared/SectionHeading";
import { Sheet } from "../shared/Sheet";
import { TimeWheelPicker } from "../shared/TimeWheel";
import { StatusPill } from "../shared/StatusPill";
import { setLocalPendingCount } from "../shared/pendingBadge";
import { mockData } from "../shared/mockData";
import { useProfileEdits } from "../shared/profileEdits";
import { Banner, Btn, Chip, Err, Field, Input, Lead, Seg, SmallBtn, Press, Rise, T, Tag, useColors } from "../shared/ui";
import type { FamilyMember, TrustedHelper } from "../shared/types";
import { InvitationSheet } from "./InvitationSheet";
import { JoinedCircles } from "./JoinedCircles";
import { AccountJoinedCircles } from "./AccountJoinedCircles";
import { canManageDemoInvitations, circleDemoReducer, createCircleDemoState, DEMO_PERSONAS } from "./circleDemo";
import type { DemoActor } from "./circleDemo";

type LocalTrustedHelper = TrustedHelper & { age: number };

type TimePickerPurpose = "backup" | "availability";
type LocalBackupPickupRequest = {
  pickupTime: string;
  recipientIds: string[];
  state: "pending" | "approved";
  approvedBy?: string;
};


export function TrustedCircle() {
  const { selectedCaregiver } = useAppContext();
  // Auth identity scopes the component lifetime only; it is never a fictional membership ID.
  return <CircleDemoScreen key={`circle-demo-session:${selectedCaregiver?.id ?? "signed-out"}`} />;
}

function CircleDemoScreen() {
  const { theme, trustedHelpers, setTrustedHelperState } = useAppContext();
  const [personaId, setPersonaId] = useState<DemoActor["id"]>("abu");
  const demoActor = DEMO_PERSONAS.find((persona) => persona.id === personaId) ?? DEMO_PERSONAS[0];
  const [circleTab, setCircleTab] = useState<"my" | "joined">("my");
  const [invitationOpen, setInvitationOpen] = useState(false);
  // Single screen-owned model for invitations and joined memberships; no external store.
  // Resets on screen unmount. Does not alter shared Today/Plan pickup data.
  const [circleDemo, dispatchCircleDemo] = useReducer(circleDemoReducer, undefined, createCircleDemoState);
  const canInvite = canManageDemoInvitations(demoActor);
  const profileEdits = useProfileEdits();
  const colors = theme.colors;
  const [notice, setNotice] = useState("");
  // Details (phone, location, controls) are hidden until a person is tapped.
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [availabilityTimes, setAvailabilityTimes] = useState<Record<string, string>>({
    abu: "3:00 PM",
    siti: "2:00 PM",
    aiman: "Unavailable",
    ahmad: "2:00 PM",
    ima: "2:00 PM",
    salmah: "2:30 PM",
  });
  const [timePickerPurpose, setTimePickerPurpose] = useState<TimePickerPurpose | null>(null);
  const [selectedTime, setSelectedTime] = useState("2:30 PM");
  const [backupPickupRequest, setBackupPickupRequest] = useState<LocalBackupPickupRequest | null>(null);
  const [approvalNoticeVisible, setApprovalNoticeVisible] = useState(false);
  const [primaryContactIds, setPrimaryContactIds] = useState<Record<string, boolean>>({
    abu: true,
  });
  const [availability, setAvailability] = useState<Record<string, boolean>>({
    abu: true,
    siti: false,
    aiman: false,
    ahmad: true,
    ima: true,
    salmah: true,
  });
  const [localHelpers, setLocalHelpers] = useState<LocalTrustedHelper[]>([]);
  const [localHelperPhones, setLocalHelperPhones] = useState<Record<string, string>>({});
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [newHelperName, setNewHelperName] = useState("");
  const [newHelperAge, setNewHelperAge] = useState("");
  const [newHelperRole, setNewHelperRole] = useState("");
  const [newHelperPhone, setNewHelperPhone] = useState("");
  const [formError, setFormError] = useState("");

  const localPendingCount = localHelpers.filter((helper) => helper.state === "pending").length;
  useEffect(() => {
    setLocalPendingCount(localPendingCount);
    return () => setLocalPendingCount(0);
  }, [localPendingCount]);

  const approvedHelpers = [
    ...trustedHelpers.filter((helper) => helper.state === "active"),
    ...localHelpers.filter((helper) => helper.state === "active"),
  ];
  const pendingHelpers = [
    ...trustedHelpers.filter((helper) => helper.state === "pending"),
    ...localHelpers.filter((helper) => helper.state === "pending"),
  ];
  const familyMembers = mockData.familyMembers;
  const accountOwner = mockData.caregivers.find((caregiver) => caregiver.id === demoActor.id) ?? mockData.caregivers[0];
  const primaryHelpers = approvedHelpers.filter((helper) => primaryContactIds[helper.id]);
  const regularHelpers = approvedHelpers.filter((helper) => !primaryContactIds[helper.id]);
  const availableHelpers = approvedHelpers.filter((helper) => availability[helper.id] ?? false);

  const approve = (helper: TrustedHelper) => {
    if (localHelpers.some((item) => item.id === helper.id)) {
      setLocalHelpers((current) => current.map((item) => (
        item.id === helper.id ? { ...item, state: "active" } : item
      )));
    } else {
      setTrustedHelperState(helper.id, "active");
    }
    setNotice(`${helper.name} approved in this demo.`);
  };

  const reject = (helper: TrustedHelper) => {
    if (localHelpers.some((item) => item.id === helper.id)) {
      setLocalHelpers((current) => current.map((item) => (
        item.id === helper.id ? { ...item, state: "rejected" } : item
      )));
    } else {
      setTrustedHelperState(helper.id, "rejected");
    }
    setNotice(`${helper.name} request declined in this demo.`);
  };

  const removeHelper = (helper: TrustedHelper) => {
    if (localHelpers.some((item) => item.id === helper.id)) {
      setLocalHelpers((current) => current.filter((item) => item.id !== helper.id));
      setLocalHelperPhones((current) => {
        const { [helper.id]: _removedPhone, ...remainingPhones } = current;
        return remainingPhones;
      });
    } else {
      setTrustedHelperState(helper.id, "rejected");
    }
    setAvailability((current) => {
      const { [helper.id]: _removedAvailability, ...remainingAvailability } = current;
      return remainingAvailability;
    });
    setPrimaryContactIds((current) => {
      const { [helper.id]: _removedPrimaryContact, ...remainingPrimaryContacts } = current;
      return remainingPrimaryContacts;
    });
    setBackupPickupRequest((current) => current ? {
      ...current,
      recipientIds: current.recipientIds.filter((id) => id !== helper.id),
    } : current);
    setNotice(`${helper.name} removed from the trusted circle in this demo.`);
  };

  const toggleOwnerAvailability = () => {
    setAvailability((current) => ({ ...current, [accountOwner.id]: !current[accountOwner.id] }));
  };

  const togglePrimaryContact = (personId: string) => {
    setPrimaryContactIds((current) => ({ ...current, [personId]: !current[personId] }));
  };

  const openTimePicker = (purpose: TimePickerPurpose) => {
    setSelectedTime(purpose === "backup"
      ? "2:30 PM"
      : availabilityTimes[accountOwner.id] === "Unavailable"
        ? "3:00 PM"
        : availabilityTimes[accountOwner.id] ?? "3:00 PM");
    setTimePickerPurpose(purpose);
  };

  const saveSelectedTime = () => {
    if (timePickerPurpose === "backup") {
      if (availableHelpers.length === 0) {
        setNotice("No approved helpers are currently available for pickup.");
        setTimePickerPurpose(null);
        return;
      }
      setBackupPickupRequest({
        pickupTime: selectedTime,
        recipientIds: availableHelpers.map((helper) => helper.id),
        state: "pending",
      });
      setNotice(`Demo request sent to ${availableHelpers.length} available helper${availableHelpers.length === 1 ? "" : "s"} for ${selectedTime}.`);
    } else {
      setAvailabilityTimes((current) => ({ ...current, [accountOwner.id]: selectedTime }));
      setNotice(`Your demo pickup availability is set until ${selectedTime}.`);
    }
    setTimePickerPurpose(null);
  };

  const simulateHelperApproval = (helper: TrustedHelper) => {
    setBackupPickupRequest((current) => current ? {
      ...current,
      state: "approved",
      approvedBy: helper.name,
    } : current);
    setApprovalNoticeVisible(true);
  };

  const closeAddModal = () => {
    setIsAddModalVisible(false);
    setNewHelperName("");
    setNewHelperAge("");
    setNewHelperRole("");
    setNewHelperPhone("");
    setFormError("");
  };

  const addHelper = () => {
    const name = newHelperName.trim();
    const role = newHelperRole.trim();
    const ageText = newHelperAge.trim();
    const age = Number(ageText);
    if (!name || !role || !ageText || !Number.isInteger(age) || age < 0) {
      setFormError("Enter a name, a valid age, and the person's relationship to the child.");
      return;
    }

    const helperId = `local-helper-${Date.now()}`;
    setLocalHelpers((current) => [...current, { id: helperId, name, age, role, state: "pending" }]);
    if (newHelperPhone.trim()) {
      setLocalHelperPhones((current) => ({ ...current, [helperId]: newHelperPhone.trim() }));
    }
    setAvailability((current) => ({ ...current, [helperId]: false }));
    setNotice(`Demo invitation sent to ${name}. Waiting for approval.`);
    closeAddModal();
  };

  const getContactDetail = (member: FamilyMember | TrustedHelper) => {
    const caregiver = mockData.caregivers.find((item) => item.id === member.id);
    if (caregiver) return profileEdits[caregiver.id]?.phone ?? caregiver.phone;
    if (member.id === "aiman") return "+60 11-3344 5566";
    return localHelperPhones[member.id] ?? "Phone not shared";
  };

  return (
    <AppShell title="Trusted Circle" badge="Circle" activeTab="circle">
      <Banner>Joined Circles includes memberships from your signed-in account. My Circle and all fictional persona, invitation, approval, leave, availability and pickup controls remain Demo data. Demo actions do not change your account.</Banner>
      <SectionHeading title="Fictional demo persona" />
      <Seg<DemoActor["id"]>
        cur={personaId}
        onPick={(id) => {
          setPersonaId(id);
          setInvitationOpen(false);
          closeAddModal();
          setTimePickerPurpose(null);
          setApprovalNoticeVisible(false);
          setNotice("");
        }}
        opts={DEMO_PERSONAS.map((persona) => ({ value: persona.id, label: persona.label, a11y: `Preview as ${persona.name}, fictional ${persona.isAdmin ? "administrator" : "helper"}` }))}
      />
      <T s={0.85} c="muted">Generate and approve as Abu. Switch to Siti to inspect the same invitation membership in Demo joined circles. This selector acts out fictional roles; it does not switch your authenticated account or change your account's joined circles.</T>
      <Seg<"my" | "joined">
        cur={circleTab}
        onPick={(tab) => { setCircleTab(tab); setInvitationOpen(false); }}
        opts={[
          { value: "my", label: "MY CIRCLE", a11y: "My Circle" },
          { value: "joined", label: "JOINED CIRCLES", a11y: "Joined Circles" },
        ]}
      />
      {circleTab === "joined" ? (
        <>
        <SectionHeading title="Your account's joined circles" />
        <AccountJoinedCircles />
        <SectionHeading title="Demo joined circles" />
        <JoinedCircles
          key={`joined-circles:${demoActor.id}`}
          personaName={demoActor.name}
          memberships={circleDemo.memberships.filter((membership) => membership.userId === demoActor.id)}
          onLeave={(membershipId) => {
            dispatchCircleDemo({ type: "leave", userId: demoActor.id, membershipId });
          }}
        />
        </>
      ) : <>
      <Lead>Who can collect {mockData.child.name}. Tap a name for details.</Lead>
      {notice ? <Banner key={notice} kind="ok">{notice}</Banner> : null}

      {canInvite ? <>
        <SectionHeading title="Family invitations" />
        <Card style={{ gap: 10 }}>
          <T w={700}>Invite someone to your circle</T>
          <T c="muted">Preview a nonfunctional demo invitation and act out acceptance followed by administrator approval.</T>
          <Btn kind="s" icon="userplus" onPress={() => setInvitationOpen(true)}>Open demo invitation</Btn>
          <T s={0.8} c="muted">Abu's fictional administrator controls only. These do not represent your signed-in account's role or server authorization.</T>
        </Card>
      </> : null}

      {pendingHelpers.length > 0 ? (
        <>
          <SectionHeading title="Waiting for approval" />
          <Card tight>
            {pendingHelpers.map((helper, index) => (
              <View key={helper.id} style={{ borderTopWidth: index > 0 ? 1 : 0, borderTopColor: colors.line, paddingVertical: 12, gap: 10 }}>
                <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 8 }}>
                  <Avatar name={helper.name} size={44} />
                  <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 150, minWidth: 0 }}>
                    <T w={700}>{helper.name}</T>
                    <T s={0.84} c="muted" lh={1.35}>
                      {helper.role}
                      {"age" in helper ? ` · Age ${helper.age}` : ""}
                      {` · ${getContactDetail(helper)}`}
                    </T>
                  </View>
                  <StatusPill label="Pending" tone="warning" />
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Btn kind="p" sm flex label={`Approve ${helper.name}`} onPress={() => approve(helper)}>Approve</Btn>
                  <Btn kind="o" sm color={colors.danger} label={`Reject ${helper.name}`} onPress={() => reject(helper)}>Reject</Btn>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeading title="Approved to collect" />
      <Card tight>
        {approvedHelpers.length ? (
          <>
            {primaryHelpers.length > 0 ? (
              <>
                <GroupHeading>Emergency contacts</GroupHeading>
                {primaryHelpers.map((helper, index) => renderMember(helper, index, "helper"))}
              </>
            ) : null}
            {regularHelpers.length > 0 ? (
              <>
                <GroupHeading>Helpers</GroupHeading>
                {regularHelpers.map((helper, index) => renderMember(helper, index, "helper"))}
              </>
            ) : null}
          </>
        )
          : <View style={{ paddingVertical: 16 }}><T s={0.92} c="muted">No approved helpers yet.</T></View>}
      </Card>
      <SecondaryButton
        label="+ Add New Helper"
        onPress={() => setIsAddModalVisible(true)}
      />

      <SectionHeading title="Backup pickup" />
      <Card style={{ gap: 10 }}>
        <T s={1.05} w={700}>{backupPickupRequest ? "Backup request" : "Need someone else to collect?"}</T>
        {!backupPickupRequest ? <T c="muted" lh={1.4}>Ask all available helpers at once.</T> : null}
        {backupPickupRequest ? (
          <Rise key={backupPickupRequest.state} kind="swap" style={{ backgroundColor: backupPickupRequest.state === "approved" ? colors.successSoft : colors.primarySoft, borderRadius: 14, padding: 12, gap: 8 }}>
            <StatusPill
              label={backupPickupRequest.state === "approved" ? "Accepted" : "Waiting"}
              tone={backupPickupRequest.state === "approved" ? "success" : "warning"}
            />
            <T s={0.9} c={colors.primaryInk} lh={1.4}>
              {backupPickupRequest.state === "approved"
                ? `${backupPickupRequest.approvedBy ?? "A helper"} will collect at ${backupPickupRequest.pickupTime}.`
                : `Asked ${backupPickupRequest.recipientIds.length} helper${backupPickupRequest.recipientIds.length === 1 ? "" : "s"} for ${backupPickupRequest.pickupTime}.`}
            </T>
            {backupPickupRequest.state === "pending" && backupPickupRequest.recipientIds.length > 0 ? (
              <>
                <T s={0.85} w={700} c="muted">Simulate a helper's answer:</T>
                {approvedHelpers
                  .filter((helper) => backupPickupRequest.recipientIds.includes(helper.id))
                  .map((helper) => (
                    <Btn
                      key={helper.id}
                      kind="dash"
                      label={`Simulate ${helper.name} approving the pickup request`}
                      onPress={() => simulateHelperApproval(helper)}
                    >
                      {`Simulate ${helper.name} Approval`}
                    </Btn>
                  ))}
              </>
            ) : null}
          </Rise>
        ) : null}
        <PrimaryButton
          label={backupPickupRequest?.state === "pending" ? "Send another backup request" : "Request backup pickup"}
          onPress={() => openTimePicker("backup")}
          disabled={availableHelpers.length === 0}
        />
        {availableHelpers.length === 0 ? (
          <T s={0.85} c="muted" align="center">No approved helpers are currently available.</T>
        ) : null}
      </Card>

      <SectionHeading title="Family" />
      <Card tight>
        {familyMembers.map((member, index) => renderMember(
          member,
          index,
          "family",
        ))}
      </Card>
      <T s={0.78} lh={1.4} c="muted" align="center">Simulated demo. Contacts and availability are sample data.</T>

      <Sheet visible={isAddModalVisible} onClose={closeAddModal} title="Invite a helper" closeLabel="Close add helper dialog">
        <T c="muted" lh={1.4}>
          Enter their details to create a simulated invitation. They will appear as pending until approved.
        </T>
        <Field label="Name">
          <Input
            accessibilityLabel="Helper name"
            autoCapitalize="words"
            onChangeText={setNewHelperName}
            returnKeyType="next"
            value={newHelperName}
          />
        </Field>
        <Field label="Age">
          <Input
            accessibilityLabel="Helper age"
            keyboardType="number-pad"
            onChangeText={(value) => setNewHelperAge(value.replace(/[^0-9]/g, ""))}
            returnKeyType="next"
            value={newHelperAge}
          />
        </Field>
        <Field label="Relationship to the child">
          <Input
            accessibilityLabel="Helper relationship to the child"
            autoCapitalize="words"
            onChangeText={setNewHelperRole}
            returnKeyType="next"
            value={newHelperRole}
          />
        </Field>
        <Field label="Phone number (optional)">
          <Input
            accessibilityLabel="Helper phone number"
            keyboardType="phone-pad"
            onChangeText={setNewHelperPhone}
            returnKeyType="done"
            value={newHelperPhone}
          />
        </Field>
        <Err text={formError} />
        <PrimaryButton
          label="Send demo invitation"
          onPress={addHelper}
          disabled={
            !newHelperName.trim()
            || !newHelperAge.trim()
            || !Number.isInteger(Number(newHelperAge))
            || !newHelperRole.trim()
          }
        />
        <T s={0.85} c="muted" align="center">Demo only · This does not send a real invitation.</T>
      </Sheet>

      <Sheet
        visible={timePickerPurpose !== null}
        onClose={() => setTimePickerPurpose(null)}
        title={timePickerPurpose === "backup" ? "Backup pickup time" : "Your pickup availability"}
        closeLabel="Close time picker"
        footer={
        <PrimaryButton
          label={timePickerPurpose === "backup" ? "Send request to available helpers" : "Save my availability"}
          onPress={saveSelectedTime}
        />
        }
      >
        <T c="muted" lh={1.4}>
          {timePickerPurpose === "backup"
            ? "Choose when the backup pickup is needed."
            : "Choose when your availability ends."}
        </T>
        <TimeWheelPicker value={selectedTime} onChange={setSelectedTime} />
        <T s={0.85} c="muted" align="center">Demo only · No real notification is sent.</T>
      </Sheet>

      <Sheet visible={approvalNoticeVisible} onClose={() => setApprovalNoticeVisible(false)} title="Pickup confirmed">
        <View style={{ alignItems: "center", gap: 14, paddingTop: 10, paddingBottom: 6 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
            <Icon name="check" size={46} color={colors.onPrimary} stroke={1.8} />
          </View>
          <T s={1.15} w={800} ls={-0.01} lh={1.3} align="center">
            {backupPickupRequest?.approvedBy ?? "Your helper"} will pick up {mockData.child.name} today!
          </T>
          <T c="muted" align="center">This confirmation is simulated for the demo.</T>
        </View>
        <PrimaryButton label="Done" onPress={() => setApprovalNoticeVisible(false)} />
      </Sheet>
      </>}
      <T s={0.8} c="muted" lh={1.4}>Invitation previews and Joined Circles survive tab and fictional persona changes, but reset on account change or screen remount. Other Circle-local forms and broadcast state also reset. Existing shared sample helper approvals remain in AppContext for this app session. No real invitations, memberships or pickup permissions are created.</T>
      <InvitationSheet
        key={`invitation-sheet:${demoActor.id}`}
        visible={circleTab === "my" && invitationOpen && canInvite}
        onClose={() => setInvitationOpen(false)}
        actor={demoActor}
        state={circleDemo}
        onGenerate={() => dispatchCircleDemo({ type: "generate", actor: demoActor })}
        onAccept={() => dispatchCircleDemo({ type: "accept", actor: demoActor })}
        onApprove={() => dispatchCircleDemo({ type: "approve", actor: demoActor })}
      />
    </AppShell>
  );

  function renderMember(
    member: FamilyMember | TrustedHelper,
    index: number,
    kind: "family" | "helper",
  ) {
    const isCollector = member.id === mockData.pickupStatus.collectorId;
    const age = "age" in member ? member.age : undefined;
    const isPrimaryContact = primaryContactIds[member.id] ?? false;
    const isAccountOwner = member.id === accountOwner.id;
    const memberAvailability = availability[member.id] ?? false;
    const availabilityTime = availabilityTimes[member.id];
    const open = openIds[member.id] ?? false;
    const summary = memberAvailability ? `Available until ${availabilityTime ?? "2:00 PM"}` : "Busy";

    return (
      <View key={member.id} style={{ borderTopWidth: index > 0 ? 1 : 0, borderTopColor: colors.line }}>
        <Press
          onPress={() => setOpenIds((current) => ({ ...current, [member.id]: !open }))}
          label={`${member.name}, ${member.role}. ${summary}. ${open ? "Hide" : "Show"} details`}
          state={{ selected: open }}
          scaleTo={0.985}
          style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 10 }}
        >
          <Avatar name={member.name} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 6 }}>
              <T w={700}>{member.name}</T>
              {isCollector ? <Tag>TODAY'S PICKUP</Tag> : null}
            </View>
            <T s={0.84} c="muted" lh={1.35}>
              {member.role}{age === undefined ? "" : ` · Age ${age}`}
            </T>
            <T s={0.84} w={600} c={memberAvailability ? colors.success : colors.muted} lh={1.35}>{summary}</T>
          </View>
          <View style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}>
            <Icon name="chev" size={18} color={colors.muted} stroke={2} />
          </View>
        </Press>
        {open ? (
          <Rise kind="swap" style={{ paddingBottom: 12, gap: 10 }}>
            <View style={{ gap: 2 }}>
              <T s={0.88} lh={1.4}>{getContactDetail(member)}</T>
              <T s={0.88} c={colors.primaryInk} lh={1.4}>{member.locationLabel ?? "Location not shared"}</T>
              {isPrimaryContact ? <View style={{ marginTop: 4, flexDirection: "row" }}><Tag kind="gold" icon="star">PRIMARY EMERGENCY CONTACT</Tag></View> : null}
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              {isAccountOwner ? (
                <>
                  <SmallBtn
                    role="switch"
                    checked={memberAvailability}
                    tone={memberAvailability ? "on" : "off"}
                    label="My pickup availability"
                    hint="Toggle your own availability for pickup."
                    onPress={toggleOwnerAvailability}
                  >
                    {memberAvailability ? "Available" : "Busy"}
                  </SmallBtn>
                  {memberAvailability ? (
                    <SmallBtn
                      tone="on"
                      label={`Set my pickup availability until ${availabilityTime ?? "3:00 PM"}`}
                      onPress={() => openTimePicker("availability")}
                    >
                      {`Until ${availabilityTime ?? "3:00 PM"} · Change`}
                    </SmallBtn>
                  ) : null}
                </>
              ) : (
                <View accessible accessibilityLabel={`${member.name} availability is read only`}>
                  <Chip kind={memberAvailability ? "ok" : "plain"} icon="lock">
                    Only {member.name} can change availability
                  </Chip>
                </View>
              )}
              <SmallBtn
                role="switch"
                checked={isPrimaryContact}
                tone={isPrimaryContact ? "gold" : "off"}
                icon="star"
                label={`${member.name} primary emergency contact`}
                hint="Toggle this person as a primary emergency contact."
                onPress={() => togglePrimaryContact(member.id)}
              >
                {isPrimaryContact ? "Primary contact" : "Make primary contact"}
              </SmallBtn>
              {kind === "helper" ? (
                <SmallBtn
                  tone="danger"
                  label={`Remove ${member.name} from trusted circle`}
                  onPress={() => removeHelper(member)}
                >
                  Remove
                </SmallBtn>
              ) : null}
            </View>
          </Rise>
        ) : null}
      </View>
    );
  }
}

function GroupHeading({ children }: { children: string }) {
  return (
    <View style={{ marginTop: 12, marginBottom: 2 }}>
      <T s={0.78} w={800} ls={0.04} up c={useColors().primaryInk}>{children}</T>
    </View>
  );
}
