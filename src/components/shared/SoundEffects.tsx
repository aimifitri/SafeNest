import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { setAudioModeAsync, useAudioPlayer, type AudioPlayer } from "expo-audio";

type SoundEffectsValue = {
  playPickupChime: () => void;
  playNotificationAlert: () => void;
};

const SoundEffectsContext = createContext<SoundEffectsValue | null>(null);

function replay(player: AudioPlayer) {
  try {
    void player.seekTo(0).then(() => player.play()).catch(() => {});
  } catch {
    // Audio feedback is best-effort and must never block the pickup action.
  }
}

export function SoundEffectsProvider({ children }: { children: ReactNode }) {
  const pickupPlayer = useAudioPlayer(require("../../../assets/audio/pickup-chime.wav"));
  const notificationPlayer = useAudioPlayer(require("../../../assets/audio/notification-alert.wav"));

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "mixWithOthers" }).catch(() => {});
  }, []);

  const playPickupChime = useCallback(() => replay(pickupPlayer), [pickupPlayer]);
  const playNotificationAlert = useCallback(() => replay(notificationPlayer), [notificationPlayer]);

  return (
    <SoundEffectsContext.Provider value={{ playPickupChime, playNotificationAlert }}>
      {children}
    </SoundEffectsContext.Provider>
  );
}

export function useSoundEffects() {
  const value = useContext(SoundEffectsContext);
  if (!value) throw new Error("useSoundEffects must be used inside SoundEffectsProvider");
  return value;
}
