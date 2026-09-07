import React from "react";
import { View, Text, StyleSheet, Image, StyleProp, ViewStyle, ImageStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, shadow } from "@/src/theme";

export interface AvatarProps {
  uri?: string | null;
  name?: string;
  size?: number;
  isPremium?: boolean;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  testID?: string;
}

export function Avatar({
  uri,
  name,
  size = 42,
  isPremium = false,
  style,
  imageStyle,
  testID,
}: AvatarProps) {
  const borderRadius = size / 2;
  const initial = (name || "U").trim().charAt(0).toUpperCase();

  const badgeSize = Math.max(16, Math.round(size * 0.32));
  const iconSize = Math.max(9, Math.round(size * 0.18));

  return (
    <View style={[{ width: size, height: size }, style]} testID={testID}>
      <View
        style={[
          styles.imageContainer,
          {
            width: size,
            height: size,
            borderRadius,
          },
          isPremium && {
            borderWidth: Math.max(2, Math.round(size * 0.05)),
            borderColor: colors.premiumOrange,
          },
        ]}
      >
        {uri ? (
          <Image
            source={{ uri }}
            style={[
              styles.image,
              { width: "100%", height: "100%", borderRadius },
              imageStyle,
            ]}
          />
        ) : (
          <View
            style={[
              styles.fallback,
              { width: "100%", height: "100%", borderRadius },
            ]}
          >
            <Text
              style={[
                styles.initialText,
                { fontSize: Math.max(12, Math.round(size * 0.4)) },
              ]}
            >
              {initial}
            </Text>
          </View>
        )}
      </View>

      {isPremium ? (
        <View
          style={[
            styles.badge,
            {
              width: badgeSize,
              height: badgeSize,
              borderRadius: badgeSize / 2,
              bottom: -1,
              right: -1,
            },
          ]}
          testID={testID ? `${testID}-premium-badge` : "avatar-premium-badge"}
        >
          <Ionicons name="star" size={iconSize} color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  image: {
    resizeMode: "cover",
  },
  fallback: {
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  initialText: {
    color: "#FFFFFF",
    fontFamily: "Outfit_700Bold",
  },
  badge: {
    position: "absolute",
    backgroundColor: colors.premiumOrange,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    ...shadow.soft,
  },
});
