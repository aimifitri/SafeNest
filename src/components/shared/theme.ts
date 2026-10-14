export type ThemeMode = "system" | "light" | "dark";
export type TextScale = "small" | "default" | "large" | "extraLarge";

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
  };
  spacing: { xxs: number; xs: number; sm: number; md: number; lg: number; xl: number; xxl: number };
  radius: { control: number; card: number; pill: number };
  type: { body: number; small: number; section: number; title: number; hero: number };
  textScale: number;
  fontFamily: string;
}

const spacing = { xxs: 4, xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 28 };
const radius = { control: 16, card: 22, pill: 999 };
const type = { body: 14, small: 11, section: 11, title: 28, hero: 32 };
const fontFamily = "System";

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
    },
    spacing, radius, type, textScale: 1, fontFamily,
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
    },
    spacing, radius, type, textScale: 1, fontFamily,
  },
};

export const textScaleValues: Record<TextScale, number> = {
  small: 0.92,
  default: 1,
  large: 1.15,
  extraLarge: 1.3,
};
