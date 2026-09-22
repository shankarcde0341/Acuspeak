import { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions, Platform, Image } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  withRepeat,
} from "react-native-reanimated";

import { useAuth } from "@/src/context/AuthContext";
import { colors, gradients, typography } from "@/src/theme";

const { width, height } = Dimensions.get("window");

export default function Index() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  const orbit = useSharedValue(0);
  const wordmarkY = useSharedValue(20);
  const wordmarkOpacity = useSharedValue(0);

  // If we land on `/` with `session_id` in the URL (web Google OAuth redirect),
  // forward to `/auth` so it gets processed exactly once.
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const href = window.location.href;
    const hasSession = href.includes("session_id=");
    if (hasSession) {
      const hash = window.location.hash || "";
      const search = window.location.search || "";
      const authPath = `/auth${search || (hash ? "?" + hash.slice(1) : "")}`;
      if (typeof window !== "undefined") {
        window.location.href = authPath;
      }
    }
  }, [router]);

  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.15, { duration: 700, easing: Easing.out(Easing.exp) }),
      withTiming(1, { duration: 380, easing: Easing.inOut(Easing.quad) })
    );
    opacity.value = withTiming(1, { duration: 500 });
    orbit.value = withRepeat(withTiming(1, { duration: 4200, easing: Easing.linear }), -1, false);
    wordmarkOpacity.value = withDelay(500, withTiming(1, { duration: 600 }));
    wordmarkY.value = withDelay(500, withTiming(0, { duration: 700, easing: Easing.out(Easing.exp) }));

    const t = setTimeout(() => {
      if (loading) return;
      // If a session_id is in the URL, defer to the /auth route handler
      if (Platform.OS === "web" && typeof window !== "undefined" && window.location.href.includes("session_id=")) return;
      if (user) router.replace("/(tabs)");
      else router.replace("/onboarding");
    }, 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  const logoStyle = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
  const orbitStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${orbit.value * 360}deg` }] }));
  const wordmarkStyle = useAnimatedStyle(() => ({ opacity: wordmarkOpacity.value, transform: [{ translateY: wordmarkY.value }] }));

  return (
    <View style={styles.container} testID="splash-screen">
      <LinearGradient colors={gradients.premium} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.orbTL} />
      <View style={styles.orbBR} />

      <Animated.View style={[styles.logoWrap, logoStyle]}>
        <Animated.View style={[styles.orbit, orbitStyle]}>
          <View style={[styles.dot, { top: -6, left: 42 }]} />
          <View style={[styles.dot, { bottom: -4, right: 8, backgroundColor: colors.gold }]} />
        </Animated.View>
        <Image
          source={require("@/assets/images/icon.png")}
          style={styles.logoImage}
          resizeMode="cover"
        />
      </Animated.View>

      <Animated.View style={[styles.wordmarkWrap, wordmarkStyle]}>
        <Text style={styles.brand}>Acuspeak</Text>
        <Text style={styles.tag}>Your Fluent English Partner</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  orbTL: { position: "absolute", top: -80, left: -60, width: 220, height: 220, borderRadius: 999, backgroundColor: "rgba(59,130,246,0.28)" },
  orbBR: { position: "absolute", bottom: -100, right: -80, width: 260, height: 260, borderRadius: 999, backgroundColor: "rgba(14,165,233,0.22)" },
  logoWrap: { alignItems: "center", justifyContent: "center", width: 140, height: 140 },
  orbit: { position: "absolute", width: 140, height: 140, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  dot: { position: "absolute", width: 10, height: 10, borderRadius: 999, backgroundColor: "#93C5FD" },
  logoImage: { width: 104, height: 104, borderRadius: 26, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)", shadowColor: "#3B82F6", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.6, shadowRadius: 24, elevation: 20 },
  wordmarkWrap: { marginTop: 32, alignItems: "center" },
  brand: { ...typography.h1, color: "#fff", fontSize: 34 },
  tag: { ...typography.small, color: "rgba(255,255,255,0.75)", marginTop: 6, letterSpacing: 0.4 },
});
