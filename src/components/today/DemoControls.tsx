// Prototype "Demo" panel (frontend only) and the full-screen map. Both are clearly simulated.
import { View } from "react-native";

import { Icon } from "../navigation/Icon";
import { useAppContext } from "../shared/AppContext";
import { MapView } from "../shared/MapView";
import type { MapDot } from "../shared/MapView";
import { Sheet } from "../shared/Sheet";
import { scenarios, setScenario, useScenarioKey } from "../shared/demoScenario";
import { Banner, LRow, Press, T } from "../shared/ui";
import { Card } from "../shared/Card";
import { Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function DemoSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const key = useScenarioKey();
  const { theme } = useAppContext();
  const c = theme.colors;
  return (
    <Sheet visible={visible} onClose={onClose} title="Demo controls" closeLabel="Close demo controls">
      <Banner>Prototype only. Choose a simulated pickup situation to preview Today. Nothing is tracked and nobody is contacted.</Banner>
      <Card tight style={{ paddingHorizontal: 4 }}>
        {scenarios.map((s, i) => (
          <LRow key={s.key} first={i === 0} on={key === s.key} a11y={`Preview: ${s.label}`} onPress={() => setScenario(s.key)}>
            <View style={{ flex: 1 }}>
              <T w={key === s.key ? 800 : 700} c={key === s.key ? c.primaryInk : "ink"}>{s.label}</T>
              <T s={0.84} c="muted" lh={1.35}>{s.detail}</T>
            </View>
          </LRow>
        ))}
      </Card>
      <T s={0.82} c="muted" align="center" lh={1.4}>Backup requests and the teacher check are in Trusted Circle and Pickup Plan.</T>
    </Sheet>
  );
}

export function FullMap({ visible, onClose, dots, trail }: { visible: boolean; onClose: () => void; dots: MapDot[]; trail: boolean }) {
  const { theme } = useAppContext();
  const c = theme.colors;
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  const topBar = Math.max(14, insets.top + 8) + 48 + 10;
  const bottomBar = Math.max(16, insets.bottom + 8) + 56;
  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={["portrait", "landscape"]}>
      <View style={{ flex: 1, backgroundColor: c.map }}>
        {/* The artwork fills the whole screen; the whole scene is framed between the top bar and the disclaimer. */}
        <MapView
          dots={dots}
          trail={trail}
          fit="contain"
          inset={{ top: topBar, bottom: bottomBar }}
          label="Full screen illustrated map with the school and family members. Locations are simulated."
        />
        <View pointerEvents="box-none" style={{ position: "absolute", left: 16, right: 16, top: Math.max(14, insets.top + 8), flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ backgroundColor: c.card, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: c.line }}>
            <T s={0.9} w={700}>Full map</T>
          </View>
          <Press onPress={onClose} label="Close full screen map" style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, alignItems: "center", justifyContent: "center" }}>
            <Icon name="x" size={20} color={c.primaryInk} stroke={2.4} />
          </Press>
        </View>
        <View pointerEvents="none" style={{ position: "absolute", left: 16, right: 16, bottom: Math.max(16, insets.bottom + 8), alignItems: "center" }}>
          <View style={{ backgroundColor: c.card, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: c.line, maxWidth: "100%" }}>
            <T s={0.82} w={600} c="muted" align="center" lh={1.35}>Simulated map. Locations and route are not real.</T>
          </View>
        </View>
      </View>
    </Modal>
  );
}
