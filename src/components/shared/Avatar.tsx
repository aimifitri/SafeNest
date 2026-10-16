import { Image, View } from "react-native";

import { useAppContext } from "./AppContext";
import { T } from "./ui";

type AvatarProps = { name: string; size?: number; imageUri?: string; color?: string };

// Colours follow the prototype's per-person palette; people not in it get a stable colour from their name.
const KNOWN: Record<string, number> = { abu: 0, laila: 0, ahmad: 1, aiman: 2, siti: 3, salmah: 4, ima: 5 };
const TITLES = /^(encik|kak|pn\.?|puan|cik|cikgu|mr\.?|mrs\.?|ms\.?)\s+/i;

function baseName(name: string): string {
  return name.trim().replace(TITLES, "");
}

export function avatarIndex(name: string): number {
  const base = baseName(name).toLowerCase().split(/\s+/)[0] ?? "";
  if (base in KNOWN) return KNOWN[base];
  let h = 0;
  for (let i = 0; i < base.length; i++) h = (h * 31 + base.charCodeAt(i)) >>> 0;
  return h % 6;
}

export function Avatar({ name, size = 44, imageUri, color }: AvatarProps) {
  const { theme } = useAppContext();
  const bg = color ?? theme.colors.avatars[avatarIndex(name)];
  const initial = (baseName(name)[0] ?? "?").toUpperCase();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${name} avatar`}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center", overflow: "hidden" }}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={{ width: size, height: size }} />
      ) : (
        <T s={(size * 0.4) / 16 / theme.textScale} w={800} c="#FFFFFF" lh={1.1}>{initial}</T>
      )}
    </View>
  );
}
