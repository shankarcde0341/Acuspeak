import React from "react";
import { View, Text, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

export interface ProTagProps {
  style?: StyleProp<ViewStyle>;
  size?: "sm" | "md";
}

export function ProTag({ style, size = "sm" }: ProTagProps) {
  const isMd = size === "md";
  return (
    <View style={[styles.tag, isMd && styles.tagMd, style]} testID="pro-tag">
      <Ionicons name="star" size={isMd ? 11 : 9} color="#FFFFFF" />
      <Text style={[styles.text, isMd && styles.textMd]}>PRO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.premiumOrange,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagMd: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  text: {
    color: "#FFFFFF",
    fontFamily: "Outfit_700Bold",
    fontSize: 10,
    letterSpacing: 0.5,
  },
  textMd: {
    fontSize: 11,
  },
});
