import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/api/client";
import { colors, gradients, radii, shadow, typography } from "@/src/theme";
import { GlassCard, GradientButton, ProTag, ScreenHeader } from "@/src/components/ui";

const PLAN_NAMES: Record<string, string> = {
  weekly: "Weekly Premium",
  monthly: "Monthly Premium",
  quarterly: "Quarterly Premium",
};

const PREMIUM_FEATURES = [
  "Unlimited voice practice minutes with AI partners",
  "Priority matching for real learner call rooms",
  "Ad-free experience across all course categories",
  "Verified certificates upon course completion",
  "Access to all 40+ interactive conversation lessons",
  "Unlimited daily quiz attempts & streak multiplier",
];

export default function Membership() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [cancelling, setCancelling] = useState(false);

  const isPremium = Boolean(user?.is_premium);
  const planKey = (user?.premium_plan || "").toLowerCase();
  const planTitle = PLAN_NAMES[planKey] || (user?.premium_plan ? `${user.premium_plan} Plan` : "Premium Plan");

  const untilDate = user?.premium_until ? new Date(user.premium_until) : null;
  const isValidDate = untilDate !== null && !isNaN(untilDate.getTime());
  const daysLeft = isValidDate ? Math.max(0, Math.ceil((untilDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
  const formattedDate = isValidDate
    ? untilDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "Active";

  const handleCancelPress = () => {
    Alert.alert(
      "Cancel Membership",
      "Are you sure you want to cancel? You'll lose premium features immediately — this cannot be undone for the current billing period.",
      [
        { text: "Keep My Membership", style: "cancel" },
        {
          text: "Cancel Membership",
          style: "destructive",
          onPress: async () => {
            setCancelling(true);
            try {
              await api.cancelSubscription();
              await refresh();
              Alert.alert("Membership Cancelled", "Your premium status has been revoked immediately.");
            } catch (e: any) {
              Alert.alert("Cancellation Error", e.message || "Failed to cancel membership.");
            } finally {
              setCancelling(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.root} testID="membership-screen">
      <LinearGradient colors={["#EFF6FF", colors.bg]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader title="My Membership" showBack onBack={() => router.back()} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

          {/* Status Card */}
          {isPremium ? (
            <View style={styles.activeCard} testID="membership-status-card">
              <View style={styles.activeHeader}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.planTitle}>{planTitle}</Text>
                    <ProTag size="md" />
                  </View>
                  <Text style={styles.validityText}>Active until {formattedDate}</Text>
                </View>
                <View style={styles.daysChip}>
                  <Ionicons name="time" size={14} color="#fff" />
                  <Text style={styles.daysText}>{daysLeft} days left</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.inactiveCard} testID="membership-inactive-card">
              <View style={styles.inactiveIconWrap}>
                <Ionicons name="sparkles" size={32} color={colors.premiumOrange} />
              </View>
              <Text style={styles.inactiveTitle}>No Active Membership</Text>
              <Text style={styles.inactiveSub}>
                Upgrade to Acuspeak Premium to unlock unlimited AI Speaking, voice calls, certificates & ad-free learning.
              </Text>
              <GradientButton
                label="Upgrade to Premium"
                icon="star"
                colors={gradients.premiumOrange}
                onPress={() => router.push("/premium")}
                style={{ marginTop: 18, width: "100%" }}
                testID="membership-upgrade-btn"
              />
            </View>
          )}

          {/* Features List */}
          {isPremium ? (
            <View style={{ marginTop: 26 }}>
              <Text style={styles.sectionTitle}>Included in your plan</Text>
              <View style={{ gap: 10, marginTop: 12 }}>
                {PREMIUM_FEATURES.map((feat, index) => (
                  <GlassCard key={index} style={styles.featureRow}>
                    <View style={styles.featureCheck}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    </View>
                    <Text style={styles.featureText}>{feat}</Text>
                  </GlassCard>
                ))}
              </View>
            </View>
          ) : null}

          {/* Cancel Membership Button */}
          {isPremium ? (
            <View style={{ marginTop: 32 }}>
              <TouchableOpacity
                onPress={handleCancelPress}
                disabled={cancelling}
                activeOpacity={0.85}
                style={styles.cancelBtn}
                testID="membership-cancel-btn"
              >
                {cancelling ? (
                  <ActivityIndicator color={colors.danger} />
                ) : (
                  <>
                    <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                    <Text style={styles.cancelBtnText}>Cancel Membership</Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={styles.cancelHint}>
                Cancelling will end your premium benefits immediately. You can re-subscribe anytime.
              </Text>
            </View>
          ) : null}

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },

  // Active membership status card
  activeCard: {
    marginTop: 10,
    padding: 20,
    borderRadius: radii.xl,
    backgroundColor: colors.premiumOrangeLight,
    borderWidth: 2,
    borderColor: colors.premiumOrange,
    ...shadow.card,
  },
  activeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  planTitle: {
    fontFamily: "Outfit_800ExtraBold",
    fontSize: 22,
    color: colors.premiumOrangeDark,
  },
  validityText: {
    ...typography.small,
    fontFamily: "Manrope_600SemiBold",
    color: colors.premiumOrangeDark,
    marginTop: 6,
  },
  daysChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.premiumOrange,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    ...shadow.soft,
  },
  daysText: {
    color: "#fff",
    fontFamily: "Manrope_700Bold",
    fontSize: 11,
  },

  // Inactive state card
  inactiveCard: {
    marginTop: 10,
    padding: 24,
    borderRadius: radii.xl,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: colors.divider,
    alignItems: "center",
    ...shadow.card,
  },
  inactiveIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: "rgba(255,122,0,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  inactiveTitle: {
    ...typography.h2,
    fontSize: 20,
    textAlign: "center",
  },
  inactiveSub: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 6,
    fontSize: 14,
  },

  // Features list
  sectionTitle: {
    ...typography.h3,
    fontSize: 17,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  featureCheck: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: colors.premiumOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    ...typography.body,
    fontFamily: "Manrope_600SemiBold",
    fontSize: 14,
    flex: 1,
  },

  // Cancel button
  cancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 52,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.danger,
    backgroundColor: "#FEF2F2",
  },
  cancelBtnText: {
    color: colors.danger,
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
  },
  cancelHint: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 10,
    paddingHorizontal: 10,
  },
});
