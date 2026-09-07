import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, gradients, shadow, typography } from "@/src/theme";
import { GradientButton } from "@/src/components/ui";

export default function PremiumSuccess() {
  const { session_id } = useLocalSearchParams<{ session_id: string }>();
  const router = useRouter();
  const { refresh } = useAuth();
  const [status, setStatus] = useState<"polling" | "success" | "failed">("polling");

  useEffect(() => {
    let attempts = 0;
    const poll = async () => {
      try {
        const s = await api.pollCheckout(String(session_id || ""));
        if (s.payment_status === "paid") { setStatus("success"); await refresh(); return; }
        if (s.status === "expired" || attempts > 12) { setStatus("failed"); return; }
      } catch { /* ignore */ }
      attempts += 1;
      setTimeout(poll, 1800);
    };
    poll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session_id]);

  return (
    <View style={styles.root} testID="premium-success-screen">
      <LinearGradient colors={gradients.premium} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 30 }} edges={["top", "bottom"]}>
        {status === "polling" && (
          <>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.title}>Confirming your payment…</Text>
            <Text style={styles.sub}>Hang tight, this only takes a moment.</Text>
          </>
        )}
        {status === "success" && (
          <>
            <View style={styles.iconOk}><Ionicons name="star" size={64} color="#FFFFFF" /></View>
            <Text style={styles.title}>You&apos;re Premium!</Text>
            <Text style={styles.sub}>All Premium features are now unlocked on your account.</Text>
            <View style={{ marginTop: 30, width: "100%" }}>
              <GradientButton label="Start using Premium" icon="rocket" colors={gradients.premiumOrange} onPress={() => router.replace("/(tabs)")} testID="premium-success-continue" />
            </View>
          </>
        )}
        {status === "failed" && (
          <>
            <View style={[styles.iconOk, { backgroundColor: "rgba(239,68,68,0.18)" }]}><Ionicons name="close-circle" size={64} color="#EF4444" /></View>
            <Text style={styles.title}>Payment not completed</Text>
            <Text style={styles.sub}>Please try again or contact support.</Text>
            <View style={{ marginTop: 30, width: "100%" }}>
              <GradientButton label="Back to Premium" icon="arrow-back" onPress={() => router.replace("/premium")} testID="premium-success-retry" />
            </View>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.h1, color: "#fff", textAlign: "center", marginTop: 26, fontSize: 26 },
  sub: { ...typography.body, color: "rgba(255,255,255,0.75)", textAlign: "center", marginTop: 8 },
  iconOk: { width: 96, height: 96, borderRadius: 999, backgroundColor: colors.premiumOrange, alignItems: "center", justifyContent: "center", ...shadow.strong },
});
