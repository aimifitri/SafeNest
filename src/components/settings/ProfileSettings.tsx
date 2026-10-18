import * as ImagePicker from "expo-image-picker";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { ViewStyle } from "react-native";
import { Image, Linking, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { Icon } from "../navigation/Icon";
import { useAuth } from "../shared/AuthContext";
import { useAppContext } from "../shared/AppContext";
import { AppShell } from "../shared/AppShell";
import { Avatar } from "../shared/Avatar";
import { Card } from "../shared/Card";
import { SectionHeading } from "../shared/SectionHeading";
import { Sheet } from "../shared/Sheet";
import { mockData } from "../shared/mockData";
import { anim } from "../shared/motion";
import type { FontStyle, TextScale, ThemeMode } from "../shared/theme";
import { fontFace, getFontSpec } from "../shared/theme";
import type { Caregiver } from "../shared/types";
import {
  Banner,
  Btn,
  Chip,
  Dl,
  Err,
  Field,
  Input,
  LRow,
  OS_FONT_CAP,
  Press,
  Rise,
  SIc,
  SRow,
  Seg,
  SmallBtn,
  Switch,
  T,
  useColors,
  useReduce,
} from "../shared/ui";
import { SchoolPreferences } from "./SchoolPreferences";

// Settings follows the prototype's settings screen: a profile card and grouped rows on the home page,
// each row opening a sub-page (Back returns home), and bottom sheets for editing. Built from the same
// shared components as Today, Circle and Plan, so fonts, text size and Light/Dark follow the app.

type LocalAccount = Caregiver & {
  password: string;
  photoUri: string | null;
};

type AccountDraft = Pick<Caregiver, "name" | "phone" | "email" | "role"> & {
  password: string;
  photoUri: string | null;
};

type AccordionKey = "account" | "appearance" | "notifications" | "family" | "security" | "privacy";
type ModalKind = "addAccount" | "editAccount" | "addChild" | "forgotPassword" | null;
type PhotoTarget = "active" | "new" | "edit";
type PushPreferenceKey = "pickupReminder" | "helperAvailability" | "systemAlerts";
type PasskeyMethod = "devicePin" | "faceId" | "fingerprint";
const showDemoAccountOptions = false;

type ChildProfile = {
  id: string;
  name: string;
  age: number;
  schoolName: string;
  schoolAddress: string;
  className: string;
  teacherName: string;
  teacherPhone: string;
};

type ChildDraft = Omit<ChildProfile, "id" | "age"> & {
  age: string;
};

const initialChild: ChildProfile = {
  id: mockData.child.id,
  name: mockData.child.name,
  age: mockData.child.age,
  schoolName: mockData.school.name,
  schoolAddress: mockData.school.address,
  className: mockData.child.className,
  teacherName: mockData.school.teacher,
  teacherPhone: mockData.school.teacherPhone,
};

const emptyChildDraft: ChildDraft = {
  name: "",
  age: "",
  schoolName: "",
  schoolAddress: "",
  className: "",
  teacherName: "",
  teacherPhone: "",
};

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

export function ProfileSettings() {
  const { signOut } = useAuth();
  const {
    theme,
    themeMode,
    setThemeMode,
    textScale,
    setTextScale,
    fontStyle,
    setFontStyle,
    selectedCaregiver,
    selectCaregiver,
    clearCaregiver,
    trustedHelpers,
  } = useAppContext();
  const [accounts, setAccounts] = useState<LocalAccount[]>(() => (
    selectedCaregiver
      ? [{ ...selectedCaregiver, password: "", photoUri: null }]
      : []
  ));
  const [activeAccountId, setActiveAccountId] = useState(selectedCaregiver?.id ?? "");
  // Settings home (null) or one sub-page, like the prototype's settings pages.
  const [page, setPage] = useState<AccordionKey | null>(null);
  // True right after going back, so the home page slides in from the left.
  const [backed, setBacked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(true);
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
  const [children, setChildren] = useState<ChildProfile[]>([initialChild]);
  const [childDraft, setChildDraft] = useState<ChildDraft>(emptyChildDraft);
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

  const accountState = selectedCaregiver?.id === activeAccountId
    ? accounts.find((account) => account.id === activeAccountId)
    : undefined;
  const activeAccount: LocalAccount = selectedCaregiver
    ? {
        ...selectedCaregiver,
        password: accountState?.password ?? "",
        photoUri: accountState?.photoUri ?? null,
      }
    : {
        id: "",
        name: "",
        role: "",
        email: "",
        phone: "",
        isAdmin: false,
        password: "",
        photoUri: null,
      };
  const c = theme.colors;
  const approvedHelpers = trustedHelpers.filter((helper) => helper.state === "active").length;
  const { familyMembers } = mockData;

  useEffect(() => {
    if (selectedCaregiver) {
      setActiveAccountId(selectedCaregiver.id);
      setAccounts((current) => current.some((account) => account.id === selectedCaregiver.id)
        ? current
        : [...current, { ...selectedCaregiver, password: "", photoUri: null }]);
    }
  }, [selectedCaregiver]);

  // Confirmations are brief: they show for a few seconds, then clear so they do not follow you onto every page.
  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(""), 4500);
    return () => clearTimeout(id);
  }, [feedback]);

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

  const openChildModal = () => {
    setChildDraft(emptyChildDraft);
    setFormError("");
    setModalKind("addChild");
  };

  const updateChildDraft = (key: keyof ChildDraft, value: string) => {
    setChildDraft((current) => ({ ...current, [key]: value }));
    setFormError("");
  };

  const addChild = () => {
    const age = Number(childDraft.age);
    const requiredFields = [
      childDraft.name,
      childDraft.age,
      childDraft.schoolName,
      childDraft.schoolAddress,
      childDraft.className,
      childDraft.teacherName,
      childDraft.teacherPhone,
    ];

    if (requiredFields.some((value) => !value.trim())) {
      setFormError("Complete all child and school details.");
      return;
    }
    if (!Number.isInteger(age) || age < 1 || age > 18) {
      setFormError("Enter an age from 1 to 18.");
      return;
    }
    if (!isValidPhone(childDraft.teacherPhone)) {
      setFormError("Enter a valid teacher phone number with at least 9 digits.");
      return;
    }

    const newChild: ChildProfile = {
      id: `child-${Date.now()}`,
      name: childDraft.name.trim(),
      age,
      schoolName: childDraft.schoolName.trim(),
      schoolAddress: childDraft.schoolAddress.trim(),
      className: childDraft.className.trim(),
      teacherName: childDraft.teacherName.trim(),
      teacherPhone: childDraft.teacherPhone.trim(),
    };
    setChildren((current) => [...current, newChild]);
    setFeedback(`${newChild.name} added for this demo session.`);
    setChildDraft(emptyChildDraft);
    setFormError("");
    setModalKind(null);
  };

  const openTeacherWhatsApp = async (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    const internationalDigits = digits.startsWith("00")
      ? digits.slice(2)
      : digits.startsWith("0")
        ? `60${digits.slice(1)}`
        : digits;

    if (internationalDigits.length < 9) {
      setFeedback("Enter a valid teacher phone number before opening WhatsApp.");
      return;
    }

    try {
      await Linking.openURL(`https://wa.me/${internationalDigits}`);
    } catch (error) {
      setFeedback(error instanceof Error
        ? `Unable to open WhatsApp: ${error.message}`
        : "Unable to open WhatsApp.");
    }
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
    setIsLoggedIn(true);
    setFeedback(`${newAccount.name} added and selected for this demo session.`);
    setModalKind(null);
  };

  const switchAccount = (account: LocalAccount) => {
    setActiveAccountId(account.id);
    selectCaregiver(account);
    setIsLoggedIn(true);
    setShowPassword(false);
    setFeedback(`Logged in as ${account.name}.`);
  };

  const logOut = () => {
    void signOut();
    clearCaregiver();
    setIsLoggedIn(false);
    setPage(null);
    setShowPassword(false);
    setNotificationBanner(null);
    setFeedback("You are logged out. Log in with another account or create a new one.");
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

  const openPage = (key: AccordionKey) => {
    setBacked(false);
    setPage(key);
  };

  const closePage = () => {
    setBacked(true);
    setPage(null);
  };
  const themeLabel = themeOptions.find((option) => option.value === themeMode)?.label ?? "System";
  const sizeLabel = textScaleOptions.find((option) => option.value === textScale)?.label ?? "Medium";
  const fontLabel = fontOptions.find((option) => option.value === fontStyle)?.label ?? "Work Sans";
  const pushOnCount = Object.values(pushNotifications).filter(Boolean).length;
  const pageTitle = page ? accordionOptions.find((option) => option.key === page)?.title ?? "Settings" : "Settings";
  const motion: PageMotion = page ? "pushIn" : backed ? "popIn" : null;

  const banners = (
    <>
      {feedback ? (
        <Rise key={`fb-${feedback}`} kind="swap">
          <Banner kind="ok">{feedback}</Banner>
        </Rise>
      ) : null}
      {notificationBanner ? (
        <Rise key="test-alert" kind="swap">
          <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, backgroundColor: c.primarySoft, borderRadius: 18, padding: 14 }}>
            <View style={{ marginTop: 2 }}><Icon name="bell" size={20} color={c.primaryInk} stroke={2} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T w={700} c={c.primaryInk} lh={1.3}>SafeNest test alert</T>
              <T s={0.9} c={c.primaryInk} lh={1.4}>{notificationBanner}</T>
            </View>
            <Press onPress={() => setNotificationBanner(null)} label="Dismiss test notification" hitSlop={8} style={{ minHeight: 32, justifyContent: "center" }}>
              <T s={0.88} w={700} c={c.primaryInk}>Dismiss</T>
            </Press>
          </View>
        </Rise>
      ) : null}
    </>
  );

  const fontPreview = (
    <Card>
      <T s={0.72} w={700} ls={0.06} up c="muted">Preview</T>
      <View style={{ marginTop: 6 }}><T s={1.15} w={800} ls={-0.01} lh={1.25}>Pickup plan ready</T></View>
      <View style={{ marginTop: 4 }}><T s={0.92} c="muted" lh={1.4}>Laila’s school pickup details are easy to read with your selected style.</T></View>
    </Card>
  );

  return (
    <AppShell
      title={isLoggedIn ? pageTitle : "Settings"}
      badge="Profile"
      activeTab="settings"
      back={isLoggedIn && page ? { label: "Settings", onPress: closePage } : undefined}
    >
      {banners}

      {!isLoggedIn ? (
        <>
          <Card>
            <T s={1.15} w={800} lh={1.3}>You are logged out</T>
            <View style={{ marginTop: 4 }}><T s={0.92} c="muted" lh={1.4}>Log in with the account you want to use.</T></View>
          </Card>
          {showDemoAccountOptions ? (
            <>
              <SectionHeading title="Log in with another account" />
              <Card tight>
                {accounts.map((account, index) => (
                  <Press
                    key={account.id}
                    onPress={() => switchAccount(account)}
                    label={`Log in as ${account.name}`}
                    scaleTo={0.985}
                    style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64, paddingVertical: 10, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: c.line }}
                  >
                    <Avatar name={account.name} imageUri={account.photoUri ?? undefined} size={40} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T w={700}>{account.name}</T>
                      <T s={0.84} c="muted">{account.role}</T>
                    </View>
                    <T s={0.9} w={700} c={c.primaryInk}>Log in</T>
                  </Press>
                ))}
              </Card>
              <Btn kind="s" icon="userplus" onPress={() => openAccountModal("addAccount")}>Create new account</Btn>
              <Note>Demo only · Account sign-in and creation use local screen state.</Note>
            </>
          ) : null}
        </>
      ) : page === null ? (
        <Page key="home" motion={motion}>
          {/* Profile card, like the prototype's settings home */}
          <Card tight>
            <Press
              onPress={() => openPage("account")}
              label={`${activeAccount.name}, ${activeAccount.role}. Open account`}
              scaleTo={0.985}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 84, paddingVertical: 12 }}
            >
              <Avatar name={activeAccount.name} imageUri={activeAccount.photoUri ?? undefined} size={56} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T s={1.12} w={800} ls={-0.01} lh={1.3}>{activeAccount.name}</T>
                <T s={0.88} c="muted" lh={1.35}>{activeAccount.role}</T>
                <T s={0.84} c="muted" lh={1.35}>{activeAccount.email}</T>
              </View>
              <Icon name="chev" size={20} color={c.muted} stroke={2.2} />
            </Press>
          </Card>

          <SectionHeading title="Preferences" />
          <Card tight>
            <SRow first icon="look" title="Appearance" sub={`${themeLabel} · ${sizeLabel} text · ${fontLabel}`} onPress={() => openPage("appearance")} />
            <SRow icon="bell" title="Notifications" sub={`${pushOnCount} of ${pushNotificationOptions.length} alerts on · school alerts`} onPress={() => openPage("notifications")} />
          </Card>

          <SectionHeading title="Family" />
          <Card tight>
            <SRow first icon="school" title="Family and school" sub={`${children.length} ${children.length === 1 ? "child" : "children"} · ${approvedHelpers} ${approvedHelpers === 1 ? "helper" : "helpers"} ready`} onPress={() => openPage("family")} />
          </Card>

          <SectionHeading title="Security and privacy" />
          <Card tight>
            <SRow first icon="key" title="Passkey & Security" sub={passkeyEnabled ? `On · ${passkeyMethods.find((method) => method.value === passkeyMethod)?.label}` : "Not set up"} onPress={() => openPage("security")} />
            <SRow icon="lock" title="Privacy" sub="How this demo handles your data" onPress={() => openPage("privacy")} />
          </Card>

          <Card tight>
            <Press onPress={logOut} label="Log out of account" scaleTo={0.985} style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 60, paddingVertical: 8 }}>
              <SIc name="logout" red />
              <T w={700} c={c.danger}>Log Out</T>
            </Press>
          </Card>
          <Note>Settings are stored locally for this demo session.</Note>
        </Page>
      ) : (
        <Page key={page} motion={motion}>
          {page === "account" ? (
            <>
              <View style={{ alignItems: "center", gap: 8 }}>
                <View>
                  <Avatar name={activeAccount.name} imageUri={activeAccount.photoUri ?? undefined} size={88} />
                  <Press
                    onPress={() => void choosePhoto("active")}
                    label="Change profile photo"
                    hint="Choose a photo from your gallery"
                    scaleTo={0.9}
                    style={{ position: "absolute", right: -4, bottom: -4, width: 36, height: 36, borderRadius: 18, backgroundColor: c.primary, borderWidth: 3, borderColor: c.background, alignItems: "center", justifyContent: "center" }}
                  >
                    <Icon name="camera" size={16} color={c.onPrimary} stroke={2} />
                  </Press>
                </View>
                <View style={{ alignItems: "center" }}>
                  <T s={1.25} w={800} ls={-0.01} align="center" lh={1.3}>{activeAccount.name}</T>
                  <T s={0.9} c="muted" align="center">{activeAccount.role}</T>
                </View>
                <Chip kind="ok" icon="check">Active account</Chip>
              </View>

              <Card tight>
                <Dl first k="Name" v={activeAccount.name} />
                <Dl k="Phone number" v={activeAccount.phone} />
                <Dl k="Email" v={activeAccount.email} />
                <Dl k="Relationship" v={activeAccount.role} />
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T s={0.95} c="muted">Password</T>
                    <T s={0.95} w={700} tab>{showPassword ? activeAccount.password : "••••••••"}</T>
                  </View>
                  <SmallBtn
                    tone="on"
                    onPress={() => setShowPassword((visible) => !visible)}
                    label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </SmallBtn>
                </View>
              </Card>

              <Btn kind="p" icon="me" onPress={() => openAccountModal("editAccount")}>Edit account details</Btn>
              <Btn kind="o" icon="key" onPress={() => { setPinSent(false); setModalKind("forgotPassword"); }}>Forgot password?</Btn>

              {showDemoAccountOptions ? (
                <>
                  <SectionHeading title="Switch account" />
                  <Card tight style={{ paddingHorizontal: 4 }}>
                    {accounts.map((account, index) => {
                      const on = account.id === activeAccount.id;
                      return (
                        <LRow key={account.id} first={index === 0} on={on} a11y={`${account.name}, ${account.role}${on ? ", active" : ""}`} onPress={() => switchAccount(account)}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                            <Avatar name={account.name} imageUri={account.photoUri ?? undefined} size={40} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <T w={on ? 800 : 700} c={on ? c.primaryInk : "ink"}>{account.name}</T>
                              <T s={0.84} c="muted">{account.role}</T>
                            </View>
                          </View>
                        </LRow>
                      );
                    })}
                  </Card>
                  <Btn kind="dash" icon="userplus" onPress={() => openAccountModal("addAccount")}>Add account</Btn>
                  <Note>Demo only · Account changes stay in app memory. No account is authenticated.</Note>
                </>
              ) : null}
            </>
          ) : null}

          {page === "appearance" ? (
            <>
              <SectionHeading title="Theme" />
              <Seg<ThemeMode>
                cur={themeMode}
                onPick={setThemeMode}
                opts={themeOptions.map((option) => ({
                  value: option.value,
                  label: option.label,
                  a11y: themeMode === option.value ? `${option.label} theme, selected` : `${option.label} theme`,
                }))}
              />
              <Note align="left">System / Auto follows your device appearance.</Note>

              <SectionHeading title="Text size" />
              <Seg<TextScale>
                cur={textScale}
                onPick={setTextScale}
                opts={textScaleOptions.map((option) => ({
                  value: option.value,
                  label: option.label,
                  a11y: textScale === option.value ? `${option.label} text size, selected` : `${option.label} text size`,
                }))}
              />

              <SectionHeading title="Font style" />
              <FontPicker value={fontStyle} onPick={setFontStyle} />
              {fontPreview}
              <Note>Text size and font style apply across the whole app.</Note>
            </>
          ) : null}

          {page === "notifications" ? (
            <>
              <SectionHeading title="Push notification alerts" />
              <Card tight>
                {pushNotificationOptions.map((preference, index) => {
                  const enabled = pushNotifications[preference.key];
                  return (
                    <Press
                      key={preference.key}
                      role="switch"
                      label={preference.label}
                      hint={preference.description}
                      state={{ checked: enabled }}
                      scaleTo={0.985}
                      onPress={() => setPushNotifications((current) => ({ ...current, [preference.key]: !current[preference.key] }))}
                      style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingVertical: 10, borderTopWidth: index > 0 ? 1 : 0, borderTopColor: c.line }}
                    >
                      <SIc name={pushIcons[preference.key]} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <T w={700}>{preference.label}</T>
                        <T s={0.84} c="muted" lh={1.35}>{preference.description}</T>
                      </View>
                      <Switch on={enabled} />
                    </Press>
                  );
                })}
              </Card>
              <Btn
                kind="s"
                icon="bell"
                onPress={() => setNotificationBanner("Pickup time is approaching. This alert is simulated on this device.")}
              >
                Test Pop-up Notification
              </Btn>
              <Note>Simulated preferences only. No push notifications are sent.</Note>
              <SchoolPreferences title="School alerts" />
            </>
          ) : null}

          {page === "family" ? (
            <>
              <SectionHeading title="Children" />
              {children.map((childProfile) => (
                <Card key={childProfile.id} tight>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}>
                    <Avatar name={childProfile.name} size={48} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <T s={1.05} w={800} lh={1.3}>{`${childProfile.name}, age ${childProfile.age}`}</T>
                      <T s={0.86} c="muted">Class / Grade: {childProfile.className}</T>
                    </View>
                  </View>
                  <Dl k="School" v={childProfile.schoolName} />
                  <Dl k="School address" v={childProfile.schoolAddress} />
                  <Dl k="Class / Grade" v={childProfile.className} />
                  <Dl k="Classroom teacher" v={childProfile.teacherName} />
                  <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: c.line }}>
                    <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 120 }}>
                      <T s={0.95} c="muted">Teacher phone</T>
                      <T s={0.95} w={700} tab>{childProfile.teacherPhone}</T>
                    </View>
                    <SmallBtn
                      tone="on"
                      icon="chat"
                      onPress={() => void openTeacherWhatsApp(childProfile.teacherPhone)}
                      label={`Message ${childProfile.teacherName} on WhatsApp`}
                    >
                      WhatsApp
                    </SmallBtn>
                  </View>
                </Card>
              ))}
              <Btn kind="dash" icon="userplus" onPress={openChildModal}>Add child</Btn>
              <Note>Demo only · Child profiles are kept in local screen state.</Note>

              <SectionHeading title="Circle summary" />
              <Card tight>
                <Dl first k="Caregivers" v={String(mockData.caregivers.length)} />
                <Dl k="Family members" v={String(familyMembers.length)} />
                <Dl k="Approved pickup helpers" v={String(approvedHelpers)} />
              </Card>
            </>
          ) : null}

          {page === "security" ? (
            <>
              <Card tight>
                <Press
                  role="switch"
                  label="Use a passkey"
                  hint="Enable a simulated device login or recovery option."
                  state={{ checked: passkeyEnabled }}
                  scaleTo={0.985}
                  onPress={() => setPasskeyEnabled((on) => !on)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 72, paddingVertical: 12 }}
                >
                  <SIc name="key" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T w={700}>Use a passkey</T>
                    <T s={0.84} c="muted" lh={1.35}>Use a device credential as an alternative login or recovery method.</T>
                  </View>
                  <Switch on={passkeyEnabled} />
                </Press>
              </Card>
              <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10, marginHorizontal: 4 }}>
                <Chip key={passkeyEnabled ? "on" : "off"} kind={passkeyEnabled ? "ok" : "plain"} icon={passkeyEnabled ? "check" : "lock"}>
                  {passkeyEnabled ? "Passkey Active" : "Passkey not set up"}
                </Chip>
                {passkeyEnabled ? (
                  <T s={0.88} c="muted">{passkeyMethods.find((method) => method.value === passkeyMethod)?.label} enabled</T>
                ) : null}
              </View>

              <SectionHeading title="Device verification method" />
              <Card tight style={{ paddingHorizontal: 4 }}>
                {passkeyMethods.map((method, index) => (
                  <MethodRow
                    key={method.value}
                    first={index === 0}
                    icon={method.icon}
                    label={method.label}
                    on={passkeyMethod === method.value}
                    disabled={!passkeyEnabled}
                    onPress={() => setPasskeyMethod(method.value)}
                  />
                ))}
              </Card>
              {!passkeyEnabled ? <Note align="left">Turn on a passkey to choose a verification method.</Note> : null}
              <Note>Demo only · No device biometrics or credentials are accessed or stored.</Note>
            </>
          ) : null}

          {page === "privacy" ? (
            <>
              <Card>
                <View style={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
                  <SIc name="lock" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T w={700} lh={1.35}>Your data stays on this device</T>
                    <View style={{ marginTop: 4 }}>
                      <T s={0.92} c="muted" lh={1.45}>
                        This app preview keeps account changes in local memory. Location and notification behavior is simulated; nothing is tracked or sent.
                      </T>
                    </View>
                  </View>
                </View>
              </Card>
            </>
          ) : null}
        </Page>
      )}

      <AccountSheet
        kind={modalKind}
        draft={draft}
        setDraft={updateDraft}
        error={formError}
        onClose={closeModal}
        onSave={modalKind === "addAccount" ? addAccount : saveAccountEdit}
        onPickPhoto={choosePhoto}
      />

      <ChildSheet
        visible={modalKind === "addChild"}
        draft={childDraft}
        setDraft={updateChildDraft}
        error={formError}
        onClose={closeModal}
        onSave={addChild}
      />

      <Sheet
        visible={modalKind === "forgotPassword"}
        onClose={closeModal}
        title="Reset password"
        closeLabel="Close reset password"
        footer={<SheetFooter error={pinSent ? formError : ""}>{pinSent ? <Btn kind="p" icon="lock" onPress={resetPassword}>Reset password</Btn> : <Btn kind="p" icon="mail" onPress={sendResetPin}>Send demo PIN</Btn>}</SheetFooter>}
      >
        {!pinSent ? (
          <>
            <T c="muted" lh={1.4}>Choose where to send your simulated verification PIN.</T>
            <Seg<"SMS" | "Email">
              cur={resetChannel}
              onPick={setResetChannel}
              opts={[
                { value: "SMS", label: "SMS", a11y: resetChannel === "SMS" ? "SMS, selected" : "SMS" },
                { value: "Email", label: "Email", a11y: resetChannel === "Email" ? "Email, selected" : "Email" },
              ]}
            />
            <Card tight>
              <Dl first k={resetChannel === "SMS" ? "Phone" : "Email"} v={resetChannel === "SMS" ? activeAccount.phone : activeAccount.email} />
            </Card>
          </>
        ) : (
          <>
            <T c="muted" lh={1.4}>
              A demo PIN was sent to {resetChannel === "SMS" ? activeAccount.phone : activeAccount.email}. Use 123456 to continue.
            </T>
            <Field label="Verification PIN">
              <Input accessibilityLabel="Verification PIN" keyboardType="number-pad" onChangeText={setPin} value={pin} />
            </Field>
            <Field label="New password">
              <Input accessibilityLabel="New password" autoCapitalize="none" onChangeText={setNewPassword} secureTextEntry value={newPassword} />
            </Field>
            <Field label="Confirm new password">
              <Input accessibilityLabel="Confirm new password" autoCapitalize="none" onChangeText={setConfirmPassword} secureTextEntry value={confirmPassword} />
            </Field>
          </>
        )}
        <Note>Demo only · No SMS or email is actually sent.</Note>
      </Sheet>
    </AppShell>
  );
}

