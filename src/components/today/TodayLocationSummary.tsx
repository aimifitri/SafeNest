import { View } from "react-native";
import { Icon } from "../navigation/Icon";
import { Card } from "../shared/Card";
import { phoneLocationView, type PhoneLocationSnapshot } from "../shared/phoneLocation";
import { Btn, T, useColors } from "../shared/ui";

type Props = { illustratedMap?: boolean; snapshot: PhoneLocationSnapshot; now: number; demoPlace: string | null; onRefresh: () => void; onAllow: () => void; onGps: () => void; onSettings: () => void };
export function TodayLocationSummary({ snapshot, now, demoPlace, onRefresh, onAllow, onGps, onSettings, illustratedMap = true }: Props) {
  const colors = useColors();
  const view = phoneLocationView(snapshot, now, demoPlace);
  return <View style={{ paddingHorizontal: 16, paddingBottom: illustratedMap ? 42 : 16 }}>
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon name="look" size={18} color={colors.primary} /><T w={800}>{view.title}</T>
      </View>
      <T s={0.96} w={700}>{view.label}</T>
      <T s={0.78} c="muted" lh={1.4}>{view.detail}</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
        {demoPlace === null ? snapshot.kind === "permission_needed" ? <Btn kind="o" sm onPress={snapshot.blocked ? onSettings : onAllow}>{snapshot.blocked ? "Open phone settings" : "Allow foreground location"}</Btn>
          : <Btn kind="o" sm disabled={snapshot.kind === "checking"} onPress={onRefresh}>Refresh location</Btn> : null}
        <Btn kind="o" sm onPress={onGps}>{demoPlace === null ? "Open Phone GPS" : "Open Phone GPS (real device)"}</Btn>
      </View>
      <T s={0.72} c="muted">{illustratedMap ? "The map above is an illustration, not a live GPS map." : "Location summary only. No live map is displayed here."}</T>
    </Card>
  </View>;
}
