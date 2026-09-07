import { StyleSheet } from "react-native";

export const colors = {
  primary: "#1E3A8A",
  primaryLight: "#3B82F6",
  primaryDeeper: "#0F1F5C",
  accent: "#0D9488",
  gold: "#F59E0B",
  flame: "#EF4444",
  bg: "#F5F8FF",
  surface: "#FFFFFF",
  glass: "rgba(255,255,255,0.72)",
  glassBorder: "rgba(255,255,255,0.55)",
  textPrimary: "#0F172A",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  divider: "#E2E8F0",
  successBg: "#DCFCE7",
  danger: "#DC2626",
  chipBg: "rgba(59,130,246,0.10)",
  chipActive: "#1E3A8A",
  premiumOrange: "#FF7A00",
  premiumOrangeLight: "rgba(255,122,0,0.12)",
  premiumOrangeDark: "#C2410C",
};

export const gradients = {
  primary: ["#1E3A8A", "#2563EB", "#38BDF8"] as const,
  soft: ["#DBEAFE", "#F5F8FF"] as const,
  gold: ["#FBBF24", "#F59E0B"] as const,
  dark: ["#0B1338", "#1E3A8A"] as const,
  premium: ["#0F172A", "#1E3A8A", "#312E81"] as const,
  premiumOrange: ["#FF8A3D", "#FF5500"] as const,
  premiumOrangeSoft: ["#FFEDD5", "#FFF3EB"] as const,
};

export const radii = {
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
};

export const spacing = {
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
  xxl: 48,
};

export const shadow = StyleSheet.create({
  card: {
    shadowColor: "#1E3A8A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
  soft: {
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  strong: {
    shadowColor: "#1D4ED8",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
});

export const typography = StyleSheet.create({
  h1: { fontFamily: "Outfit_700Bold", fontSize: 32, letterSpacing: -0.5, color: colors.textPrimary },
  h2: { fontFamily: "Outfit_700Bold", fontSize: 24, letterSpacing: -0.3, color: colors.textPrimary },
  h3: { fontFamily: "Outfit_600SemiBold", fontSize: 18, color: colors.textPrimary },
  body: { fontFamily: "Manrope_500Medium", fontSize: 15, color: colors.textPrimary },
  small: { fontFamily: "Manrope_400Regular", fontSize: 13, color: colors.textSecondary },
  tiny: { fontFamily: "Manrope_600SemiBold", fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: colors.textMuted },
  button: { fontFamily: "Outfit_600SemiBold", fontSize: 16, color: "#fff" },
});
