import { View } from "react-native";

import { Icon } from "../navigation/Icon";
import { AppShell } from "../shared/AppShell";
import { useAppContext } from "../shared/AppContext";
import { Avatar } from "../shared/Avatar";
import { Card } from "../shared/Card";
import { SecondaryButton } from "../shared/SecondaryButton";
import { SectionHeading } from "../shared/SectionHeading";
import { StatusPill } from "../shared/StatusPill";
import { mockData } from "../shared/mockData";
import { Disclosure } from "../shared/Disclosure";
import { Dl, Lead, Row, T } from "../shared/ui";
import { AppearanceSettings } from "./AppearanceSettings";
import { CaregiverProfileSection } from "./CaregiverProfileSection";
import { SchoolPreferences } from "./SchoolPreferences";

export function ProfileSettings() {
  const { theme, trustedHelpers, clearCaregiver } = useAppContext();
  const c = theme.colors;
  const { child, school, caregivers, familyMembers } = mockData;
  const approvedHelpers = trustedHelpers.filter((helper) => helper.state === "active").length;

  return (
    <AppShell title="Settings" badge="Profile" activeTab="settings">
      <Lead>Your profile, text size and notifications.</Lead>

      <CaregiverProfileSection />
      <AppearanceSettings />
      <SchoolPreferences />

      <Disclosure title="Family and school details" sub={`${child.name}, ${school.name}`}>
        <Row first style={{ paddingTop: 0, paddingBottom: 6 }}>
          <Avatar name={child.name} size={44} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T w={700}>{child.name}, age {child.age}</T>
            <T s={0.84} c="muted" lh={1.35}>Class {child.className}</T>
          </View>
        </Row>
        <Dl k="School" v={school.name} />
        <Dl k="Address" v={school.address} />
        <Dl k="Class teacher" v={school.teacher} />
        <Dl k="Teacher phone" v={school.teacherPhone} />
        <CountRow label="Caregivers" value={caregivers.length} />
        <CountRow label="Family members" value={familyMembers.length} />
        <CountRow label="Approved pickup helpers" value={approvedHelpers} />
      </Disclosure>

      <Disclosure title="Privacy and location" sub="How location is used in this demo">
        <T s={0.9} lh={1.45} c="muted">Locations on the map and notification switches are simulated. Nothing is tracked and nothing is sent.</T>
      </Disclosure>

      <SecondaryButton
        label="Switch profile"
        onPress={clearCaregiver}
        leadingIcon={<Icon name="swap" size={20} color={c.primaryInk} />}
      />
      <T s={0.78} lh={1.4} c="muted" align="center">Goes back to profile selection. Settings stay in memory for this session only.</T>
    </AppShell>
  );
}

function CountRow({ label, value, first }: { label: string; value: number; first?: boolean }) {
  const { theme } = useAppContext();
  const c = theme.colors;
  return (
    <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderTopWidth: first ? 0 : 1, borderTopColor: c.line }}>
      <T>{label}</T>
      <T w={800} c={c.primaryInk}>{String(value)}</T>
    </View>
  );
}
