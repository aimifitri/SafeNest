import { Image, StyleSheet, Text, View } from "react-native";

import { useAppContext } from "./AppContext";
import type { ThemeTokens } from "./theme";

type AvatarProps = { name: string; size?: number; imageUri?: string; color?: string };

export function Avatar({ name, size = 44, imageUri, color }: AvatarProps) {
  const { theme } = useAppContext();
  const styles = makeStyles(theme, size, color);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
  return <View accessible accessibilityRole="image" accessibilityLabel={`${name} avatar`} style={styles.avatar}>
    {imageUri ? <Image source={{ uri: imageUri }} style={styles.image} /> : <Text style={styles.initials}>{initials}</Text>}
  </View>;
}

const makeStyles = (theme: ThemeTokens, size: number, color?: string) => StyleSheet.create({
  avatar: { width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? theme.colors.primarySoft, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  image: { width: size, height: size },
  initials: { color: theme.colors.primaryInk, fontSize: Math.max(14, size * 0.38), fontWeight: "800" },
});
