
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ReactNode } from "react";

import { Icon } from "../navigation/Icon";
import { useAppContext } from "./AppContext";
import type { ThemeTokens } from "./theme";

// ==================================
// SAFENEST NAVIGATION
// ==================================

type TabId =
  | "home"
  | "circle"
  | "plan"
  | "settings";

type AppShellProps = {
  title: string;
  badge?: string;
  children: ReactNode;
  activeTab: TabId;
};

// Icon names from Claude's icons.ts
const TABS = [
  {
    key: "home",
    label: "Today",
    href: "/",
    icon: "today",
  },
  {
    key: "circle",
    label: "Circle",
    href: "/circle",
    icon: "circle",
  },
  {
    key: "plan",
    label: "Plan",
    href: "/plan",
    icon: "plan",
  },
  {
    key: "settings",
    label: "Settings",
    href: "/settings",
    icon: "settings",
  },
] as const;

// Original prototype animation curves
const EASE_OUT = Easing.bezier(
  0.23,
  1,
  0.32,
  1
);

const EASE_DRAWER = Easing.bezier(
  0.32,
  0.72,
  0,
  1
);

const HORIZONTAL_PADDING = 16;

// Remember tab position between screens
let previousIndex = 0;

// ==================================
// INDIVIDUAL NAVIGATION TAB
// ==================================

function NavigationTab({
  tab,
  active,
  color,
  onPress,
  textScale,
}: {
  tab: (typeof TABS)[number];
  active: boolean;
  color: string;
  onPress: () => void;
  textScale: number;
}) {
  const [pressed, setPressed] =
    useState(false);

  const motion = useRef(
    new Animated.Value(active ? 1 : 0)
  ).current;

  useEffect(() => {
    Animated.timing(motion, {
      toValue: active ? 1 : 0,
      duration: 300,
      easing: EASE_OUT,
      useNativeDriver: true,
    }).start();
  }, [active, motion]);

  const scale = motion.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });

  const translateY = motion.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -1],
  });

  return (
    <Pressable
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{
        selected: active,
      }}
      style={styles.tabButton}
    >
      <Animated.View
        style={{
          transform: [
            { translateY },
            {
              scale: pressed
                ? 0.9
                : scale,
            },
          ],
        }}
      >
        <Icon
          name={tab.icon}
          size={26}
          color={color}
          stroke={1.8}
        />
      </Animated.View>

      <Text
        numberOfLines={1}
        style={[
          styles.tabText,
          {
            color,
            fontSize: 11.5 * textScale,
          },
        ]}
      >
        {tab.label}
      </Text>
    </Pressable>
  );
}

// ==================================
// MAIN APP SHELL
// ==================================

