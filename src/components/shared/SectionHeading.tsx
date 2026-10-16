import { View } from "react-native";

import { T } from "./ui";

type SectionHeadingProps = { title: string; accessibilityLabel?: string };

export function SectionHeading({ title, accessibilityLabel }: SectionHeadingProps) {
  return (
    <View accessibilityRole="header" accessibilityLabel={accessibilityLabel} style={{ marginTop: 6, marginBottom: -6, marginHorizontal: 4 }}>
      <T s={0.78} w={700} ls={0.06} up c="muted">{title}</T>
    </View>
  );
}
