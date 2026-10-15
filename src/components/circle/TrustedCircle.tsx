import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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

export function TrustedCircle() {
  const { theme, trustedHelpers, setTrustedHelperState } = useAppContext();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [notice, setNotice] = useState("");
  const [availability, setAvailability] = useState<Record<string, boolean>>({
    abu: true,
    siti: false,
    aiman: false,
    ahmad: true,
    ima: true,
    salmah: false,
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
    ...localHelpers,
  ];
  const pendingHelpers = trustedHelpers.filter((helper) => helper.state === "pending");
  const familyMembers = mockData.familyMembers;

  const approve = (helper: TrustedHelper) => {
    setTrustedHelperState(helper.id, "active");
    setNotice(`${helper.name} approved in this demo.`);
  };

  const reject = (helper: TrustedHelper) => {
    setTrustedHelperState(helper.id, "rejected");
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
    setNotice(`${helper.name} removed from the trusted circle in this demo.`);
  };

  const toggleAvailability = (personId: string) => {
    setAvailability((current) => ({ ...current, [personId]: !current[personId] }));
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
    setLocalHelpers((current) => [...current, { id: helperId, name, age, role, state: "active" }]);
    if (newHelperPhone.trim()) {
      setLocalHelperPhones((current) => ({ ...current, [helperId]: newHelperPhone.trim() }));
    }
    setAvailability((current) => ({ ...current, [helperId]: false }));
    setNotice(`${name} added as an approved helper in this demo.`);
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
          mockData.caregivers.some((caregiver) => caregiver.id === member.id && caregiver.isAdmin),
        ))}
      </Card>

      <SectionHeading title="Approved Helpers" />
      <Card style={styles.listCard}>
        {approvedHelpers.length
          ? approvedHelpers.map((helper, index) => renderMember(
            helper,
            index,
            "helper",
            helper.id === mockData.pickupStatus.collectorId,
          ))
          : <Text style={styles.empty}>No approved helpers yet.</Text>}
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
                    <Text style={styles.memberMeta}>{helper.role} · Approval requested</Text>
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
        Availability, added helpers, and removals are local demo data. No invitations or notifications are sent.
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
                <Text accessibilityRole="header" style={styles.modalTitle}>Add a helper</Text>
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
                Add a trusted person to your demo circle. They will appear as approved locally.
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
                label="Add to demo circle"
                onPress={addHelper}
                disabled={
                  !newHelperName.trim()
                  || !newHelperAge.trim()
                  || !Number.isInteger(Number(newHelperAge))
                  || !newHelperRole.trim()
                }
              />
              <Text style={styles.modalFootnote}>This does not send an invitation.</Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </AppShell>
  );

  function renderMember(
    member: FamilyMember | TrustedHelper,
    index: number,
    kind: "family" | "helper",
    isPrimaryContact: boolean,
  ) {
    const isAvailable = availability[member.id] ?? false;
    const isCollector = member.id === mockData.pickupStatus.collectorId;
    const age = "age" in member ? member.age : undefined;

    return (
      <View key={member.id}>
        {index > 0 ? <View style={styles.separator} /> : null}
        <View style={styles.memberRow}>
          <Avatar name={member.name} size={46} />
          <View style={styles.memberInfo}>
            <View style={styles.nameLine}>
              <Text style={styles.memberName}>{member.name}</Text>
              {isPrimaryContact ? <Text style={styles.primaryTag}>★ PRIMARY CONTACT</Text> : null}
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
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel={`${member.name} pickup availability`}
            accessibilityHint="Double tap to change simulated availability."
            accessibilityState={{ checked: isAvailable }}
            onPress={() => toggleAvailability(member.id)}
            style={({ pressed }) => [
              styles.availabilityButton,
              isAvailable ? styles.availableButton : styles.unavailableButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.availabilityText, isAvailable && styles.availableText]}>
              {isAvailable ? "Available at 2:00 PM" : "Unavailable"}
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
});
