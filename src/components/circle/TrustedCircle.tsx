import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { AppShell } from "../shared/AppShell";
import { useAppContext } from "../shared/AppContext";
import { Avatar } from "../shared/Avatar";
import { Card } from "../shared/Card";
import { PrimaryButton } from "../shared/PrimaryButton";
import { SecondaryButton } from "../shared/SecondaryButton";
import { SectionHeading } from "../shared/SectionHeading";
import { StatusPill } from "../shared/StatusPill";
import { mockData } from "../shared/mockData";
import type { FamilyMember, TrustedHelper } from "../shared/types";
import type { ThemeTokens } from "../shared/theme";

type LocalTrustedHelper = TrustedHelper & { age: number };

type TimePickerPurpose = "backup" | "availability";
type LocalBackupPickupRequest = {
  pickupTime: string;
  recipientIds: string[];
  state: "pending" | "approved";
  approvedBy?: string;
};

const wheelItemHeight = 40;

export function TrustedCircle() {
  const { theme, selectedCaregiver, trustedHelpers, setTrustedHelperState } = useAppContext();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [notice, setNotice] = useState("");
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

  const approvedHelpers = [
    ...trustedHelpers.filter((helper) => helper.state === "active"),
    ...localHelpers.filter((helper) => helper.state === "active"),
  ];
  const pendingHelpers = [
    ...trustedHelpers.filter((helper) => helper.state === "pending"),
    ...localHelpers.filter((helper) => helper.state === "pending"),
  ];
  const familyMembers = mockData.familyMembers;
  const accountOwner = selectedCaregiver ?? mockData.caregivers[0];
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
    if (caregiver) return caregiver.phone;
    if (member.id === "aiman") return "+60 11-3344 5566";
    return localHelperPhones[member.id] ?? "Phone not shared";
  };

  return (
    <AppShell title="Trusted Circle" badge="Circle" activeTab="circle">
      <Text style={styles.lead}>Your family and approved helpers for school pickup.</Text>
      <View style={styles.demoNotice}>
        <View style={styles.demoDot} />
        <Text style={styles.demoText}>
          Demo contacts · Pickup availability and contact details are simulated
        </Text>
      </View>
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.actionNotice}>{notice}</Text> : null}

      <SectionHeading title="Family Members" />
      <Card style={styles.listCard}>
        {familyMembers.map((member, index) => renderMember(
          member,
          index,
          "family",
        ))}
      </Card>

      <SectionHeading title="Approved Helpers" />
      <Card style={styles.listCard}>
        {approvedHelpers.length ? (
          <>
            {primaryHelpers.length > 0 ? (
              <>
                <Text style={styles.groupHeading}>Primary Emergency Contacts</Text>
                {primaryHelpers.map((helper, index) => renderMember(helper, index, "helper"))}
              </>
            ) : null}
            {regularHelpers.length > 0 ? (
              <>
                <Text style={styles.groupHeading}>Regular Helpers</Text>
                {regularHelpers.map((helper, index) => renderMember(helper, index, "helper"))}
              </>
            ) : null}
          </>
        )
          : <Text style={styles.empty}>No approved helpers yet.</Text>}
      </Card>
      <Card style={styles.requestCard}>
        <Text style={styles.requestHeading}>Backup pickup</Text>
        <Text style={styles.modalDescription}>
          Send a simulated request to every approved helper who is currently available.
        </Text>
        {backupPickupRequest ? (
          <View style={styles.broadcastNotice}>
            <StatusPill
              label={backupPickupRequest.state === "approved" ? "Helper accepted" : "Request sent"}
              tone={backupPickupRequest.state === "approved" ? "success" : "warning"}
            />
            <Text style={styles.broadcastText}>
              Pickup requested for {backupPickupRequest.pickupTime}. Alerts sent to{" "}
              {backupPickupRequest.recipientIds.length} available helper
              {backupPickupRequest.recipientIds.length === 1 ? "" : "s"}.
            </Text>
            {backupPickupRequest.state === "pending" && backupPickupRequest.recipientIds.length > 0 ? (
              <>
                <Text style={styles.demoActionLabel}>Simulate a helper response:</Text>
                {approvedHelpers
                  .filter((helper) => backupPickupRequest.recipientIds.includes(helper.id))
                  .map((helper) => (
                    <Pressable
                      key={helper.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Simulate ${helper.name} approving the pickup request`}
                      onPress={() => simulateHelperApproval(helper)}
                      style={({ pressed }) => [styles.simulateButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.simulateButtonText}>Simulate {helper.name} Approval</Text>
                    </Pressable>
                  ))}
              </>
            ) : null}
          </View>
        ) : null}
        <PrimaryButton
          label={backupPickupRequest?.state === "pending" ? "Send another backup request" : "Request backup pickup"}
          onPress={() => openTimePicker("backup")}
          disabled={availableHelpers.length === 0}
        />
        {availableHelpers.length === 0 ? (
          <Text style={styles.modalFootnote}>No approved helpers are currently available.</Text>
        ) : null}
      </Card>

      {pendingHelpers.length > 0 ? (
        <>
          <SectionHeading title="Pending Helper Approvals" />
          <Card style={styles.listCard}>
            {pendingHelpers.map((helper, index) => (
              <View key={helper.id}>
                {index > 0 ? <View style={styles.separator} /> : null}
                <View style={styles.memberRow}>
                  <Avatar name={helper.name} size={46} />
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{helper.name}</Text>
                    <Text style={styles.memberMeta}>
                      {helper.role}
                      {"age" in helper ? ` · Age ${helper.age}` : ""}
                      {" · Invitation sent · Approval requested"}
                    </Text>
                    <Text style={styles.contact}>{getContactDetail(helper)}</Text>
                  </View>
                  <StatusPill label="Pending" tone="warning" />
                </View>
                <Text style={styles.parentNote}>
                  A parent must approve this helper before pickup.
                </Text>
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Approve ${helper.name}`}
                    onPress={() => approve(helper)}
                    style={({ pressed }) => [styles.approveButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.approveText}>Approve</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Reject ${helper.name}`}
                    onPress={() => reject(helper)}
                    style={({ pressed }) => [styles.rejectButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.rejectText}>Reject</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SecondaryButton
        label="+ Add New Helper"
        onPress={() => setIsAddModalVisible(true)}
      />
      <Text style={styles.footerNote}>
      Helper records and approval decisions use local demo state only. Invitations are simulated; no database or notifications are connected.
      </Text>

      <Modal
        visible={isAddModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeAddModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalRoot}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text accessibilityRole="header" style={styles.modalTitle}>Invite a helper</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close add helper dialog"
                  onPress={closeAddModal}
                  hitSlop={8}
                >
                  <Text style={styles.closeText}>Close</Text>
                </Pressable>
              </View>
              <Text style={styles.modalDescription}>
                Enter their details to create a simulated invitation. They will appear as pending until approved.
              </Text>
              <TextInput
                accessibilityLabel="Helper name"
                autoCapitalize="words"
                onChangeText={setNewHelperName}
                placeholder="Name"
                placeholderTextColor={theme.colors.muted}
                returnKeyType="next"
                style={styles.input}
                value={newHelperName}
              />
              <TextInput
                accessibilityLabel="Helper age"
                keyboardType="number-pad"
                onChangeText={(value) => setNewHelperAge(value.replace(/[^0-9]/g, ""))}
                placeholder="Age"
                placeholderTextColor={theme.colors.muted}
                returnKeyType="next"
                style={styles.input}
                value={newHelperAge}
              />
              <TextInput
                accessibilityLabel="Helper relationship to the child"
                autoCapitalize="words"
                onChangeText={setNewHelperRole}
                placeholder="Relationship to the child"
                placeholderTextColor={theme.colors.muted}
                returnKeyType="next"
                style={styles.input}
                value={newHelperRole}
              />
              <TextInput
                accessibilityLabel="Helper phone number"
                keyboardType="phone-pad"
                onChangeText={setNewHelperPhone}
                placeholder="Phone number (optional)"
                placeholderTextColor={theme.colors.muted}
                returnKeyType="done"
                style={styles.input}
                value={newHelperPhone}
              />
              {formError ? <Text accessibilityLiveRegion="polite" style={styles.formError}>{formError}</Text> : null}
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
              <Text style={styles.modalFootnote}>Demo only · This does not send a real invitation.</Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal
        visible={timePickerPurpose !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setTimePickerPurpose(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text accessibilityRole="header" style={styles.modalTitle}>
                {timePickerPurpose === "backup" ? "Backup pickup time" : "Your pickup availability"}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close time picker"
                onPress={() => setTimePickerPurpose(null)}
                hitSlop={8}
              >
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.modalDescription}>
              {timePickerPurpose === "backup"
                ? "Choose when the backup pickup is needed."
                : "Choose when your availability ends."}
            </Text>
            <TimeWheelPicker value={selectedTime} onChange={setSelectedTime} theme={theme} />
            <PrimaryButton
              label={timePickerPurpose === "backup" ? "Send request to available helpers" : "Save my availability"}
              onPress={saveSelectedTime}
            />
            <Text style={styles.modalFootnote}>Demo only · No real notification is sent.</Text>
          </View>
        </View>
      </Modal>
      <Modal
        visible={approvalNoticeVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setApprovalNoticeVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <StatusPill label="Pickup confirmed" tone="success" />
            <Text accessibilityRole="header" style={styles.confirmationTitle}>
              {backupPickupRequest?.approvedBy ?? "Your helper"} will pick up {mockData.child.name} today!
            </Text>
            <Text style={styles.modalDescription}>
              This confirmation is simulated for the demo.
            </Text>
            <PrimaryButton label="Done" onPress={() => setApprovalNoticeVisible(false)} />
          </View>
        </View>
      </Modal>
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

    return (
      <View key={member.id}>
        {index > 0 ? <View style={styles.separator} /> : null}
        <View style={styles.memberRow}>
          <Avatar name={member.name} size={46} />
          <View style={styles.memberInfo}>
            <View style={styles.nameLine}>
              <Text style={styles.memberName}>{member.name}</Text>
              {isPrimaryContact ? <Text style={styles.primaryTag}>★ PRIMARY EMERGENCY CONTACT</Text> : null}
              {isCollector ? <Text style={styles.collectorTag}>TODAY'S PICKUP</Text> : null}
            </View>
            <Text style={styles.memberMeta}>
              {member.role}{age === undefined ? "" : ` · Age ${age}`}
            </Text>
            <Text style={styles.contact}>{getContactDetail(member)}</Text>
            <Text style={styles.location}>{member.locationLabel ?? "Location not shared"}</Text>
          </View>
        </View>
        <View style={styles.memberFooter}>
          <StatusPill label={kind === "helper" ? "Approved helper" : "Family"} tone="success" />
          {isAccountOwner ? (
            <>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel="My pickup availability"
                accessibilityHint="Toggle your own availability for pickup."
                accessibilityState={{ checked: memberAvailability }}
                onPress={toggleOwnerAvailability}
                style={({ pressed }) => [
                  styles.availabilityButton,
                  memberAvailability ? styles.availableButton : styles.unavailableButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.availabilityText, memberAvailability && styles.availableText]}>
                  {memberAvailability ? "Available" : "Busy"}
                </Text>
              </Pressable>
              {memberAvailability ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Set my pickup availability until ${availabilityTime ?? "3:00 PM"}`}
                  onPress={() => openTimePicker("availability")}
                  style={({ pressed }) => [styles.availabilityButton, styles.availableButton, pressed && styles.pressed]}
                >
                  <Text style={[styles.availabilityText, styles.availableText]}>
                    Until {availabilityTime ?? "3:00 PM"} · Set
                  </Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <View accessibilityLabel={`${member.name} availability is read only`} style={styles.readOnlyAvailability}>
              <Text style={styles.lockIcon}>🔒</Text>
              <Text style={[styles.availabilityText, memberAvailability && styles.availableText]}>
                {memberAvailability
                  ? `Available · Until ${availabilityTime ?? "2:00 PM"}`
                  : "Busy · Not available"}
              </Text>
            </View>
          )}
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={`${member.name} primary emergency contact`}
            accessibilityHint="Toggle this person as a primary emergency contact."
            accessibilityState={{ checked: isPrimaryContact }}
            onPress={() => togglePrimaryContact(member.id)}
            style={({ pressed }) => [
              styles.primaryToggle,
              isPrimaryContact && styles.primaryToggleActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.primaryToggleText, isPrimaryContact && styles.primaryToggleActiveText]}>
              {isPrimaryContact ? "★ Primary" : "☆ Set primary"}
            </Text>
          </Pressable>
          {kind === "helper" ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${member.name} from trusted circle`}
              onPress={() => removeHelper(member)}
              style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}
            >
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }
}

const makeStyles = (theme: ThemeTokens) => StyleSheet.create({
  lead: {
    color: theme.colors.muted,
    fontSize: theme.type.body * theme.textScale,
    lineHeight: 21 * theme.textScale,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  demoNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.control,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  demoDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.primary },
  demoText: {
    flex: 1,
    color: theme.colors.primaryInk,
    fontSize: theme.type.small * theme.textScale,
    fontWeight: "600",
  },
  actionNotice: {
    color: theme.colors.success,
    fontSize: theme.type.small * theme.textScale,
    fontWeight: "700",
    marginBottom: theme.spacing.sm,
  },
  listCard: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  groupHeading: {
    color: theme.colors.primaryInk,
    fontSize: theme.type.small * theme.textScale,
    fontWeight: "800",
    letterSpacing: 0.4,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  requestCard: { marginTop: theme.spacing.xs, marginBottom: theme.spacing.md, gap: theme.spacing.sm },
  requestHeading: {
    color: theme.colors.ink,
    fontSize: theme.type.body * theme.textScale,
    fontWeight: "800",
  },
  broadcastNotice: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: theme.radius.control,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  broadcastText: {
    color: theme.colors.primaryInk,
    fontSize: theme.type.small * theme.textScale,
    lineHeight: 17 * theme.textScale,
  },
  demoActionLabel: {
    color: theme.colors.muted,
    fontSize: theme.type.small * theme.textScale,
    fontWeight: "700",
    marginTop: theme.spacing.xs,
  },
  simulateButton: {
    minHeight: 40,
    borderRadius: theme.radius.control,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.card,
  },
  simulateButtonText: {
    color: theme.colors.primaryInk,
    fontSize: theme.type.small * theme.textScale,
    fontWeight: "700",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  memberInfo: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  memberName: {
    color: theme.colors.ink,
    fontSize: theme.type.body * theme.textScale,
    fontWeight: "800",
  },
  primaryTag: {
    color: theme.colors.warningInk,
    backgroundColor: theme.colors.warning,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 3,
    fontSize: 8 * theme.textScale,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  collectorTag: {
    color: theme.colors.primaryInk,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 3,
    fontSize: 8 * theme.textScale,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  memberMeta: {
    color: theme.colors.muted,
    fontSize: theme.type.small * theme.textScale,
    marginTop: 3,
  },
  contact: {
    color: theme.colors.ink,
    fontSize: theme.type.small * theme.textScale,
    marginTop: 3,
  },
  location: {
    color: theme.colors.primaryInk,
    fontSize: theme.type.small * theme.textScale,
    marginTop: 3,
  },
  memberFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
  },
  availabilityButton: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    borderWidth: 1,
  },
  availableButton: { backgroundColor: theme.colors.successSoft, borderColor: theme.colors.successSoft },
  unavailableButton: { backgroundColor: theme.colors.card, borderColor: theme.colors.line },
  availabilityText: {
    color: theme.colors.muted,
    fontSize: theme.type.small * theme.textScale,
    fontWeight: "700",
  },
  availableText: { color: theme.colors.success },
  readOnlyAvailability: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xxs,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.line,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  lockIcon: { fontSize: theme.type.small * theme.textScale },
  primaryToggle: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  primaryToggleActive: {
    backgroundColor: theme.colors.warning,
    borderColor: theme.colors.warning,
  },
  primaryToggleText: {
    color: theme.colors.muted,
    fontSize: theme.type.small * theme.textScale,
    fontWeight: "700",
  },
  primaryToggleActiveText: { color: theme.colors.warningInk },
  separator: { height: 1, backgroundColor: theme.colors.line },
  empty: {
    color: theme.colors.muted,
    fontSize: theme.type.body * theme.textScale,
    paddingVertical: theme.spacing.md,
  },
  parentNote: {
    color: theme.colors.warningInk,
    backgroundColor: theme.colors.warning,
    borderRadius: 12,
    padding: theme.spacing.sm,
    fontSize: theme.type.small * theme.textScale,
    lineHeight: 16 * theme.textScale,
    marginBottom: theme.spacing.sm,
  },
  actions: { flexDirection: "row", gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  approveButton: {
    flex: 1,
    minHeight: 44,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.control,
    alignItems: "center",
    justifyContent: "center",
  },
  approveText: {
    color: theme.colors.onPrimary,
    fontSize: theme.type.small * theme.textScale,
    fontWeight: "800",
  },
  rejectButton: {
    minWidth: 92,
    minHeight: 44,
    borderWidth: 1,
    borderColor: theme.colors.line,
    borderRadius: theme.radius.control,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.card,
  },
  rejectText: {
    color: theme.colors.danger,
    fontSize: theme.type.small * theme.textScale,
    fontWeight: "800",
  },
  removeButton: {
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.pill,
    paddingHorizontal: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerSoft,
  },
  removeText: {
    color: theme.colors.danger,
    fontSize: theme.type.small * theme.textScale,
    fontWeight: "700",
  },
  pressed: { opacity: 0.78 },
  footerNote: {
    color: theme.colors.muted,
    fontSize: theme.type.small * theme.textScale,
    textAlign: "center",
    lineHeight: 16 * theme.textScale,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  modalRoot: { flex: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.48)",
    justifyContent: "center",
    padding: theme.spacing.lg,
  },
  modalCard: {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.card,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  modalTitle: {
    color: theme.colors.ink,
    fontSize: theme.type.body * theme.textScale * 1.2,
    fontWeight: "800",
  },
  closeText: {
    color: theme.colors.primaryInk,
    fontSize: theme.type.small * theme.textScale,
    fontWeight: "700",
  },
  modalDescription: {
    color: theme.colors.muted,
    fontSize: theme.type.small * theme.textScale,
    lineHeight: 17 * theme.textScale,
    marginBottom: theme.spacing.xs,
  },
  input: {
    minHeight: 48,
    borderColor: theme.colors.line,
    borderWidth: 1,
    borderRadius: theme.radius.control,
    color: theme.colors.ink,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.type.body * theme.textScale,
  },
  formError: {
    color: theme.colors.danger,
    fontSize: theme.type.small * theme.textScale,
    lineHeight: 16 * theme.textScale,
  },
  modalFootnote: {
    color: theme.colors.muted,
    fontSize: theme.type.small * theme.textScale,
    textAlign: "center",
  },
  confirmationTitle: {
    color: theme.colors.ink,
    fontSize: theme.type.body * theme.textScale * 1.2,
    fontWeight: "800",
    lineHeight: 26 * theme.textScale,
    marginVertical: theme.spacing.sm,
  },
});

type TimeWheelPickerProps = {
  value: string;
  onChange: (value: string) => void;
  theme: ThemeTokens;
};

type WheelColumnProps = {
  label: string;
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  theme: ThemeTokens;
};

function TimeWheelPicker({ value, onChange, theme }: TimeWheelPickerProps) {
  const styles = makeWheelStyles(theme);
  const [time, period = "PM"] = value.split(" ");
  const [hourText = "2", minuteText = "30"] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const hours = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
  const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
  const periods = ["AM", "PM"];

  const updateTime = (nextHour: number, nextMinute: number, nextPeriod: string) => {
    onChange(`${nextHour}:${String(nextMinute).padStart(2, "0")} ${nextPeriod}`);
  };

  return (
    <View style={styles.picker}>
      <WheelColumn
        label="Hour"
        items={hours}
        selectedIndex={Math.max(0, Math.min(hours.length - 1, ((hour || 12) + 11) % 12))}
        onSelect={(index) => updateTime(index === 11 ? 12 : index + 1, minute, period)}
        theme={theme}
      />
      <Text style={styles.colon}>:</Text>
      <WheelColumn
        label="Minute"
        items={minutes}
        selectedIndex={Math.max(0, Math.min(minutes.length - 1, minute))}
        onSelect={(index) => updateTime(hour || 12, index, period)}
        theme={theme}
      />
      <WheelColumn
        label="Period"
        items={periods}
        selectedIndex={period === "AM" ? 0 : 1}
        onSelect={(index) => updateTime(hour || 12, minute, periods[index])}
        theme={theme}
      />
    </View>
  );
}

function WheelColumn({ label, items, selectedIndex, onSelect, theme }: WheelColumnProps) {
  const styles = makeWheelStyles(theme);
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollToSelected = useCallback(() => {
    scrollRef.current?.scrollTo({ y: selectedIndex * wheelItemHeight, animated: false });
  }, [selectedIndex]);

  useEffect(() => {
    scrollToSelected();
  }, [scrollToSelected]);

  return (
    <View style={styles.column}>
      <Text style={styles.columnLabel}>{label}</Text>
      <View style={styles.wheelViewport}>
        <ScrollView
          ref={scrollRef}
          bounces={false}
          decelerationRate="fast"
          onLayout={scrollToSelected}
          onMomentumScrollEnd={(event) => {
            const index = Math.round(event.nativeEvent.contentOffset.y / wheelItemHeight);
            onSelect(Math.max(0, Math.min(items.length - 1, index)));
          }}
          showsVerticalScrollIndicator={false}
          snapToInterval={wheelItemHeight}
          contentContainerStyle={styles.wheelContent}
        >
          {items.map((item, index) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: index === selectedIndex }}
              key={item}
              onPress={() => onSelect(index)}
              style={styles.wheelItem}
            >
              <Text style={[styles.wheelItemText, index === selectedIndex && styles.wheelItemSelected]}>
                {item}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View pointerEvents="none" style={styles.selectedIndicator} />
      </View>
    </View>
  );
}

const makeWheelStyles = (theme: ThemeTokens) => StyleSheet.create({
  picker: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
  },
  column: { flex: 1, minWidth: 0, alignItems: "center" },
  columnLabel: {
    color: theme.colors.muted,
    fontSize: theme.type.small * theme.textScale,
    fontWeight: "700",
    marginBottom: theme.spacing.xs,
  },
  wheelViewport: {
    width: "100%",
    height: wheelItemHeight * 3,
    overflow: "hidden",
    position: "relative",
  },
  wheelContent: { paddingVertical: wheelItemHeight },
  wheelItem: {
    height: wheelItemHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  wheelItemText: {
    color: theme.colors.muted,
    fontSize: theme.type.body * theme.textScale,
    fontWeight: "600",
  },
  wheelItemSelected: { color: theme.colors.primaryInk, fontWeight: "800" },
  selectedIndicator: {
    position: "absolute",
    top: wheelItemHeight,
    left: 0,
    right: 0,
    height: wheelItemHeight,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.primarySoft,
    opacity: 0.5,
  },
  colon: {
    color: theme.colors.ink,
    fontSize: theme.type.body * theme.textScale,
    fontWeight: "800",
    paddingBottom: wheelItemHeight * 1.3,
  },
});
