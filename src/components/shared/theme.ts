import { Platform } from "react-native";

export type ThemeMode = "system" | "light" | "dark";
export type TextScale = "small" | "default" | "large" | "extraLarge";
/** Font choices offered in Settings > Appearance > Font style. */
export type FontStyle = "serif" | "workSans" | "antic" | "balloonBold";
export const DEFAULT_FONT_STYLE: FontStyle = "workSans";

export interface ThemeTokens {
  colors: {
    background: string;
    card: string;
    ink: string;
    muted: string;
    line: string;
    primary: string;
    onPrimary: string;
    primarySoft: string;
    primaryInk: string;
    warning: string;
    warningInk: string;
    danger: string;
    dangerSoft: string;
    success: string;
    successSoft: string;
    heroStart: string;
    heroEnd: string;
    heroMuted: string;
    heroButton: string;
    heroButtonInk: string;
    map: string;
    block: string;
    road: string;
    park: string;
    water: string;
    trail: string;
    shadow: string;
    // Added for the HTML-prototype redesign (map pin, sheet scrim, avatar palette p1-p6).
    pin: string;
    scrim: string;
    avatars: string[];
  };
  spacing: { xxs: number; xs: number; sm: number; md: number; lg: number; xl: number; xxl: number };
  radius: { control: number; card: number; pill: number };
  type: { body: number; small: number; section: number; title: number; hero: number };
  textScale: number;
  /** Regular-weight family of the selected font. Kept for components that only need one family. */
  fontFamily: string;
  /** Full typography spec of the selected font; use fontFace() to pick family + weight for a text style. */
  font: FontSpec;
  // Added for the redesign: true for the dark palette.
  isDark: boolean;
}

const WEB_SYSTEM = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 28 };
const radius = { control: 16, card: 22, pill: 999 };
const type = { body: 14, small: 11, section: 11, title: 28, hero: 32 };
const font = getFontSpec(DEFAULT_FONT_STYLE);
const fontFamily = font.regular;

export const themeTokens: Record<"light" | "dark", ThemeTokens> = {
  light: {
    colors: {
      background: "#F4F8FB", card: "#FFFFFF", ink: "#17313B", muted: "#526875", line: "#D6E4E8",
      primary: "#0F7D86", onPrimary: "#FFFFFF", primarySoft: "#DFF1F3", primaryInk: "#0B5F69",
      warning: "#FFF3C4", warningInk: "#5E4B00", danger: "#B3261E", dangerSoft: "#FDE7E4",
      success: "#1D7C5D", successSoft: "#DFF5EE", heroStart: "#123747", heroEnd: "#1B4D58",
      heroMuted: "#B5D3DA", heroButton: "#96E4E2", heroButtonInk: "#0A2E3A", map: "#E4EEF0",
      block: "#D6E5E8", road: "#FFFFFF", park: "#CFE6E6", water: "#BAD7EE", trail: "#2B7DE0",
      shadow: "rgba(18, 55, 71, 0.10)",
      pin: "#0E5F73", scrim: "rgba(10,30,38,.45)",
      avatars: ["#0F7D86", "#0E5F73", "#B26A00", "#7A4A8C", "#4A6572", "#C4503F"],
    },
    spacing, radius, type, textScale: 1, fontFamily, font, isDark: false,
  },
  dark: {
    colors: {
      background: "#0A1316", card: "#122126", ink: "#E6F1F3", muted: "#9FB8BF", line: "#25393F",
      primary: "#2FC4C4", onPrimary: "#04252A", primarySoft: "#14383D", primaryInk: "#8FE3E3",
      warning: "#3A3210", warningInk: "#F3DC8A", danger: "#FF8A80", dangerSoft: "#3B1A17",
      success: "#2FC4C4", successSoft: "#14383D", heroStart: "#0D2A35", heroEnd: "#154049",
      heroMuted: "#9EC3CB", heroButton: "#96E4E2", heroButtonInk: "#0A2E3A", map: "#14262B",
      block: "#1A3238", road: "#2A454C", park: "#17383A", water: "#1B3A52", trail: "#6FB1FF",
      shadow: "rgba(0, 0, 0, 0.35)",
      pin: "#5CC7DE", scrim: "rgba(0,0,0,.6)",
      avatars: ["#2FC4C4", "#5CC7DE", "#E0A040", "#C493D6", "#93ADB8", "#FF8F7E"],
    },
    spacing, radius, type, textScale: 1, fontFamily, font, isDark: true,
  },
};

