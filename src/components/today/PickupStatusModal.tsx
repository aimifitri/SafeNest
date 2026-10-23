import { useEffect, useRef, useState } from "react";
import { Animated, Modal, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../navigation/Icon";
import { clock } from "../shared/circleEngine";
import { Btn, Press, T, ToneProvider, useColors, useReduce } from "../shared/ui";
import type { usePickupFlow } from "./usePickupFlow";
import { useSoundEffects } from "../shared/SoundEffects";

type Props = {
  visible: boolean; childName: string; schoolName: string;
  pf: ReturnType<typeof usePickupFlow>;
  onClose: () => void; onExited: () => void; onProceed: () => void;
  onGo: () => void; onActivateBackup: () => void; onReview: () => void;
  backupBusy: boolean; proceedBusy?: boolean; proceedError?: string | null;
};
// One presentation of the same ETA and pickup decisions used by Today and Plan. No independent GPS requests.
export function PickupStatusModal({ visible, childName, schoolName, pf, onClose, onExited, onProceed, onGo, onActivateBackup, onReview, backupBusy, proceedBusy = false, proceedError = null }: Props) {
  const { playPickupChime } = useSoundEffects();
  const baseColors = useColors();
  const colors = { ...baseColors, card: baseColors.heroStart, ink: "#FFFFFF", muted: baseColors.heroMuted,
    primaryInk: "#FFFFFF", primarySoft: "rgba(255,255,255,0.10)", warningInk: "#FFFFFF", danger: "#FFB4AB" };
  const reduceMotion = useReduce();
  const insets = useSafeAreaInsets();
  const [rendered, setRendered] = useState(false);
  const renderedRef = useRef(false);
  const exitPending = useRef(false);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(visible || reduceMotion ? 0 : 14)).current;
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;
  const finishExit = () => {
    if (!exitPending.current) return;
    exitPending.current = false;
    onExitedRef.current();
  };
  useEffect(() => {
    if (!rendered && Platform.OS !== "ios") finishExit();
  }, [rendered]);

  useEffect(() => {
    if (visible) {
      exitPending.current = false;
      renderedRef.current = true;
      setRendered(true);
      opacity.setValue(0);
      translateY.setValue(reduceMotion ? 0 : 14);
      const frame = requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 1, duration: reduceMotion ? 0 : 250, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: reduceMotion ? 0 : 250, useNativeDriver: true }),
        ]).start();
      });
      return () => cancelAnimationFrame(frame);
    }

    if (!renderedRef.current) return;
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: reduceMotion ? 0 : 250, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: reduceMotion ? 0 : 14, duration: reduceMotion ? 0 : 250, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (!finished) return;
      renderedRef.current = false;
      exitPending.current = true;
      setRendered(false);
    });
  }, [visible, reduceMotion, opacity, translateY]);


  const { status, eta } = pf;
  const decided = ["pending", "assigned", "journey", "completed", "cancelled"].includes(status.kind);
  const warn = status.kind === "late" || status.kind === "delayed";
  return <Modal transparent visible={rendered} onDismiss={finishExit} animationType="none" statusBarTranslucent onRequestClose={onClose}>
    <ToneProvider value="hero"><Animated.View style={{ flex: 1, justifyContent: "center", paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12, paddingHorizontal: 18, backgroundColor: colors.scrim, opacity }}>
      <Animated.View style={{ width: "100%", maxWidth: 440, maxHeight: "90%", alignSelf: "center", borderRadius: 20, backgroundColor: colors.card, elevation: 12, transform: [{ translateY }] }} accessibilityLabel="Pickup status" accessibilityViewIsModal>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <T s={1.1} w={800}>Pickup Status</T>
            <Press onPress={onClose} label="Close pickup status" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Icon name="x" size={20} color={colors.ink} stroke={2} /></Press>
          </View>
          <T w={800}>{childName}</T>
          <T c="muted">{schoolName}</T>
          <T s={0.88}>School dismissal: {pf.dismissal}</T>
          <View style={{ padding: 16, gap: 8, borderRadius: 16, backgroundColor: colors.primarySoft }}>
            <T s={1.2} w={800} c={warn ? colors.warningInk : colors.primaryInk}>{status.title}</T>
            <T s={0.88} c={colors.primaryInk} lh={1.4}>{status.detail}</T>
            {!decided && eta.kind === "ready" ? <>
              <T w={700} c={colors.primaryInk}>Estimated drive: {eta.minutes} min</T>
              <T w={700} c={colors.primaryInk}>Estimated arrival: {status.arrival === null ? "Unavailable" : clock(status.arrival)}</T>
              {warn && status.minutesLate !== null ? <T w={800} c={colors.primaryInk}>{status.minutesLate} minutes late</T> : null}
            </> : null}
          </View>
          {pf.simActive ? <T s={0.82} w={700} c={colors.primaryInk}>DEMO: simulated location, travel time and movement. Nobody is contacted.</T>
            : eta.kind === "ready" && !decided ? <T s={0.78} c="muted">This phone only. GPS accuracy: {eta.accuracy == null ? "unknown" : `+/-${Math.round(eta.accuracy)} m`}. Updated {new Date(eta.positionTimestamp ?? eta.checkedAt).toLocaleTimeString()}.</T> : null}
          {decided ? <>
            <T s={0.82} c="muted">{pf.simActive ? "Helper movement on the demo map is simulated." : "Live helper tracking is not available here. No other person's GPS is being displayed."}</T>
            <Btn kind="p" onPress={onReview}>Review pickup {status.kind === "pending" ? "responses" : "journey"}</Btn>
          </> : <>
            <Btn kind="p" onPress={onProceed} disabled={pf.busy || backupBusy || proceedBusy} loading={proceedBusy}>I'll proceed with pickup</Btn>
            {warn && !pf.simActive ? <T s={0.8} c="muted">Requesting backup from this preview is unavailable until real pickup permissions are reviewed. Demo Mode supports this action.</T> : null}
            {warn && !pf.statusReady ? <T s={0.8} c="muted">Backup actions here require confirmed journey and request status. Review the existing pickup card if status is unavailable.</T> : null}
            {warn ? <Btn kind="o" onPress={() => { playPickupChime(); onActivateBackup(); }} disabled={backupBusy || pf.busy || !pf.statusReady || !pf.simActive} loading={backupBusy}>Request backup from Trusted Circle</Btn> : null}
            {pf.simActive ? <T s={0.78} c="muted">Use Demo controls on Today to change the clock, location and travel delay.</T> : eta.kind === "permission_needed" ? <Btn kind="o" onPress={() => void pf.run(eta.blocked ? "open_settings" : "enable_location")}>{eta.blocked ? "Open phone settings" : "Allow foreground location"}</Btn>
              : <Btn kind="o" disabled={eta.kind === "checking"} onPress={() => void pf.refreshEta()}>Refresh pickup estimate</Btn>}
            <Btn kind="o" onPress={onGo} disabled={proceedBusy}>{pf.simActive ? "Open this phone's GPS (real location)" : "Open GPS navigation"}</Btn>
          </>}
          {proceedError ? <View accessibilityRole="alert"><T s={0.82} c={colors.danger}>{proceedError}</T></View> : null}
          {pf.error ? <T s={0.82} c={colors.danger}>{pf.error}</T> : null}
          <T s={0.72} c="muted" align="center">Driving estimates are approximate and exclude live traffic. Foreground monitoring only; no background notifications.</T>
        </ScrollView>
      </Animated.View>
    </Animated.View></ToneProvider>
  </Modal>;
}
