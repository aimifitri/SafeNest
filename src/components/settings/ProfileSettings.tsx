import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import type { ViewStyle } from "react-native";
import { Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import Animated from "react-native-reanimated";

import { Icon } from "../navigation/Icon";
import { useAuth } from "../shared/AuthContext";
import { useAppContext } from "../shared/AppContext";
import { AppShell } from "../shared/AppShell";
import { Avatar } from "../shared/Avatar";
import { Card } from "../shared/Card";
import { SectionHeading } from "../shared/SectionHeading";
import { useHousehold } from "../shared/HouseholdContext";
import { accountTypeLabel } from "../shared/accountRules";
import { anim } from "../shared/motion";
import type { FontStyle, TextScale, ThemeMode } from "../shared/theme";
import { fontFace, getFontSpec } from "../shared/theme";
import {
  Banner,
  Btn,
  Chip,
  OS_FONT_CAP,
  Press,
  Rise,
  SIc,
  SRow,
  Seg,
  Switch,
  T,
  useColors,
  useReduce,
} from "../shared/ui";
import { AvailabilityEditor } from "./AvailabilityEditor";
import { HouseholdPage } from "./HouseholdPage";
import { MyProfilePage } from "./MyProfilePage";
import { SchoolPreferences } from "./SchoolPreferences";
import { SecurityPage } from "./SecurityPage";
import { useSoundEffects } from "../shared/SoundEffects";

// Settings: a profile card and grouped rows on the home page, each row opening a sub-page (Back returns home).
// Account pages read and write the signed-in person's real data. Appearance and notification choices are
// preferences on this phone. Demo Mode shows sample data and saves nothing.

type AccordionKey = "profile" | "availability" | "household" | "appearance" | "notifications" | "security" | "privacy";
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
  { key: "profile", title: "My profile", icon: "me" },
  { key: "availability", title: "My pickup availability", icon: "clock" },
  { key: "household", title: "Household and children", icon: "school" },
  { key: "appearance", title: "Appearance", icon: "look" },
  { key: "notifications", title: "Notifications", icon: "bell" },
  { key: "security", title: "Password and security", icon: "key" },
  { key: "privacy", title: "Privacy", icon: "lock" },
];