type PageMotion = "pushIn" | "popIn" | null;

/** Settings page body. Sub-pages push in from the right; going back slides home in from the left (260ms). */
function Page({ motion, children }: { motion: PageMotion; children: ReactNode }) {
  const reduce = useReduce();
  return <Animated.View style={[{ gap: 16 }, motion ? anim(motion, { ms: 260 }, reduce) : null]}>{children}</Animated.View>;
}

const pushIcons: Record<PushPreferenceKey, string> = {
  pickupReminder: "clock",
  helperAvailability: "userplus",
  systemAlerts: "settings",
};

/** Small centred caption used for demo disclaimers and hints. */
function Note({ children, align = "center" }: { children: ReactNode; align?: "center" | "left" }) {
  return (
    <View style={{ marginHorizontal: 4, marginTop: -6 }}>
      <T s={0.8} c="muted" lh={1.4} align={align}>{children}</T>
    </View>
  );
}

/** Font style tiles: each tile previews its own font, so the choice is visible before tapping. */
function FontPicker({ value, onPick }: { value: FontStyle; onPick: (style: FontStyle) => void }) {
  const { theme } = useAppContext();
  const c = theme.colors;
  const reduce = useReduce();
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {fontOptions.map((option) => {
        const on = value === option.value;
        const spec = getFontSpec(option.value);
        const size = 16 * theme.textScale;
        return (
          <Press
            key={option.value}
            role="radio"
            label={`${option.label} font${on ? ", selected" : ""}`}
            state={{ selected: on, checked: on }}
            onPress={() => onPick(option.value)}
            scaleTo={0.97}
            style={{
              flexGrow: 1, flexShrink: 1, flexBasis: "40%", minWidth: 132, minHeight: 92,
              paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, gap: 2,
              backgroundColor: on ? c.primarySoft : c.card,
              borderWidth: 2, borderColor: on ? c.primary : c.line,
              transitionProperty: ["backgroundColor", "borderColor"], transitionDuration: 200,
            } as ViewStyle}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <Text
                maxFontSizeMultiplier={OS_FONT_CAP}
                style={{ ...fontFace(spec, 700), fontSize: size * 1.6, lineHeight: size * 1.95, color: on ? c.primaryInk : c.ink }}
              >
                Aa
              </Text>
              {on ? (
                <Animated.View style={[{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", marginTop: 2 }, anim("pop", { ms: 260 }, reduce)]}>
                  <Icon name="check" size={14} color={c.onPrimary} stroke={3} />
                </Animated.View>
              ) : null}
            </View>
            <Text maxFontSizeMultiplier={OS_FONT_CAP} style={{ ...fontFace(spec, 600), fontSize: size * 0.95, lineHeight: size * 1.3, color: on ? c.primaryInk : c.ink }}>
              {option.label}
            </Text>
            <Text maxFontSizeMultiplier={OS_FONT_CAP} style={{ ...fontFace(spec, 400), fontSize: size * 0.8, lineHeight: size * 1.15, color: c.muted }}>
              {option.sample}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

/** Verification method row: a radio with an icon, dimmed and inactive until a passkey is turned on. */
function MethodRow({ icon, label, on, disabled, first, onPress }: { icon: string; label: string; on: boolean; disabled: boolean; first?: boolean; onPress: () => void }) {
  const c = useColors();
  const active = on && !disabled;
  return (
    <Press
      role="radio"
      label={label}
      state={{ checked: on, selected: on, disabled }}
      disabled={disabled}
      onPress={onPress}
      scaleTo={0.985}
      style={{
        flexDirection: "row", alignItems: "center", gap: 12, minHeight: 58, paddingVertical: 8, paddingHorizontal: 12,
        borderTopWidth: first ? 0 : 1, borderTopColor: c.line, opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon name={icon} size={22} color={c.primaryInk} stroke={1.9} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <T w={active ? 800 : 600} c={active ? c.primaryInk : "ink"}>{label}</T>
      </View>
      <Animated.View
        style={{
          width: 26, height: 26, borderRadius: 13, backgroundColor: c.primary, alignItems: "center", justifyContent: "center",
          opacity: active ? 1 : 0, transform: [{ scale: active ? 1 : 0.6 }],
          transitionProperty: ["opacity", "transform"], transitionDuration: 250,
        } as ViewStyle}
      >
        <Icon name="check" size={15} color={c.onPrimary} stroke={3} />
      </Animated.View>
    </Press>
  );
}

/** Pinned sheet actions. A validation error sits right above Save, so it is visible without scrolling. */
function SheetFooter({ error, children }: { error: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      {error ? <Rise key={error} kind="swap"><Err text={error} /></Rise> : null}
      {children}
    </View>
  );
}

type AccountSheetProps = {
  kind: ModalKind;
  draft: AccountDraft;
  setDraft: (key: keyof AccountDraft, value: string | null) => void;
  error: string;
  onClose: () => void;
  onSave: () => void;
  onPickPhoto: (target: PhotoTarget) => Promise<void>;
};

function AccountSheet({ kind, draft, setDraft, error, onClose, onSave, onPickPhoto }: AccountSheetProps) {
  const visible = kind === "addAccount" || kind === "editAccount";
  const isNewAccount = kind === "addAccount";
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={isNewAccount ? "Add account" : "Edit account"}
      closeLabel={`Close ${isNewAccount ? "add account" : "edit account"}`}
      footer={<SheetFooter error={error}><Btn kind="p" icon="check" onPress={onSave}>{isNewAccount ? "Save and switch to account" : "Save account details"}</Btn></SheetFooter>}
    >
      <View style={{ alignItems: "center", gap: 10 }}>
        {draft.photoUri ? (
          <Image source={{ uri: draft.photoUri }} style={{ width: 80, height: 80, borderRadius: 40 }} accessibilityLabel="Profile photo preview" />
        ) : (
          <Avatar name={draft.name || "New account"} size={80} />
        )}
        <Btn kind="s" sm icon="camera" onPress={() => void onPickPhoto(isNewAccount ? "new" : "edit")}>Choose profile photo</Btn>
      </View>
      <Field label="Full name">
        <Input accessibilityLabel="Full name" autoCapitalize="words" onChangeText={(value) => setDraft("name", value)} value={draft.name} />
      </Field>
      {isNewAccount ? (
        <Field label="Password">
          <Input accessibilityLabel="Password" autoCapitalize="none" onChangeText={(value) => setDraft("password", value)} secureTextEntry value={draft.password} />
        </Field>
      ) : null}
      <Field label="Phone number">
        <Input accessibilityLabel="Phone number" keyboardType="phone-pad" onChangeText={(value) => setDraft("phone", value)} value={draft.phone} />
      </Field>
      <Field label="Relationship">
        <Input accessibilityLabel="Relationship to child" autoCapitalize="words" onChangeText={(value) => setDraft("role", value)} placeholder="Parent, Guardian, Helper..." value={draft.role} />
      </Field>
      <Field label="Email">
        <Input accessibilityLabel="Email" autoCapitalize="none" keyboardType="email-address" onChangeText={(value) => setDraft("email", value)} value={draft.email} />
      </Field>
      <Note>Demo only · This account is stored in local screen state.</Note>
    </Sheet>
  );
}

type ChildSheetProps = {
  visible: boolean;
  draft: ChildDraft;
  setDraft: (key: keyof ChildDraft, value: string) => void;
  error: string;
  onClose: () => void;
  onSave: () => void;
};

function ChildSheet({ visible, draft, setDraft, error, onClose, onSave }: ChildSheetProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Add child"
      closeLabel="Close add child"
      footer={<SheetFooter error={error}><Btn kind="p" icon="check" onPress={onSave}>Save child</Btn></SheetFooter>}
    >
      <Field label="Full name">
        <Input accessibilityLabel="Child's full name" autoCapitalize="words" onChangeText={(value) => setDraft("name", value)} value={draft.name} />
      </Field>
      <Field label="Age">
        <Input accessibilityLabel="Child's age" keyboardType="number-pad" onChangeText={(value) => setDraft("age", value)} value={draft.age} />
      </Field>
      <Field label="School name">
        <Input accessibilityLabel="School name" autoCapitalize="words" onChangeText={(value) => setDraft("schoolName", value)} value={draft.schoolName} />
      </Field>
      <Field label="School address">
        <Input accessibilityLabel="School address" autoCapitalize="words" onChangeText={(value) => setDraft("schoolAddress", value)} value={draft.schoolAddress} multiline style={{ minHeight: 84, paddingTop: 14, textAlignVertical: "top" }} />
      </Field>
      <Field label="Class / Grade">
        <Input accessibilityLabel="Class or grade" autoCapitalize="words" onChangeText={(value) => setDraft("className", value)} value={draft.className} />
      </Field>
      <Field label="Classroom teacher's name">
        <Input accessibilityLabel="Classroom teacher's name" autoCapitalize="words" onChangeText={(value) => setDraft("teacherName", value)} value={draft.teacherName} />
      </Field>
      <Field label="Classroom teacher's phone number">
        <Input accessibilityLabel="Classroom teacher's phone number" keyboardType="phone-pad" onChangeText={(value) => setDraft("teacherPhone", value)} placeholder="+60 12 345 6789" value={draft.teacherPhone} />
      </Field>
      <Note>Demo only · These child details stay in local screen state.</Note>
    </Sheet>
  );
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidPhone(phone: string): boolean {
  return phone.replace(/\D/g, "").length >= 9;
}
