import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, TextStyle, StyleProp } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { useRouter } from "expo-router";
import { colors, gradients, radii, shadow, typography } from "@/src/theme";

export { Avatar } from "./ui/Avatar";
export { ProTag } from "./ui/ProTag";

// Glass Card
export function GlassCard({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <View style={[glassStyles.card, style]} testID={testID}>
      <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}
const glassStyles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.glass,
    overflow: "hidden",
    ...shadow.soft,
  },
});

// Primary gradient button
export function GradientButton({
  label, onPress, icon, style, textStyle, testID, disabled, colors: buttonColors,
}: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; style?: StyleProp<ViewStyle>; textStyle?: StyleProp<TextStyle>; testID?: string; disabled?: boolean; colors?: readonly [string, string, ...string[]] }) {
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} disabled={disabled} testID={testID} style={style}>
      <LinearGradient colors={disabled ? ["#CBD5E1", "#94A3B8"] : (buttonColors || gradients.primary)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={btnStyles.gbtn}>
        <Text style={[btnStyles.gtext, textStyle]}>{label}</Text>
        {icon ? <Ionicons name={icon} size={18} color="#fff" /> : null}
      </LinearGradient>
    </TouchableOpacity>
  );
}
const btnStyles = StyleSheet.create({
  gbtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54, borderRadius: 999, paddingHorizontal: 20, ...shadow.strong },
  gtext: { ...typography.button },
});

// Progress ring
export function ProgressRing({ size = 92, stroke = 8, progress, color = colors.primaryLight, trackColor = "#E2E8F0", children }: { size?: number; stroke?: number; progress: number; color?: string; trackColor?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  const dash = c * (1 - p);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={dash} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <View style={{ position: "absolute", alignItems: "center", justifyContent: "center" }}>{children}</View>
    </View>
  );
}

// Section header
export function SectionTitle({ title, action, onAction, testID }: { title: string; action?: string; onAction?: () => void; testID?: string }) {
  return (
    <View style={sec.row} testID={testID}>
      <Text style={sec.title}>{title}</Text>
      {action ? (
        <TouchableOpacity onPress={onAction}><Text style={sec.action}>{action}</Text></TouchableOpacity>
      ) : null}
    </View>
  );
}
const sec = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { ...typography.h3, fontSize: 18 },
  action: { ...typography.small, color: colors.primary, fontFamily: "Manrope_600SemiBold" },
});

// Header with back
export function ScreenHeader({ title, right, showBack, onBack, testID }: { title: string; right?: React.ReactNode; showBack?: boolean; onBack?: () => void; testID?: string }) {
  const router = useRouter();
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)");
    }
  };

  return (
    <View style={hdr.wrap} testID={testID}>
      {showBack ? (
        <TouchableOpacity onPress={handleBack} style={hdr.backBtn} testID="screen-back-btn">
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
      ) : <View style={{ width: 40 }} />}
      <Text style={hdr.title} numberOfLines={1}>{title}</Text>
      <View style={{ minWidth: 40, alignItems: "flex-end" }}>{right}</View>
    </View>
  );
}
const hdr = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, ...shadow.soft },
  title: { ...typography.h3, flex: 1, textAlign: "center" },
});
