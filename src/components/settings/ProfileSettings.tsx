import { useEffect, useMemo, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";

import { Icon } from "../navigation/Icon";
import { AppShell } from "../shared/AppShell";
import { useAppContext } from "../shared/AppContext";
import { Avatar } from "../shared/Avatar";
import { Card } from "../shared/Card";
import { PrimaryButton } from "../shared/PrimaryButton";
import { SecondaryButton } from "../shared/SecondaryButton";
import { SectionHeading } from "../shared/SectionHeading";
import { StatusPill } from "../shared/StatusPill";
import { mockData } from "../shared/mockData";
import type { Caregiver } from "../shared/types";
import type { TextScale, ThemeMode, ThemeTokens } from "../shared/theme";
import { SchoolPreferences } from "./SchoolPreferences";

type LocalAccount = Caregiver & {
  password: string;
  photoUri: string | null;
};

type AccountDraft = Pick<Caregiver, "name" | "phone" | "email" | "role"> & {
  password: string;
  photoUri: string | null;
};

type FontStyle = "serif" | "workSans" | "antic" | "balloonBold";
type AccordionKey = "account" | "appearance" | "notifications" | "family" | "security" | "privacy";
type ModalKind = "addAccount" | "editAccount" | "forgotPassword" | null;
type PhotoTarget = "active" | "new" | "edit";
type PushPreferenceKey = "pickupReminder" | "helperAvailability" | "systemAlerts";
type PasskeyMethod = "devicePin" | "faceId" | "fingerprint";

const pushNotificationOptions: {
  key: PushPreferenceKey;
  label: string;
  description: string;
}[] = [
  {
    key: "pickupReminder",
    label: "Pickup Hour Reminder",
    description: "Get an alert when school pickup time is drawing near.",
  },
  {
    key: "helperAvailability",
    label: "Helper Availability Updates",
    description: "Get an alert when a helper accepts or becomes available.",
  },
  {
    key: "systemAlerts",
    label: "App System Alerts",
    description: "Receive simulated notices about maintenance and security updates.",
  },
];

const passkeyMethods: { value: PasskeyMethod; label: string; icon: string }[] = [
  { value: "devicePin", label: "Device Password / PIN", icon: "phone" },
  { value: "faceId", label: "Face ID / Face Unlock", icon: "face" },
  { value: "fingerprint", label: "Fingerprint", icon: "finger" },
];

const fontOptions: { value: FontStyle; label: string; sample: string }[] = [
  { value: "serif", label: "Serif", sample: "Georgia" },
  { value: "workSans", label: "Work Sans", sample: "Sans" },
  { value: "antic", label: "Antic", sample: "Light" },
  { value: "balloonBold", label: "Balloon Bold", sample: "Bold" },
];

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System / Auto" },
];

const textScaleOptions: { value: TextScale; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "default", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "extraLarge", label: "Extra Large" },
];

const accordionOptions: { key: AccordionKey; title: string; icon: string }[] = [
  { key: "account", title: "Account", icon: "me" },
  { key: "appearance", title: "Appearance", icon: "look" },
  { key: "notifications", title: "Notifications", icon: "bell" },
  { key: "family", title: "Family and school", icon: "school" },
  { key: "security", title: "Passkey & Security", icon: "key" },
  { key: "privacy", title: "Privacy", icon: "lock" },
];

const defaultAccounts: LocalAccount[] = mockData.caregivers.map((caregiver) => ({
  ...caregiver,
  password: "demo-password",
  photoUri: null,
}));