export function ProfileSettings() {
  const { playNotificationAlert } = useSoundEffects();
  const { signOut, profile, demo, exitDemo, caregiver } = useAuth();
  const household = useHousehold();
  const {
    theme,
    themeMode,
    setThemeMode,
    textScale,
    setTextScale,
    fontStyle,
    setFontStyle,
    trustedHelpers,
  } = useAppContext();
  const [page, setPage] = useState<AccordionKey | null>(null);
  const [backed, setBacked] = useState(false);
  const [pushNotifications, setPushNotifications] = useState<Record<PushPreferenceKey, boolean>>({
    pickupReminder: true,
    helperAvailability: true,
    systemAlerts: true,
  });
  const [notificationBanner, setNotificationBanner] = useState<string | null>(null);
  const [passkeyEnabled, setPasskeyEnabled] = useState(false);
  const [passkeyMethod, setPasskeyMethod] = useState<PasskeyMethod>("faceId");
  const [feedback, setFeedback] = useState("");
  const c = theme.colors;
  const params = useLocalSearchParams<{ page?: string }>();
  useEffect(() => {
    const wanted = accordionOptions.find((o) => o.key === params.page)?.key;
    if (wanted) {
      setBacked(false);
      setPage(wanted);
    }
  }, [params.page]);
  const approvedHelpers = trustedHelpers.filter((helper) => helper.state === "active").length;

  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(""), 4500);
    return () => clearTimeout(id);
  }, [feedback]);

  const name = demo ? caregiver?.name ?? "Demo parent" : profile?.fullName || caregiver?.name || "";
  const roleLabel = demo ? "Demo Mode" : accountTypeLabel(profile?.accountType);
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
  const kids = household.children.length;
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
      <View style={{ marginTop: 4 }}><T s={0.92} c="muted" lh={1.4}>School pickup details are easy to read with your selected style.</T></View>
    </Card>
  );

  return (
    <AppShell
      title={pageTitle}
      badge="Profile"
      activeTab="settings"
      back={page ? { label: "Settings", onPress: closePage } : undefined}
    >
      {banners}
      {page === null ? (
        <Page key="home" motion={motion}>
          {demo ? (
            <Banner>Demo Mode. Sample people and made-up data. Nothing is saved and nobody is contacted.</Banner>
          ) : null}
          <Card tight>
            <Press
              onPress={() => openPage("profile")}
              label={`${name}, ${roleLabel}. Open my profile`}
              scaleTo={0.985}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 84, paddingVertical: 12 }}
            >
              <Avatar name={name} size={56} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <T s={1.12} w={800} ls={-0.01} lh={1.3}>{name || "Your profile"}</T>
                <T s={0.88} c="muted" lh={1.35}>{roleLabel}</T>
                <T s={0.84} c="muted" lh={1.35}>{demo ? "demo@example.com" : profile?.email ?? ""}</T>
              </View>
              <Icon name="chev" size={20} color={c.muted} stroke={2.2} />
            </Press>
          </Card>
          <SectionHeading title="Pickup" />
          <Card tight>
            <SRow first icon="clock" title="My pickup availability" sub="When SafeNest may ask you to help" onPress={() => openPage("availability")} />
            <SRow icon="school" title="Household and children" sub={`${kids} ${kids === 1 ? "child" : "children"} · ${approvedHelpers} ${approvedHelpers === 1 ? "helper" : "helpers"} approved`} onPress={() => openPage("household")} />
          </Card>
          <SectionHeading title="Preferences" />
          <Card tight>
            <SRow first icon="look" title="Appearance" sub={`${themeLabel} · ${sizeLabel} text · ${fontLabel}`} onPress={() => openPage("appearance")} />
            <SRow icon="bell" title="Notifications" sub={`${pushOnCount} of ${pushNotificationOptions.length} alerts on · school alerts`} onPress={() => openPage("notifications")} />
          </Card>
          <SectionHeading title="Password and security" />
          <Card tight>
            <SRow first icon="key" title="Password and security" sub={demo ? "Not available in Demo Mode" : "Change password or email"} onPress={() => openPage("security")} />
            <SRow icon="lock" title="Privacy" sub="How SafeNest handles your data" onPress={() => openPage("privacy")} />
          </Card>
          <Card tight>
            {demo ? (
              <Press onPress={exitDemo} label="Exit Demo Mode" scaleTo={0.985} style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 60, paddingVertical: 8 }}>
                <SIc name="logout" />
                <T w={700}>Exit Demo Mode</T>
              </Press>
            ) : (
              <Press onPress={() => void signOut()} label="Log out of account" scaleTo={0.985} style={{ flexDirection: "row", alignItems: "center", gap: 14, minHeight: 60, paddingVertical: 8 }}>
                <SIc name="logout" red />
                <T w={700} c={c.danger}>Log Out</T>
              </Press>
            )}
          </Card>
        </Page>
      ) : (
        <Page key={page} motion={motion}>
          {page === "profile" ? <MyProfilePage /> : null}
          {page === "availability" ? <AvailabilityEditor /> : null}
          {page === "household" ? <HouseholdPage /> : null}
          {page === "security" ? (
            <>
              <SecurityPage />
              {demo ? (
                <>
                  <SectionHeading title="Passkey (demo only)" />
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
                        <T s={0.84} c="muted" lh={1.35}>Simulated. No device credential is used.</T>
                      </View>
                      <Switch on={passkeyEnabled} />
                    </Press>
                  </Card>
                  <Card tight style={{ paddingHorizontal: 4 }}>
                    {passkeyMethods.map((method, index) => (
                      <MethodRow key={method.value} first={index === 0} icon={method.icon} label={method.label} on={passkeyMethod === method.value} disabled={!passkeyEnabled} onPress={() => setPasskeyMethod(method.value)} />
                    ))}
                  </Card>
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
              <Btn kind="s" icon="bell" onPress={() => { playNotificationAlert(); setNotificationBanner("Pickup time is approaching. This alert is simulated on this device."); }}>
                Test Pop-up Notification
              </Btn>
              <Note>Preferences on this phone only. SafeNest does not send push notifications yet.</Note>
              <SchoolPreferences title="School alerts" />
            </>
          ) : null}
          {page === "privacy" ? (
            <Card>
              <View style={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
                <SIc name="lock" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <T w={700} lh={1.35}>{demo ? "Demo Mode saves nothing" : "What SafeNest stores"}</T>
                  <View style={{ marginTop: 4 }}>
                    <T s={0.92} c="muted" lh={1.45}>
                      {demo
                        ? "Demo Mode uses made-up people. Nothing you do is saved or sent."
                        : "Your profile, your household, your child's school details and your Trusted Circle are stored in your family's SafeNest account. Only members of your household can see them. Your profile photo stays on this phone. SafeNest does not store your password."}
                    </T>
                  </View>
                </View>
              </View>
            </Card>
          ) : null}
        </Page>
      )}
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

