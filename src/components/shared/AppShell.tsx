
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
import type { RefObject } from "react";
import { useReducedMotion } from "react-native-reanimated";

import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { ReactNode } from "react";

import { Icon } from "../navigation/Icon";
import { useAppContext } from "./AppContext";
import { useLocalPendingCount } from "./pendingBadge";
import { Press, T } from "./ui";
import { fontFace } from "./theme";
import type { FontSpec, ThemeTokens } from "./theme";

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
  // Kept for API compatibility. The HTML design has no header badge, so it is only used as an accessibility hint.
  badge?: string;
  // Optional full-bleed header (the Today map). When set, the page content sits in a rounded sheet below it.
  header?: ReactNode;
  children: ReactNode;
  activeTab: TabId;
  // Optional back link above the title (Settings sub-pages, like the prototype's settings header).
  back?: { label: string; onPress: () => void };
  scrollTargetRef?: RefObject<View | null>;
  scrollRequest?: number;
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
  font,
  badge,
  badgeColor,
}: {
  tab: (typeof TABS)[number];
  active: boolean;
  color: string;
  onPress: () => void;
  textScale: number;
  font: FontSpec;
  badge?: number;
  badgeColor: string;
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
      {badge ? (
        <View
          accessibilityLabel={`${badge} waiting for approval`}
          style={{
            position: "absolute",
            top: 2,
            left: "50%",
            marginLeft: 8,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: badgeColor,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 5,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 11, lineHeight: 14, includeFontPadding: false, ...fontFace(font, 700) }}>{badge}</Text>
        </View>
      ) : null}

      <Text
        numberOfLines={1}
        style={[
          styles.tabText,
          {
            color,
            fontSize: 11.5 * textScale,
            ...fontFace(font, 600),
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
  header,
  children,
  activeTab,
  back,
  scrollTargetRef,
  scrollRequest = 0,
}: AppShellProps) {
  const scrollRef = useRef<ScrollView>(null);
  // A new page title (e.g. opening a Settings sub-page) starts at the top.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [title]);
  useEffect(() => {
    if (!scrollRequest) return;
    const scroll = scrollRef.current;
    const target = scrollTargetRef?.current;
    if (!scroll || !target) return;
    const scrollElement = scroll.getNativeScrollRef();
    if (!scrollElement) return;
    const frame = requestAnimationFrame(() => {
      target.measureLayout(
        scrollElement,
        (_x, y) => scroll.scrollTo({ y: Math.max(0, y - 12), animated: true }),
        () => {},
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollRequest, scrollTargetRef]);
  const { theme, trustedHelpers, selectedCaregiver } = useAppContext();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduce = useReducedMotion();
  const localPending = useLocalPendingCount();
  // Waiting-for-approval count on the Circle tab (parents only, like the prototype).
  const pendingCount = selectedCaregiver?.isAdmin
    ? trustedHelpers.filter((helper) => helper.state === "pending").length + localPending
    : 0;

  const themed = makeStyles(
    theme,
    insets.top
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
    new Animated.Value(reduce ? 0 : 10)
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
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={
            header ? themed.mapScroll : themed.pageScroll
          }
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {header ? (
            <>
              {header}
              <View style={themed.sheet}>
                <View style={themed.grab} />
                {children}
              </View>
            </>
          ) : (
            <>
              {back ? (
                <Press
                  onPress={back.onPress}
                  label={back.label}
                  scaleTo={0.96}
                  style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingRight: 12, marginBottom: -12, marginLeft: -6 }}
                >
                  <Icon name="back" size={22} color={theme.colors.primaryInk} stroke={2.2} />
                  <T w={700} c={theme.colors.primaryInk}>{back.label}</T>
                </Press>
              ) : null}
              <View
                accessibilityRole="header"
                accessibilityHint={badge}
              >
                <T s={2} w={800} ls={-0.03} lh={1.1}>
                  {title}
                </T>
              </View>
              {children}
            </>
          )}
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
                  font={theme.font}
                  badge={tab.key === "circle" ? pendingCount : 0}
                  badgeColor={theme.colors.danger}
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
  topInset: number
) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        theme.colors.background,
    },

    // `.page`: plain scrolling tab content with the standard 16px gutters.
    pageScroll: {
      flexGrow: 1,
      gap: 16,
      paddingTop: Math.max(20, topInset + 8),
      paddingHorizontal: 16,
      paddingBottom: 28,
    },

    // Today: the map runs edge to edge and the sheet overlaps it by 26px.
    mapScroll: {
      flexGrow: 1,
    },

    sheet: {
      flexGrow: 1,
      marginTop: -26,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      backgroundColor:
        theme.colors.background,
      paddingTop: 10,
      paddingHorizontal: 16,
      paddingBottom: 28,
      gap: 14,
    },

    grab: {
      width: 40,
      height: 5,
      borderRadius: 3,
      backgroundColor: theme.colors.line,
      alignSelf: "center",
      marginBottom: 4,
    },
  });