export function AppShell({
  title,
  badge,
  children,
  activeTab,
}: AppShellProps) {
  const { theme } = useAppContext();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const themed = makeStyles(
    theme,
    insets.top,
    insets.bottom
  );

  const activeIndex = Math.max(
    0,
    TABS.findIndex(
      (tab) => tab.key === activeTab
    )
  );

  // Exact navigation width
  const [barWidth, setBarWidth] =
    useState(0);

  const indicator = useRef(
    new Animated.Value(previousIndex)
  ).current;

  const screenOpacity = useRef(
    new Animated.Value(0)
  ).current;

  const screenY = useRef(
    new Animated.Value(10)
  ).current;

  // ==================================
  // ORIGINAL CLAUDE ANIMATION TIMINGS
  // ==================================

  useEffect(() => {
    Animated.parallel([
      // Sliding tab indicator
      Animated.timing(indicator, {
        toValue: activeIndex,
        duration: 350,
        easing: EASE_DRAWER,
        useNativeDriver: true,
      }),

      // Screen fade in
      Animated.timing(screenOpacity, {
        toValue: 1,
        duration: 240,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),

      // Screen moves upward by 10px
      Animated.timing(screenY, {
        toValue: 0,
        duration: 300,
        easing: EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start();

    previousIndex = activeIndex;
  }, [
    activeIndex,
    indicator,
    screenOpacity,
    screenY,
  ]);

  // Four equal navigation columns
  const tabWidth =
    barWidth > 0
      ? (barWidth -
          HORIZONTAL_PADDING * 2) / 4
      : 0;

  const indicatorX = indicator.interpolate({
    inputRange: [0, 3],
    outputRange: [
      0,
      tabWidth * 3,
    ],
    extrapolate: "clamp",
  });

  // ==================================
  // RENDER
  // ==================================

  return (
    <View style={themed.screen}>
      {/* ORIGINAL SCREEN CONTENT */}

      <Animated.View
        style={{
          flex: 1,
          opacity: screenOpacity,
          transform: [
            { translateY: screenY },
          ],
        }}
      >
        <View style={themed.header}>
          <Text
            accessibilityRole="header"
            style={themed.title}
          >
            {title}
          </Text>

          {badge ? (
            <View style={themed.badge}>
              <Text
                style={themed.badgeText}
              >
                {badge}
              </Text>
            </View>
          ) : null}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={
            themed.content
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </Animated.View>

      {/* BOTTOM NAVIGATION */}

      <View
        accessibilityRole="tablist"
        onLayout={(event) => {
          setBarWidth(
            event.nativeEvent.layout.width
          );
        }}
        style={[
          styles.navBar,
          {
            backgroundColor:
              theme.colors.card,
            borderTopColor:
              theme.colors.line,
            paddingBottom:
              6 + insets.bottom,
          },
        ]}
      >
        {/* EXACTLY FOUR EQUAL COLUMNS */}

        <View style={styles.tabRow}>
          {TABS.map((tab) => {
            const isActive =
              tab.key === activeTab;

            return (
              <View
                key={tab.key}
                style={styles.tabCell}
              >
                <NavigationTab
                  tab={tab}
                  active={isActive}
                  color={
                    isActive
                      ? theme.colors.primaryInk
                      : theme.colors.muted
                  }
                  textScale={theme.textScale}
                  onPress={() => {
                    if (isActive) return;

                    Haptics.selectionAsync()
                      .catch(() => {});

                    router.replace(
                      tab.href as never
                    );
                  }}
                />
              </View>
            );
          })}
        </View>

        {/* ANIMATED TEAL INDICATOR */}

        {tabWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicatorCell,
              {
                width: tabWidth,
                left:
                  HORIZONTAL_PADDING,
                transform: [
                  {
                    translateX:
                      indicatorX,
                  },
                ],
              },
            ]}
          >
            <View
              style={[
                styles.indicatorLine,
                {
                  backgroundColor:
                    theme.colors.primary,
                },
              ]}
            />
          </Animated.View>
        )}
      </View>
    </View>
  );
}

// ==================================
// NAVIGATION STYLES
// ==================================

const styles = StyleSheet.create({
  navBar: {
    borderTopWidth: 1,
    paddingHorizontal:
      HORIZONTAL_PADDING,
    paddingTop: 6,
    width: "100%",
  },

  // Fix: distribute all tabs evenly
  tabRow: {
    flexDirection: "row",
    width: "100%",
    alignItems: "stretch",
  },

  // Each tab gets exactly 25%
  tabCell: {
    width: "25%",
    minWidth: 0,
    alignItems: "stretch",
  },

  tabButton: {
    width: "100%",
    minHeight: 52,
    paddingTop: 6,
    paddingBottom: 4,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },

  tabText: {
    fontWeight: "600",
    textAlign: "center",
    letterSpacing: 0.1,
    includeFontPadding: false,
  },

  indicatorCell: {
    position: "absolute",
    top: -1,
    height: 3,
    alignItems: "center",
    justifyContent: "center",
  },

  indicatorLine: {
    width: 28,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
});

// ==================================
// ORIGINAL TEAM SCREEN STYLES
// ==================================

const makeStyles = (
  theme: ThemeTokens,
  topInset: number,
  bottomInset: number
) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        theme.colors.background,
    },

    header: {
      paddingTop: Math.max(
        topInset,
        theme.spacing.xl
      ),
      paddingHorizontal:
        theme.spacing.lg,
      paddingBottom:
        theme.spacing.sm,
      flexDirection: "row",
      justifyContent:
        "space-between",
      alignItems: "center",
      backgroundColor:
        theme.colors.background,
    },

    title: {
      fontSize:
        theme.type.title *
        theme.textScale,
      fontWeight: "800",
      color: theme.colors.ink,
    },

    badge: {
      backgroundColor:
        theme.colors.primarySoft,
      borderRadius:
        theme.radius.pill,
      paddingHorizontal:
        theme.spacing.sm,
      paddingVertical:
        theme.spacing.xs,
    },

    badgeText: {
      color:
        theme.colors.primaryInk,
      fontSize:
        theme.type.small *
        theme.textScale,
      fontWeight: "700",
    },

    content: {
      paddingHorizontal:
        theme.spacing.lg,
      paddingBottom:
        40 + bottomInset,
    },
  });