export function ProfileSettings() {
  const {
    theme,
    themeMode,
    setThemeMode,
    textScale,
    setTextScale,
    selectedCaregiver,
    selectCaregiver,
    trustedHelpers,
  } = useAppContext();
  const [accounts, setAccounts] = useState(defaultAccounts);
  const [activeAccountId, setActiveAccountId] = useState(
    selectedCaregiver?.id ?? defaultAccounts[0].id,
  );
  const [expandedSection, setExpandedSection] = useState<AccordionKey | null>(null);
  const [fontStyle, setFontStyle] = useState<FontStyle>("workSans");
  const [showPassword, setShowPassword] = useState(false);
  const [pushNotifications, setPushNotifications] = useState<Record<PushPreferenceKey, boolean>>({
    pickupReminder: true,
    helperAvailability: true,
    systemAlerts: true,
  });
  const [notificationBanner, setNotificationBanner] = useState<string | null>(null);
  const [passkeyEnabled, setPasskeyEnabled] = useState(false);
  const [passkeyMethod, setPasskeyMethod] = useState<PasskeyMethod>("faceId");
  const [modalKind, setModalKind] = useState<ModalKind>(null);
  const [feedback, setFeedback] = useState("");
  const [formError, setFormError] = useState("");
  const [draft, setDraft] = useState<AccountDraft>({
    name: "",
    phone: "",
    email: "",
    role: "",
    password: "",
    photoUri: null,
  });
  const [resetChannel, setResetChannel] = useState<"SMS" | "Email">("SMS");
  const [pinSent, setPinSent] = useState(false);
  const [pin, setPin] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const activeAccount = accounts.find((account) => account.id === activeAccountId)
    ?? accounts[0];
  const styles = useMemo(
    () => makeStyles(theme, fontStyle),
    [theme, fontStyle],
  );
  const approvedHelpers = trustedHelpers.filter((helper) => helper.state === "active").length;
  const { child, school, familyMembers } = mockData;

  useEffect(() => {
    if (selectedCaregiver && accounts.some((account) => account.id === selectedCaregiver.id)) {
      setActiveAccountId(selectedCaregiver.id);
    }
  }, [accounts, selectedCaregiver]);

  const updateDraft = (key: keyof AccountDraft, value: string | null) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFormError("");
  };

  const choosePhoto = async (target: PhotoTarget) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setFeedback("Photo access was not granted. Update your device permission to choose a photo.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      const selectedPhoto = result.assets?.[0]?.uri;
      if (result.canceled || !selectedPhoto) return;

      if (target === "active") {
        setAccounts((current) => current.map((account) => (
          account.id === activeAccount.id ? { ...account, photoUri: selectedPhoto } : account
        )));
        setFeedback("Profile photo updated for this demo session.");
      } else {
        updateDraft("photoUri", selectedPhoto);
      }
    } catch (error) {
      setFeedback(error instanceof Error
        ? `Unable to select a photo: ${error.message}`
        : "Unable to select a photo.");
    }
  };

  const openAccountModal = (kind: "addAccount" | "editAccount") => {
    setFormError("");
    if (kind === "addAccount") {
      setDraft({ name: "", phone: "", email: "", role: "", password: "", photoUri: null });
    } else {
      setDraft({
        name: activeAccount.name,
        phone: activeAccount.phone,
        email: activeAccount.email,
        role: activeAccount.role,
        password: activeAccount.password,
        photoUri: activeAccount.photoUri,
      });
    }
    setModalKind(kind);
  };

  const saveAccountEdit = () => {
    if (!draft.name.trim() || !draft.role.trim()) {
      setFormError("Enter a name and relationship.");
      return;
    }
    if (!isValidPhone(draft.phone)) {
      setFormError("Enter a valid phone number with at least 9 digits.");
      return;
    }
    if (!isValidEmail(draft.email)) {
      setFormError("Enter a valid email address.");
      return;
    }

    const updatedAccount = {
      ...activeAccount,
      name: draft.name.trim(),
      phone: draft.phone.trim(),
      email: draft.email.trim(),
      role: draft.role.trim(),
      photoUri: draft.photoUri,
    };
    setAccounts((current) => current.map((account) => (
      account.id === activeAccount.id ? updatedAccount : account
    )));
    selectCaregiver(updatedAccount);
    setFeedback("Account details updated for this demo session.");
    setModalKind(null);
  };

  const addAccount = () => {
    if (!draft.name.trim() || !draft.password || !draft.role.trim()) {
      setFormError("Enter a full name, password, and relationship.");
      return;
    }
    if (!isValidPhone(draft.phone)) {
      setFormError("Enter a valid phone number with at least 9 digits.");
      return;
    }
    if (!isValidEmail(draft.email)) {
      setFormError("Enter a valid email address.");
      return;
    }

    const newAccount: LocalAccount = {
      id: `local-${Date.now()}`,
      name: draft.name.trim(),
      password: draft.password,
      phone: draft.phone.trim(),
      role: draft.role.trim(),
      email: draft.email.trim(),
      photoUri: draft.photoUri,
      isAdmin: false,
    };
    setAccounts((current) => [...current, newAccount]);
    setActiveAccountId(newAccount.id);
    selectCaregiver(newAccount);
    setFeedback(`${newAccount.name} added and selected for this demo session.`);
    setModalKind(null);
  };

  const switchAccount = (account: LocalAccount) => {
    setActiveAccountId(account.id);
    selectCaregiver(account);
    setShowPassword(false);
    setFeedback(`Switched to ${account.name}.`);
  };

  const closeModal = () => {
    setModalKind(null);
    setFormError("");
    setPinSent(false);
    setPin("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const sendResetPin = () => {
    setPinSent(true);
    setFeedback(`Demo verification PIN sent by ${resetChannel} to ${resetChannel === "SMS" ? activeAccount.phone : activeAccount.email}.`);
  };

  const resetPassword = () => {
    if (pin !== "123456") {
      setFormError("That demo PIN is incorrect. Use 123456.");
      return;
    }
    if (newPassword.length < 8) {
      setFormError("Use at least 8 characters for your new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError("The passwords do not match.");
      return;
    }
    setAccounts((current) => current.map((account) => (
      account.id === activeAccount.id ? { ...account, password: newPassword } : account
    )));
    setFeedback("Password reset for this demo session.");
    closeModal();
  };

  const toggleSection = (key: AccordionKey) => {
    setExpandedSection((current) => current === key ? null : key);
  };

  return (
    <AppShell title="Settings" badge="Profile" activeTab="settings">
      <SectionHeading title="Profile and preferences" />
      <Text style={styles.lead}>Manage your account, appearance and family settings.</Text>
      {feedback ? <Text accessibilityLiveRegion="polite" style={styles.feedback}>{feedback}</Text> : null}
      {notificationBanner ? (
        <View accessibilityLiveRegion="polite" style={styles.notificationBanner}>
          <View style={styles.notificationBannerContent}>
            <Text style={styles.notificationBannerTitle}>SafeNest test alert</Text>
            <Text style={styles.notificationBannerText}>{notificationBanner}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss test notification"
            onPress={() => setNotificationBanner(null)}
            style={styles.bannerDismiss}
          >
            <Text style={styles.linkText}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.accordionList}>
        {accordionOptions.map((option) => {
          const expanded = expandedSection === option.key;
          return (
            <Card key={option.key} tight style={styles.accordionCard}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${option.title}, ${expanded ? "collapse" : "expand"}`}
                accessibilityState={{ expanded }}
                onPress={() => toggleSection(option.key)}
                style={({ pressed }) => [styles.accordionHeader, pressed && styles.pressed]}
              >
                <View style={styles.categoryIcon}>
                  <Icon name={option.icon} size={20} color={theme.colors.primaryInk} />
                </View>
                <Text style={styles.categoryTitle}>{option.title}</Text>
                <View style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}>
                  <Icon name="chev" size={18} color={theme.colors.muted} />
                </View>
              </Pressable>
              {expanded ? (
                <View style={styles.accordionContent}>
                  {option.key === "account" ? (
                    <View>
                      <View style={styles.profileHeader}>
                        <Avatar name={activeAccount.name} imageUri={activeAccount.photoUri ?? undefined} size={70} />
                        <View style={styles.profileSummary}>
                          <Text style={styles.profileName}>{activeAccount.name}</Text>
                          <Text style={styles.mutedText}>{activeAccount.role}</Text>
                          <StatusPill label="Active account" tone="success" />
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Change profile photo"
                          onPress={() => void choosePhoto("active")}
                          style={({ pressed }) => [styles.photoButton, pressed && styles.pressed]}
                        >
                          <Icon name="camera" size={18} color={theme.colors.primaryInk} />
                        </Pressable>
                      </View>
                      <Text style={styles.photoHint}>Choose or update a profile photo from your gallery.</Text>
                      <DetailRow label="Name" value={activeAccount.name} styles={styles} />
                      <DetailRow label="Phone number" value={activeAccount.phone} styles={styles} />
                      <DetailRow label="Email" value={activeAccount.email} styles={styles} />
                      <DetailRow label="Relationship" value={activeAccount.role} styles={styles} />
                      <View style={styles.passwordRow}>
                        <View style={styles.passwordInfo}>
                          <Text style={styles.detailLabel}>Password</Text>
                          <Text style={styles.detailValue}>
                            {showPassword ? activeAccount.password : "••••••••"}
                          </Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                          onPress={() => setShowPassword((visible) => !visible)}
                          style={styles.iconButton}
                        >
                          <Text style={styles.passwordToggle}>{showPassword ? "Hide" : "Show"}</Text>
                        </Pressable>
                      </View>
                      <View style={styles.inlineActions}>
                        <Pressable onPress={() => openAccountModal("editAccount")} style={styles.textAction}>
                          <Text style={styles.linkText}>Edit account details</Text>
                        </Pressable>
                        <Pressable onPress={() => { setPinSent(false); setModalKind("forgotPassword"); }} style={styles.textAction}>
                          <Text style={styles.linkText}>Forgot Password?</Text>
                        </Pressable>
                      </View>

                      <Text style={styles.subheading}>Switch account</Text>
                      {accounts.map((account) => (
                        <Pressable
                          key={account.id}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: account.id === activeAccount.id }}
                          onPress={() => switchAccount(account)}
                          style={({ pressed }) => [
                            styles.accountOption,
                            account.id === activeAccount.id && styles.accountOptionSelected,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Avatar name={account.name} imageUri={account.photoUri ?? undefined} size={38} />
                          <View style={styles.accountOptionText}>
                            <Text style={styles.accountName}>{account.name}</Text>
                            <Text style={styles.mutedText}>{account.role}</Text>
                          </View>
                          {account.id === activeAccount.id ? <StatusPill label="Active" tone="success" /> : null}
                        </Pressable>
                      ))}
                      <SecondaryButton
                        label="Add Account"
                        onPress={() => openAccountModal("addAccount")}
                        leadingIcon={<Icon name="userplus" size={19} color={theme.colors.primaryInk} />}
                      />
                      <Text style={styles.demoNote}>Demo only · Account changes stay in app memory. No account is authenticated.</Text>
                    </View>
                  ) : null}

                  {option.key === "appearance" ? (
                    <View>
                      <Text style={styles.subheading}>Theme</Text>
                      <Text style={styles.mutedText}>System / Auto follows your device appearance.</Text>
                      <ChoiceRow
                        options={themeOptions}
                        selected={themeMode}
                        onSelect={setThemeMode}
                        styles={styles}
                      />
                      <Text style={styles.subheading}>Font size</Text>
                      <ChoiceRow
                        options={textScaleOptions}
                        selected={textScale}
                        onSelect={setTextScale}
                        styles={styles}
                      />
                      <Text style={styles.subheading}>Font style</Text>
                      <View style={styles.fontChoices}>
                        {fontOptions.map((option) => {
                          const selected = fontStyle === option.value;
                          return (
                            <Pressable
                              key={option.value}
                              accessibilityRole="radio"
                              accessibilityState={{ selected }}
                              onPress={() => setFontStyle(option.value)}
                              style={({ pressed }) => [
                                styles.fontChoice,
                                selected && styles.choiceSelected,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Text style={[styles.fontChoiceLabel, { fontFamily: getFontFamily(option.value) }]}>
                                {option.label}
                              </Text>
                              <Text style={[styles.fontChoiceSample, { fontFamily: getFontFamily(option.value) }]}>
                                {option.sample}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      <View style={styles.previewCard}>
                        <Text style={styles.previewLabel}>Preview</Text>
                        <Text style={styles.previewTitle}>Pickup plan ready</Text>
                        <Text style={styles.previewText}>
                          Laila’s school pickup details are easy to read with your selected style.
                        </Text>
                      </View>
                      <Text style={styles.demoNote}>
                        Theme and text size use app settings. Font choices are simulated previews using available system fonts.
                      </Text>
                    </View>
                  ) : null}

                  {option.key === "notifications" ? (
                    <View>
                      <Text style={styles.subheading}>Push notification alerts</Text>
                      {pushNotificationOptions.map((preference) => {
                        const enabled = pushNotifications[preference.key];
                        return (
                          <View key={preference.key} style={styles.preferenceRow}>
                            <View style={styles.preferenceText}>
                              <Text style={styles.preferenceTitle}>{preference.label}</Text>
                              <Text style={styles.mutedText}>{preference.description}</Text>
                            </View>
                            <Switch
                              accessibilityLabel={preference.label}
                              accessibilityHint={preference.description}
                              accessibilityRole="switch"
                              accessibilityState={{ checked: enabled }}
                              onValueChange={(value) => setPushNotifications((current) => ({
                                ...current,
                                [preference.key]: value,
                              }))}
                              value={enabled}
                              trackColor={{ false: theme.colors.line, true: theme.colors.primary }}
                              thumbColor={theme.colors.card}
                            />
                          </View>
                        );
                      })}
                      <Text style={styles.demoNote}>
                        Simulated preferences only. No push notifications are sent.
                      </Text>
                      <PrimaryButton
                        label="Test Pop-up Notification"
                        onPress={() => setNotificationBanner(
                          "Pickup time is approaching. This alert is simulated on this device.",
                        )}
                        leadingIcon={<Icon name="bell" size={18} color={theme.colors.primaryInk} />}
                      />
                      <SchoolPreferences />
                    </View>
                  ) : null}

                  {option.key === "family" ? (
                    <View>
                      <View style={styles.childSummary}>
                        <Avatar name={child.name} size={44} />
                        <View style={styles.profileSummary}>
                          <Text style={styles.accountName}>{child.name}, age {child.age}</Text>
                          <Text style={styles.mutedText}>Class {child.className}</Text>
                        </View>
                      </View>
                      <DetailRow label="School" value={school.name} styles={styles} />
                      <DetailRow label="Address" value={school.address} styles={styles} />
                      <DetailRow label="Class teacher" value={school.teacher} styles={styles} />
                      <DetailRow label="Teacher phone" value={school.teacherPhone} styles={styles} />
                      <DetailRow label="Caregivers" value={String(mockData.caregivers.length)} styles={styles} />
                      <DetailRow label="Family members" value={String(familyMembers.length)} styles={styles} />
                      <DetailRow label="Approved pickup helpers" value={String(approvedHelpers)} styles={styles} />
                    </View>
                  ) : null}

                  {option.key === "security" ? (
                    <View>
                      <View style={styles.securityToggleRow}>
                        <View style={styles.preferenceText}>
                          <Text style={styles.preferenceTitle}>Use a passkey</Text>
                          <Text style={styles.mutedText}>
                            Use a device credential as an alternative login or recovery method.
                          </Text>
                        </View>
                        <Switch
                          accessibilityLabel="Use a passkey"
                          accessibilityHint="Enable a simulated device login or recovery option."
                          accessibilityRole="switch"
                          accessibilityState={{ checked: passkeyEnabled }}
                          onValueChange={setPasskeyEnabled}
                          value={passkeyEnabled}
                          trackColor={{ false: theme.colors.line, true: theme.colors.primary }}
                          thumbColor={theme.colors.card}
                        />
                      </View>
                      <View style={styles.passkeyStatus}>
                        <StatusPill
                          label={passkeyEnabled ? "Passkey Active" : "Passkey not set up"}
                                          tone={passkeyEnabled ? "success" : "neutral"}
                        />
                        {passkeyEnabled ? (
                          <Text style={styles.mutedText}>
                            {passkeyMethods.find((method) => method.value === passkeyMethod)?.label} enabled
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.subheading}>Device verification method</Text>
                      <View style={styles.passkeyMethods}>
                        {passkeyMethods.map((method) => {
                          const selected = passkeyMethod === method.value;
                          return (
                            <Pressable
                              key={method.value}
                              accessibilityRole="radio"
                              accessibilityLabel={method.label}
                              accessibilityState={{ checked: selected, selected, disabled: !passkeyEnabled }}
                              disabled={!passkeyEnabled}
                              onPress={() => setPasskeyMethod(method.value)}
                              style={({ pressed }) => [
                                styles.passkeyMethod,
                                selected && styles.choiceSelected,
                                !passkeyEnabled && styles.disabledOption,
                                pressed && passkeyEnabled && styles.pressed,
                              ]}
                            >
                              <Icon name={method.icon} size={20} color={theme.colors.primaryInk} />
                              <Text style={styles.passkeyMethodLabel}>{method.label}</Text>
                              {selected && passkeyEnabled ? (
                                <Icon name="check" size={18} color={theme.colors.primaryInk} />
                              ) : null}
                            </Pressable>
                          );
                        })}
                      </View>
                      <Text style={styles.demoNote}>
                        Demo only · No device biometrics or credentials are accessed or stored.
                      </Text>
                    </View>
                  ) : null}

                  {option.key === "privacy" ? (
                    <Text style={styles.mutedText}>
                      This app preview keeps account changes in local memory. Location and notification behavior is simulated; nothing is tracked or sent.
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        })}
      </View>

      <Text style={styles.footerNote}>Settings are stored locally for this demo session.</Text>

      <AccountModal
        kind={modalKind}
        draft={draft}
        setDraft={updateDraft}
        error={formError}
        onClose={closeModal}
        onSave={modalKind === "addAccount" ? addAccount : saveAccountEdit}
        onPickPhoto={choosePhoto}
        theme={theme}
        styles={styles}
      />

      <Modal
        visible={modalKind === "forgotPassword"}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <ModalHeader title="Reset password" onClose={closeModal} styles={styles} />
              {!pinSent ? (
                <>
                  <Text style={styles.modalDescription}>Choose where to send your simulated verification PIN.</Text>
                  <ChoiceRow
                    options={[
                      { value: "SMS" as const, label: "SMS" },
                      { value: "Email" as const, label: "Email" },
                    ]}
                    selected={resetChannel}
                    onSelect={setResetChannel}
                    styles={styles}
                  />
                  <Text style={styles.demoNote}>
                    {resetChannel === "SMS" ? activeAccount.phone : activeAccount.email}
                  </Text>
                  <PrimaryButton label="Send demo PIN" onPress={sendResetPin} />
                </>
              ) : (
                <>
                  <Text style={styles.modalDescription}>
                    A demo PIN was sent to {resetChannel === "SMS" ? activeAccount.phone : activeAccount.email}. Use 123456 to continue.
                  </Text>
                  <FormField label="Verification PIN" styles={styles}>
                    <TextInput
                      accessibilityLabel="Verification PIN"
                      keyboardType="number-pad"
                      onChangeText={setPin}
                      style={styles.input}
                      value={pin}
                    />
                  </FormField>
                  <FormField label="New password" styles={styles}>
                    <TextInput
                      accessibilityLabel="New password"
                      autoCapitalize="none"
                      onChangeText={setNewPassword}
                      secureTextEntry
                      style={styles.input}
                      value={newPassword}
                    />
                  </FormField>
                  <FormField label="Confirm new password" styles={styles}>
                    <TextInput
                      accessibilityLabel="Confirm new password"
                      autoCapitalize="none"
                      onChangeText={setConfirmPassword}
                      secureTextEntry
                      style={styles.input}
                      value={confirmPassword}
                    />
                  </FormField>
                  {formError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{formError}</Text> : null}
                  <PrimaryButton label="Reset password" onPress={resetPassword} />
                </>
              )}
              <Text style={styles.modalFootnote}>Demo only · No SMS or email is actually sent.</Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </AppShell>
  );
}

type AccountModalProps = {
  kind: ModalKind;
  draft: AccountDraft;
  setDraft: (key: keyof AccountDraft, value: string | null) => void;
  error: string;
  onClose: () => void;
  onSave: () => void;
  onPickPhoto: (target: PhotoTarget) => Promise<void>;
  theme: ThemeTokens;
  styles: ReturnType<typeof makeStyles>;
};

function AccountModal({
  kind,
  draft,
  setDraft,
  error,
  onClose,
  onSave,
  onPickPhoto,
  theme,
  styles,
}: AccountModalProps) {
  const visible = kind === "addAccount" || kind === "editAccount";
  const isNewAccount = kind === "addAccount";
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ModalHeader title={isNewAccount ? "Add account" : "Edit account"} onClose={onClose} styles={styles} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.photoPicker}>
                {draft.photoUri ? (
                  <Image source={{ uri: draft.photoUri }} style={styles.largePhoto} accessibilityLabel="Profile photo preview" />
                ) : (
                  <Avatar name={draft.name || "New account"} size={72} />
                )}
                <SecondaryButton
                  label="Choose profile photo"
                  onPress={() => void onPickPhoto(isNewAccount ? "new" : "edit")}
                  leadingIcon={<Icon name="camera" size={18} color={theme.colors.primaryInk} />}
                />
              </View>
              <FormField label="Full name" styles={styles}>
                <TextInput
                  accessibilityLabel="Full name"
                  autoCapitalize="words"
                  onChangeText={(value) => setDraft("name", value)}
                  style={styles.input}
                  value={draft.name}
                />
              </FormField>
              {isNewAccount ? (
                <FormField label="Password" styles={styles}>
                  <TextInput
                    accessibilityLabel="Password"
                    autoCapitalize="none"
                    onChangeText={(value) => setDraft("password", value)}
                    secureTextEntry
                    style={styles.input}
                    value={draft.password}
                  />
                </FormField>
              ) : null}
              <FormField label="Phone number" styles={styles}>
                <TextInput
                  accessibilityLabel="Phone number"
                  keyboardType="phone-pad"
                  onChangeText={(value) => setDraft("phone", value)}
                  style={styles.input}
                  value={draft.phone}
                />
              </FormField>
              <FormField label="Relationship" styles={styles}>
                <TextInput
                  accessibilityLabel="Relationship to child"
                  autoCapitalize="words"
                  onChangeText={(value) => setDraft("role", value)}
                  placeholder="Parent, Guardian, Helper..."
                  placeholderTextColor={theme.colors.muted}
                  style={styles.input}
                  value={draft.role}
                />
              </FormField>
              <FormField label="Email" styles={styles}>
                <TextInput
                  accessibilityLabel="Email"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  onChangeText={(value) => setDraft("email", value)}
                  style={styles.input}
                  value={draft.email}
                />
              </FormField>
              {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
              <PrimaryButton
                label={isNewAccount ? "Save and switch to account" : "Save account details"}
                onPress={onSave}
              />
              <Text style={styles.modalFootnote}>Demo only · This account is stored in local screen state.</Text>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

type ModalHeaderProps = {
  title: string;
  onClose: () => void;
  styles: ReturnType<typeof makeStyles>;
};

function ModalHeader({ title, onClose, styles }: ModalHeaderProps) {
  return (
    <View style={styles.modalHeader}>
      <Text accessibilityRole="header" style={styles.modalTitle}>{title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} onPress={onClose} hitSlop={8}>
        <Text style={styles.linkText}>Close</Text>
      </Pressable>
    </View>
  );
}

type FormFieldProps = {
  label: string;
  children: React.ReactNode;
  styles: ReturnType<typeof makeStyles>;
};

function FormField({ label, children, styles }: FormFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

type DetailRowProps = {
  label: string;
  value: string;
  styles: ReturnType<typeof makeStyles>;
};

function DetailRow({ label, value, styles }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>{value}</Text>
    </View>
  );
}

type ChoiceOption<T extends string> = { value: T; label: string };

type ChoiceRowProps<T extends string> = {
  options: ChoiceOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  styles: ReturnType<typeof makeStyles>;
};

function ChoiceRow<T extends string>({ options, selected, onSelect, styles }: ChoiceRowProps<T>) {
  return (
    <View style={styles.choiceRow}>
      {options.map((option) => {
        const active = selected === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(option.value)}
            style={({ pressed }) => [
              styles.choice,
              active && styles.choiceSelected,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.choiceText, active && styles.choiceTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function getFontFamily(style: FontStyle): string {
  switch (style) {
    case "serif":
      return "Georgia";
    case "workSans":
      return Platform.select({ ios: "Helvetica Neue", android: "sans-serif", default: "sans-serif" }) ?? "System";
    case "antic":
      return Platform.select({ ios: "Avenir Next", android: "sans-serif-light", default: "sans-serif-light" }) ?? "System";
    case "balloonBold":
      return Platform.select({ ios: "Arial Rounded MT Bold", android: "sans-serif-rounded", default: "sans-serif-rounded" }) ?? "System";
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidPhone(phone: string): boolean {
  return phone.replace(/\D/g, "").length >= 9;
}

const makeStyles = (theme: ThemeTokens, fontStyle: FontStyle) => {
  const fontFamily = getFontFamily(fontStyle);
  const fontWeight = fontStyle === "balloonBold" ? "800" as const : "400" as const;
  return StyleSheet.create({
    lead: {
      color: theme.colors.muted,
      fontFamily,
      fontSize: theme.type.body * theme.textScale,
      lineHeight: 21 * theme.textScale,
      marginTop: theme.spacing.xs,
      marginBottom: theme.spacing.md,
    },
    feedback: {
      color: theme.colors.success,
      fontFamily,
      fontSize: theme.type.small * theme.textScale,
      fontWeight: "700",
      marginBottom: theme.spacing.sm,
    },
    notificationBanner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.primary,
      borderRadius: theme.radius.card,
      backgroundColor: theme.colors.primarySoft,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
    },
    notificationBannerContent: { flex: 1, gap: 4 },
    notificationBannerTitle: {
      color: theme.colors.primaryInk,
      fontFamily,
      fontSize: theme.type.small * theme.textScale,
      fontWeight: "800",
    },
    notificationBannerText: {
      color: theme.colors.ink,
      fontFamily,
      fontSize: theme.type.small * theme.textScale,
      lineHeight: 17 * theme.textScale,
    },
    bannerDismiss: { paddingVertical: theme.spacing.xs },
    accordionList: { gap: theme.spacing.sm },
    accordionCard: { paddingVertical: theme.spacing.xs, paddingHorizontal: theme.spacing.md },
    accordionHeader: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
    },
    categoryIcon: {
      width: 38,
      height: 38,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      backgroundColor: theme.colors.primarySoft,
    },
    categoryTitle: {
      flex: 1,
      color: theme.colors.ink,
      fontFamily,
      fontSize: theme.type.body * theme.textScale,
      fontWeight: "800",
    },
    pressed: { opacity: 0.78 },
    accordionContent: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.line,
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.sm,
      gap: theme.spacing.sm,
    },
    profileHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.sm,
    },
    profileSummary: { flex: 1, minWidth: 0, gap: 3 },
    profileName: {
      color: theme.colors.ink,
      fontFamily,
      fontSize: theme.type.body * theme.textScale * 1.1,
      fontWeight,
    },
    mutedText: {
      color: theme.colors.muted,
      fontFamily,
      fontSize: theme.type.small * theme.textScale,
      lineHeight: 17 * theme.textScale,
    },
    photoButton: {
      width: 42,
      height: 42,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primarySoft,
    },
    photoHint: {
      color: theme.colors.muted,
      fontFamily,
      fontSize: theme.type.small * theme.textScale,
      marginBottom: theme.spacing.xs,
    },
    detailRow: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.colors.line,
    },
    detailLabel: {
      color: theme.colors.muted,
      fontFamily,
      fontSize: theme.type.small * theme.textScale,
    },
    detailValue: {
      flex: 1,
      color: theme.colors.ink,
      fontFamily,
      fontSize: theme.type.small * theme.textScale,
      fontWeight: "700",
      textAlign: "right",
    },
    passwordRow: {
      minHeight: 55,
      flexDirection: "row",
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor: theme.colors.line,
    },
    passwordInfo: { flex: 1, gap: 3 },
    iconButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
    passwordToggle: {
      color: theme.colors.primaryInk,
      fontFamily,
      fontSize: theme.type.small * theme.textScale,
      fontWeight: "700",
    },
    inlineActions: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.md, marginBottom: theme.spacing.sm },
    textAction: { paddingVertical: theme.spacing.xs },
    linkText: {
      color: theme.colors.primaryInk,
      fontFamily,
      fontSize: theme.type.small * theme.textScale,
      fontWeight: "700",
    },
    subheading: {
      color: theme.colors.ink,
      fontFamily,
      fontSize: theme.type.body * theme.textScale,
      fontWeight: "800",
      marginTop: theme.spacing.md,
      marginBottom: theme.spacing.xs,
    },
    preferenceRow: {
      minHeight: 68,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      borderTopWidth: 1,
      borderTopColor: theme.colors.line,
      paddingVertical: theme.spacing.xs,
    },
    preferenceText: { flex: 1, minWidth: 0, gap: 3 },
    preferenceTitle: {
      color: theme.colors.ink,
      fontFamily,
      fontSize: theme.type.small * theme.textScale,
      fontWeight: "700",
    },
    securityToggleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.line,
      paddingBottom: theme.spacing.md,
    },
    passkeyStatus: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      gap: theme.spacing.sm,
      marginTop: theme.spacing.md,
    },
    passkeyMethods: { gap: theme.spacing.xs },
    passkeyMethod: {
      minHeight: 52,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.line,
      borderRadius: theme.radius.control,
      backgroundColor: theme.colors.card,
      paddingHorizontal: theme.spacing.sm,
    },
    passkeyMethodLabel: {
      flex: 1,
      color: theme.colors.ink,
      fontFamily,
      fontSize: theme.type.small * theme.textScale,
      fontWeight: "700",
    },
    disabledOption: { opacity: 0.55 },
    accountOption: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      borderWidth: 1,
      borderColor: theme.colors.line,
      borderRadius: theme.radius.control,
      padding: theme.spacing.sm,
      marginBottom: theme.spacing.xs,
    },
    accountOptionSelected: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primarySoft,
    },
    accountOptionText: { flex: 1, minWidth: 0, gap: 2 },
    accountName: {
      color: theme.colors.ink,
      fontFamily,
      fontSize: theme.type.small * theme.textScale,
      fontWeight,
    },
    demoNote: {
      color: theme.colors.muted,
      fontFamily,
      fontSize: theme.type.small * theme.textScale,
      lineHeight: 16 * theme.textScale,
      marginTop: theme.spacing.sm,
    },
    choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs, marginVertical: theme.spacing.xs },
    choice: {
      minHeight: 40,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.line,
      borderRadius: theme.radius.control,
      paddingHorizontal: theme.spacing.sm,
      backgroundColor: theme.colors.card,
    },
    choiceSelected: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
    choiceText: {
      color: theme.colors.muted,
      fontFamily,
      fontSize: theme.type.small * theme.textScale,
      fontWeight,
    },
    choiceTextSelected: { color: theme.colors.primaryInk, fontWeight: "800" },
    fontChoices: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.xs },
    fontChoice: {
      flexGrow: 1,
      minWidth: "45%",
      minHeight: 72,
      justifyContent: "center",
      borderWidth: 1,
      borderColor: theme.colors.line,
      borderRadius: theme.radius.control,
      padding: theme.spacing.sm,
      backgroundColor: theme.colors.card,
    },
    fontChoiceLabel: { color: theme.colors.ink, fontSize: theme.type.small * theme.textScale, fontWeight: "700" },
    fontChoiceSample: { color: theme.colors.muted, fontSize: theme.type.small * theme.textScale, marginTop: 4 },
    previewCard: {
      backgroundColor: theme.colors.primarySoft,
      borderRadius: theme.radius.card,
      padding: theme.spacing.md,
      marginTop: theme.spacing.md,
    },
    previewLabel: { color: theme.colors.primaryInk, fontFamily, fontSize: theme.type.small * theme.textScale, fontWeight: "700" },
    previewTitle: { color: theme.colors.ink, fontFamily, fontSize: theme.type.body * theme.textScale * 1.15, fontWeight, marginTop: theme.spacing.xs },
    previewText: { color: theme.colors.muted, fontFamily, fontSize: theme.type.small * theme.textScale, lineHeight: 17 * theme.textScale, marginTop: theme.spacing.xs },
    childSummary: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      paddingBottom: theme.spacing.sm,
    },
    footerNote: {
      color: theme.colors.muted,
      fontFamily,
      fontSize: theme.type.small * theme.textScale,
      textAlign: "center",
      lineHeight: 16 * theme.textScale,
      marginVertical: theme.spacing.lg,
    },
    modalRoot: { flex: 1 },
    modalBackdrop: {
      flex: 1,
      justifyContent: "center",
      backgroundColor: theme.colors.scrim,
      padding: theme.spacing.md,
    },
    modalCard: {
      maxHeight: "90%",
      borderWidth: 1,
      borderColor: theme.colors.line,
      borderRadius: theme.radius.card,
      backgroundColor: theme.colors.card,
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    modalHeader: {
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.xs,
    },
    modalTitle: {
      flex: 1,
      color: theme.colors.ink,
      fontFamily,
      fontSize: theme.type.body * theme.textScale * 1.15,
      fontWeight: "800",
    },
    modalDescription: {
      color: theme.colors.muted,
      fontFamily,
      fontSize: theme.type.small * theme.textScale,
      lineHeight: 17 * theme.textScale,
    },
    modalFootnote: {
      color: theme.colors.muted,
      fontFamily,
      fontSize: theme.type.small * theme.textScale,
      lineHeight: 16 * theme.textScale,
      textAlign: "center",
      marginTop: theme.spacing.xs,
    },
    photoPicker: { alignItems: "center", gap: theme.spacing.sm, marginBottom: theme.spacing.xs },
    largePhoto: { width: 76, height: 76, borderRadius: 38 },
    field: { gap: theme.spacing.xxs, marginBottom: theme.spacing.sm },
    fieldLabel: { color: theme.colors.ink, fontFamily, fontSize: theme.type.small * theme.textScale, fontWeight: "700" },
    input: {
      minHeight: 46,
      borderWidth: 1,
      borderColor: theme.colors.line,
      borderRadius: theme.radius.control,
      paddingHorizontal: theme.spacing.sm,
      color: theme.colors.ink,
      backgroundColor: theme.colors.background,
      fontFamily,
      fontSize: theme.type.body * theme.textScale,
    },
    error: {
      color: theme.colors.danger,
      fontFamily,
      fontSize: theme.type.small * theme.textScale,
      lineHeight: 16 * theme.textScale,
      marginBottom: theme.spacing.sm,
    },
  });
};