export const textScaleValues: Record<TextScale, number> = {
  small: 0.92,
  default: 1,
  large: 1.15,
  extraLarge: 1.3,
};

export interface FontSpec {
  /** Family used for weights below 700 (body, labels, captions). */
  regular: string;
  /** Family used for weights 700 and up (titles, names, buttons). */
  bold: string;
  /** Heaviest weight the family renders well. 800 requests are clamped to this so hierarchy stays intact. */
  maxWeight: 700 | 800;
  /** Multiplier for negative (tight) letter spacing. The app's tight display tracking is tuned for the system font. */
  tightTracking: number;
  /** Average glyph width relative to the system font. Layouts use it to decide when to stack side-by-side items. */
  widthFactor: number;
}

/**
 * Typography for each Settings font choice. Every family is built into the platform, so nothing has to be
 * bundled or loaded with expo-font.
 *  - Work Sans (default): the platform UI font (SF Pro on iPhone, Roboto on Android), as in the original v3 design.
 *  - Serif: Georgia on iOS. It has regular and bold only, so 800 is clamped to 700.
 *  - Antic: Avenir Next on iOS, clamped to Bold so titles are not Heavy/black.
 *  - Balloon Bold: Arial Rounded MT Bold still sets titles, names and buttons. iOS ships it in one bold weight
 *    only, so body text uses the iOS rounded system font (SF Pro Rounded via "ui-rounded") to keep hierarchy.
 * Android only ships a few system aliases (serif, sans-serif, sans-serif-light, sans-serif-medium) and has no
 * rounded font; unknown names silently fall back to Roboto, so only real aliases are used.
 * Web gets CSS stacks that end in a generic family.
 */
export function getFontSpec(style: FontStyle): FontSpec {
  switch (style) {
    case "serif": {
      const f = Platform.select({ ios: "Georgia", android: "serif", default: 'Georgia, "Times New Roman", serif' });
      return { regular: f, bold: f, maxWeight: 700, tightTracking: 0.3, widthFactor: 1.08 };
    }
    case "antic":
      return {
        regular: Platform.select({ ios: "Avenir Next", android: "sans-serif-light", default: '"Avenir Next", Avenir, "Segoe UI", sans-serif' }),
        bold: Platform.select({ ios: "Avenir Next", android: "sans-serif", default: '"Avenir Next", Avenir, "Segoe UI", sans-serif' }),
        maxWeight: 700,
        tightTracking: 0.5,
        widthFactor: 1.05,
      };
    case "balloonBold":
      return {
        regular: Platform.select({ ios: "ui-rounded", android: "sans-serif", default: 'ui-rounded, "SF Pro Rounded", system-ui, sans-serif' }),
        bold: Platform.select({ ios: "Arial Rounded MT Bold", android: "sans-serif-medium", default: '"Arial Rounded MT Bold", ui-rounded, system-ui, sans-serif' }),
        maxWeight: 700,
        tightTracking: 0.3,
        widthFactor: 1.12,
      };
    case "workSans":
    default: {
      const f = Platform.select({ ios: "System", android: "sans-serif", default: WEB_SYSTEM });
      return { regular: f, bold: f, maxWeight: 800, tightTracking: 1, widthFactor: 1 };
    }
  }
}

/** Family of the selected font at regular weight (font preview chips, single-family uses). */
export function getFontFamily(style: FontStyle): string {
  return getFontSpec(style).regular;
}

type Weight = "400" | "500" | "600" | "700" | "800";

/** Family + weight for one text style, keeping titles, body, buttons and labels distinct in every font. */
export function fontFace(font: FontSpec, weight: number | string = 400): { fontFamily: string; fontWeight: Weight } {
  const w = Math.min(Number(weight) || 400, font.maxWeight);
  const snapped = (w >= 800 ? 800 : w >= 700 ? 700 : w >= 600 ? 600 : w >= 500 ? 500 : 400) as 400 | 500 | 600 | 700 | 800;
  return { fontFamily: snapped >= 700 ? font.bold : font.regular, fontWeight: String(snapped) as Weight };
}

/** Letter spacing (in px) for a text style: tight display tracking is eased for fonts that are not the system font. */
export function tracking(font: FontSpec, em: number, size: number): number {
  return (em < 0 ? em * font.tightTracking : em) * size;
}
