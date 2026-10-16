// Minute-level time wheel (hour, minute, AM/PM) used for every time choice in the app.
import { useCallback, useEffect, useId, useRef } from "react";
import { Platform, ScrollView, View, useWindowDimensions } from "react-native";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import * as Haptics from "expo-haptics";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { Press, T, useColors } from "./ui";

const wheelItemHeight = 42;

// ---------------------------------------------------------------- time wheel (same selection logic as before)
type TimeWheelPickerProps = {
  value: string;
  onChange: (value: string) => void;
};

type WheelColumnProps = {
  label: string;
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
};

export function TimeWheelPicker({ value, onChange }: TimeWheelPickerProps) {
  const c = useColors();
  // Short screens (small iPhones, landscape) get a 3-row wheel so the sheet never outgrows the display.
  const { height } = useWindowDimensions();
  const rows = height < 700 ? 3 : 5;
  const [time, period = "PM"] = value.split(" ");
  const [hourText = "2", minuteText = "30"] = time.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const hours = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
  const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
  const periods = ["AM", "PM"];

  const updateTime = (nextHour: number, nextMinute: number, nextPeriod: string) => {
    onChange(`${nextHour}:${String(nextMinute).padStart(2, "0")} ${nextPeriod}`);
  };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", height: wheelItemHeight * rows, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: 20, overflow: "hidden" }}>
      <View pointerEvents="none" style={{ position: "absolute", left: 8, right: 8, top: wheelItemHeight * ((rows - 1) / 2), height: wheelItemHeight, borderRadius: 12, backgroundColor: c.primarySoft }} />
      <WheelColumn
        rows={rows}
        label="Hour"
        items={hours}
        selectedIndex={Math.max(0, Math.min(hours.length - 1, ((hour || 12) + 11) % 12))}
        onSelect={(index) => updateTime(index === 11 ? 12 : index + 1, minute, period)}
      />
      <View style={{ zIndex: 1, paddingHorizontal: 4 }}><T s={1.4} w={800} c={c.primaryInk}>:</T></View>
      <WheelColumn
        rows={rows}
        label="Minute"
        items={minutes}
        selectedIndex={Math.max(0, Math.min(minutes.length - 1, minute))}
        onSelect={(index) => updateTime(hour || 12, index, period)}
      />
      <WheelColumn
        rows={rows}
        label="Period"
        items={periods}
        selectedIndex={period === "AM" ? 0 : 1}
        onSelect={(index) => updateTime(hour || 12, minute, periods[index])}
      />
      <Fade top color={c.card} h={wheelItemHeight * (rows === 3 ? 0.8 : 1.6)} />
      <Fade color={c.card} h={wheelItemHeight * (rows === 3 ? 0.8 : 1.6)} />
    </View>
  );
}

function Fade({ top, color, h }: { top?: boolean; color: string; h: number }) {
  const gid = "f" + useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, height: h, zIndex: 2, ...(top ? { top: 0 } : { bottom: 0 }) }}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={gid} x1="0" y1={top ? "0" : "1"} x2="0" y2={top ? "1" : "0"}>
            <Stop offset="0" stopColor={color} stopOpacity="1" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gid})`} />
      </Svg>
    </View>
  );
}

function WheelColumn({ label, items, selectedIndex, onSelect, rows }: WheelColumnProps & { rows: number }) {
  const c = useColors();
  const scrollRef = useRef<ScrollView | null>(null);
  const scrollToSelected = useCallback(() => {
    scrollRef.current?.scrollTo({ y: selectedIndex * wheelItemHeight, animated: false });
  }, [selectedIndex]);

  useEffect(() => {
    scrollToSelected();
  }, [scrollToSelected]);

  const settle = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    const index = Math.max(0, Math.min(items.length - 1, Math.round(y / wheelItemHeight)));
    if (index !== selectedIndex) {
      Haptics.selectionAsync().catch(() => {});
      onSelect(index);
    }
  };

  return (
    <View accessibilityLabel={label} style={{ flex: 1, minWidth: 0, height: wheelItemHeight * rows, zIndex: 1 }}>
      <ScrollView
        ref={scrollRef}
        bounces={false}
        decelerationRate="fast"
        onLayout={scrollToSelected}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={Platform.OS === "web" ? settle : undefined}
        showsVerticalScrollIndicator={false}
        snapToInterval={wheelItemHeight}
        contentContainerStyle={{ paddingVertical: wheelItemHeight * ((rows - 1) / 2) }}
        nestedScrollEnabled
      >
        {items.map((item, index) => (
          <WheelItem
            key={item}
            label={item}
            selected={index === selectedIndex}
            onPress={() => onSelect(index)}
            color={index === selectedIndex ? c.primaryInk : c.muted}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function WheelItem({ label, selected, onPress, color }: { label: string; selected: boolean; onPress: () => void; color: string }) {
  return (
    <Press onPress={onPress} scaleTo={1} state={{ selected }} style={{ height: wheelItemHeight, alignItems: "center", justifyContent: "center" }}>
      <T s={1.25} w={selected ? 800 : 600} c={color} tab>{label}</T>
    </Press>
  );
}
