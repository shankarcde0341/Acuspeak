import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";

import { api, getBackendUrl } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, gradients, radii, shadow, typography } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ui";

// UI-only plan tiers mapped to backend subscription SKUs.
// Frontend displays rupee prices (marketing labels for UX); backend charges USD equivalents.
// Tier mapping:
//   - Free (₹0) → no checkout, displays "You're on the Free plan" chip
//   - ₹49 Pack (/ week) → backend weekly SKU (0.59 USD)
//   - ₹199 Pack (/ monthly, MOST POPULAR) → backend monthly SKU (9.99 USD)
//   - ₹499 Pack (/ quarterly, BEST VALUE) → backend quarterly SKU (14.99 USD)
// Transitioning to real INR pricing later requires only backend SKU addition — frontend already
// sends whichever backendPlan string the tier config specifies.
type TierId = "free" | "pack49" | "pack199" | "pack499";
const TIERS: Array<{
  id: TierId;
  label: string;
  price: string;
  per: string;
  tagline: string;
  backendPlan: "weekly" | "monthly" | "quarterly" | null;   // null = no checkout (Free)
  highlight?: boolean;
  ribbon?: string;
}> = [
    { id: "free", label: "Free", price: "₹0", per: "forever", tagline: "Start learning today", backendPlan: null },
    { id: "pack49", label: "₹49 Pack", price: "₹49", per: "/ week", tagline: "Trail pack + Ad-free + daily practice", backendPlan: "weekly", highlight: true },
    { id: "pack199", label: "₹199 Pack", price: "₹199", per: "/ monthly", tagline: "Unlimited social + certs", backendPlan: "monthly", highlight: true, ribbon: "MOST POPULAR" },
    { id: "pack499", label: "₹499 Pack", price: "₹499", per: "/ quarterly", tagline: "Everything unlocked", backendPlan: "quarterly", highlight: true, ribbon: "BEST VALUE" },
  ];

type Cell = { kind: "yes" } | { kind: "no" } | { kind: "text"; text: string };
const YES: Cell = { kind: "yes" };
const NO: Cell = { kind: "no" };
const T = (text: string): Cell => ({ kind: "text", text });

const COMPARISON: Array<{ feature: string; cells: [Cell, Cell, Cell, Cell] }> = [
  { feature: "Ad-Free Experience", cells: [NO, YES, YES, YES] },
  { feature: "Speaking Partner", cells: [NO, T("15 min/day"), T("30 min/day"), T("30 min/day")] },
  { feature: "Gender Filter", cells: [NO, NO, NO, YES] },
  { feature: "Social Feature", cells: [NO, T("Limited"), T("Unlimited"), T("Unlimited")] },
  { feature: "Daily Quiz", cells: [T("5/day"), T("10/day"), T("20/day"), T("20/day")] },
  { feature: "Daily Lesson", cells: [NO, YES, YES, YES] },
  { feature: "Streak Reward", cells: [YES, YES, YES, YES] },
  { feature: "Courses", cells: [NO, YES, YES, YES] },
  { feature: "Live Room", cells: [NO, T("Limited"), T("Limited"), YES] },
  { feature: "Certificates", cells: [NO, NO, YES, YES] },
];

export default function Premium() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [selected, setSelected] = useState<TierId>("pack199");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Warm the plan cache so first checkout call is instant.
    (async () => { try { await api.subscriptionPlans(); } catch { /* ignore */ } })();
  }, []);

  const originUrl = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") return window.location.origin;
    return getBackendUrl();
  };

  const subscribe = async () => {
    const tier = TIERS.find((t) => t.id === selected);
    if (!tier || !tier.backendPlan) return; // Free tier — nothing to buy
    setBusy(true);
    try {
      const res = await api.createCheckout(tier.backendPlan, originUrl());
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = res.url;
      } else {
        await WebBrowser.openBrowserAsync(res.url);
        setTimeout(async () => {
          try {
            const status = await api.pollCheckout(res.session_id);
            if (status.payment_status === "paid") {
              await refresh();
              router.replace({ pathname: "/premium/success", params: { session_id: res.session_id } });
            }
          } catch { /* ignore */ }
        }, 1000);
      }
    } catch (e: any) {
      Alert.alert("Checkout error", e.message);
    } finally { setBusy(false); }
  };

  const selectedTier = TIERS.find((t) => t.id === selected)!;

  return (
    <View style={styles.root} testID="premium-screen">
      <LinearGradient colors={["#EFF6FF", colors.bg] as const} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader title="Premium" showBack onBack={() => router.back()} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <View style={styles.diamondBox}><Ionicons name="diamond" size={44} color="#F59E0B" /></View>
            <Text style={styles.hero}>Unlock Lingua Franca Premium</Text>
            <Text style={styles.subhero}>Everything you need to sound fluent, confident, and unstoppable.</Text>
          </View>

          {user?.is_premium ? (
            <View style={styles.activeCard}>
              <Ionicons name="checkmark-circle" size={24} color="#16A34A" />
              <View style={{ flex: 1 }}>
                <Text style={styles.activeTitle}>You&apos;re Premium 🎉</Text>
                <Text style={styles.activeSub}>Plan: {user.premium_plan} · Valid until {user.premium_until?.split("T")[0]}</Text>
              </View>
            </View>
          ) : null}

          {user?.referral_discount_active ? (
            <View style={styles.refBanner} testID="referral-active-banner">
              <Ionicons name="gift" size={18} color="#166534" />
              <Text style={styles.refBannerText}>Referral discount applied — 20% off at checkout 🎉</Text>
            </View>
          ) : (
            <TouchableOpacity onPress={() => router.push("/referral")} style={styles.refPromo} testID="premium-referral-cta">
              <Ionicons name="gift-outline" size={18} color={colors.primary} />
              <Text style={styles.refPromoText}>Have a code? <Text style={{ color: colors.primary, fontFamily: "Manrope_700Bold" }}>Invite & Earn 20%</Text></Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}

          {/* ---------- Pricing cards (vertical stack, mobile-optimal readability) ---------- */}
          <View style={{ marginTop: 20, gap: 12 }}>
            {TIERS.map((tier) => {
              const isSelected = selected === tier.id;
              return (
                <TouchableOpacity
                  key={tier.id}
                  onPress={() => setSelected(tier.id)}
                  activeOpacity={0.9}
                  testID={`plan-${tier.id}`}
                >
                  <View style={[styles.planCard, tier.highlight && styles.planCardHighlighted, isSelected && styles.planCardSelected]}>
                    {tier.ribbon ? (
                      <View style={styles.ribbon}><Text style={styles.ribbonText}>{tier.ribbon}</Text></View>
                    ) : null}
                    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.planLabel}>{tier.label}</Text>
                        <Text style={styles.planTagline}>{tier.tagline}</Text>
                        <Text style={styles.planPrice}>
                          {tier.price}<Text style={styles.planPer}> {tier.per}</Text>
                        </Text>
                      </View>
                      <View style={[styles.radio, isSelected && styles.radioSelected]}>
                        {isSelected ? <View style={styles.radioInner} /> : null}
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ---------- Comparison table (horizontal scroll on small screens) ---------- */}
          <Text style={styles.compareTitle}>Compare features</Text>
          <View style={styles.tableCard}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="comparison-table">
              <View>
                {/* Header row */}
                <View style={[styles.tableRow, styles.tableHeaderRow]}>
                  <Text style={[styles.cellFeature, styles.cellHeaderText]}>Feature</Text>
                  {TIERS.map((t) => (
                    <View key={t.id} style={styles.cellTier}>
                      <Text style={styles.cellHeaderText} numberOfLines={1}>{t.label.replace(" Pack", "")}</Text>
                    </View>
                  ))}
                </View>
                {/* Body rows */}
                {COMPARISON.map((row, ri) => (
                  <View key={row.feature} style={[styles.tableRow, ri % 2 === 1 && styles.tableRowAlt]}>
                    <Text style={styles.cellFeature}>{row.feature}</Text>
                    {row.cells.map((cell, ci) => (
                      <View key={ci} style={styles.cellTier}>
                        {cell.kind === "yes" ? (
                          <View style={styles.iconYes} testID={`cell-${row.feature.toLowerCase().replace(/\W+/g, "-")}-${ci}-yes`}>
                            <Ionicons name="checkmark" size={14} color="#fff" />
                          </View>
                        ) : cell.kind === "no" ? (
                          <View style={styles.iconNo} testID={`cell-${row.feature.toLowerCase().replace(/\W+/g, "-")}-${ci}-no`}>
                            <Ionicons name="close" size={14} color="#fff" />
                          </View>
                        ) : (
                          <Text style={styles.cellText} numberOfLines={2}>{cell.text}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* CTA */}
          {!user?.is_premium ? (
            selectedTier.backendPlan ? (
              <TouchableOpacity onPress={subscribe} disabled={busy} activeOpacity={0.9} style={{ marginTop: 22 }} testID="premium-subscribe-btn">
                <LinearGradient colors={["#F59E0B", "#EF4444"] as const} style={styles.ctaBtn}>
                  {busy ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name="diamond" size={20} color="#fff" />
                      <Text style={styles.ctaText}>Continue with {selectedTier.label}</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <View style={styles.freeCta} testID="premium-free-cta">
                <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                <Text style={styles.freeCtaText}>You&apos;re on the Free plan — enjoy!</Text>
              </View>
            )
          ) : null}

          <Text style={styles.note}>Secure checkout by Stripe. Cancel anytime. Displayed prices (₹49/₹199/₹499) are marketing labels. Stripe charges weekly/monthly/quarterly in USD equivalent.</Text>
          <TouchableOpacity onPress={() => router.push("/privacy")}>
            <Text style={styles.legal}>Terms and Privacy Policy apply</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  heroCard: { alignItems: "center", marginTop: 4, backgroundColor: "#fff", paddingVertical: 24, paddingHorizontal: 20, borderRadius: radii.xl, ...shadow.card, borderWidth: 1, borderColor: "#DBEAFE" },
  diamondBox: { width: 76, height: 76, borderRadius: 24, backgroundColor: "#1E3A8A", alignItems: "center", justifyContent: "center", ...shadow.strong },
  hero: { color: "#1E3A8A", fontFamily: "Outfit_800ExtraBold", fontSize: 24, marginTop: 18, textAlign: "center", letterSpacing: -0.3 },
  subhero: { color: colors.textSecondary, fontFamily: "Manrope_500Medium", textAlign: "center", marginTop: 8, paddingHorizontal: 10 },

  activeCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#DCFCE7", padding: 14, borderRadius: radii.lg, marginTop: 20, borderWidth: 1, borderColor: "#86EFAC" },
  activeTitle: { ...typography.h3, color: "#166534" },
  activeSub: { ...typography.small, color: "#166534" },

  refBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#DCFCE7", padding: 12, borderRadius: radii.lg, marginTop: 14, borderWidth: 1, borderColor: "#86EFAC" },
  refBannerText: { color: "#166534", fontFamily: "Manrope_700Bold", fontSize: 13 },
  refPromo: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: radii.lg, marginTop: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.divider },
  refPromoText: { flex: 1, ...typography.small, color: colors.textPrimary, fontFamily: "Manrope_500Medium" },

  // Pricing cards
  planCard: { padding: 18, borderRadius: radii.xl, backgroundColor: "#fff", borderWidth: 1.5, borderColor: colors.divider, ...shadow.soft },
  planCardHighlighted: { borderColor: colors.primaryLight },
  planCardSelected: { borderColor: colors.primary, backgroundColor: "#EFF6FF", borderWidth: 2 },
  ribbon: { position: "absolute", top: -10, right: 14, backgroundColor: colors.gold, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, ...shadow.soft },
  ribbonText: { color: "#fff", fontFamily: "Manrope_700Bold", fontSize: 10, letterSpacing: 1 },
  planLabel: { ...typography.h3, fontSize: 17 },
  planTagline: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  planPrice: { fontFamily: "Outfit_800ExtraBold", fontSize: 26, color: colors.primary, marginTop: 8 },
  planPer: { fontFamily: "Manrope_500Medium", fontSize: 13, color: colors.textSecondary },
  radio: { width: 24, height: 24, borderRadius: 999, borderWidth: 2, borderColor: colors.divider, alignItems: "center", justifyContent: "center", marginLeft: 8 },
  radioSelected: { borderColor: colors.primary },
  radioInner: { width: 12, height: 12, borderRadius: 999, backgroundColor: colors.primary },

  // Comparison table
  compareTitle: { ...typography.h3, marginTop: 28, marginBottom: 10 },
  tableCard: { backgroundColor: "#fff", borderRadius: radii.xl, overflow: "hidden", borderWidth: 1, borderColor: colors.divider, ...shadow.soft },
  tableRow: { flexDirection: "row", alignItems: "center", minHeight: 48, paddingVertical: 8 },
  tableHeaderRow: { backgroundColor: "#EFF6FF", borderBottomWidth: 1, borderBottomColor: colors.divider },
  tableRowAlt: { backgroundColor: "#F8FAFC" },
  cellFeature: { width: 150, paddingHorizontal: 14, ...typography.small, color: colors.textPrimary, fontFamily: "Manrope_600SemiBold" },
  cellTier: { width: 90, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  cellHeaderText: { ...typography.small, color: colors.primary, fontFamily: "Manrope_700Bold", textAlign: "center" },
  cellText: { ...typography.small, fontFamily: "Manrope_600SemiBold", color: colors.textPrimary, textAlign: "center", fontSize: 12 },
  iconYes: { width: 26, height: 26, borderRadius: 999, backgroundColor: "#16A34A", alignItems: "center", justifyContent: "center" },
  iconNo: { width: 26, height: 26, borderRadius: 999, backgroundColor: "#CBD5E1", alignItems: "center", justifyContent: "center" },

  ctaBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 56, borderRadius: 999, ...shadow.strong },
  ctaText: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 17 },
  freeCta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 56, borderRadius: 999, backgroundColor: "#DCFCE7", borderWidth: 1, borderColor: "#86EFAC", marginTop: 22 },
  freeCtaText: { ...typography.body, color: "#166534", fontFamily: "Manrope_700Bold" },
  note: { ...typography.small, color: colors.textSecondary, textAlign: "center", marginTop: 18 },
  legal: { ...typography.small, color: colors.primary, textAlign: "center", marginTop: 6, textDecorationLine: "underline" },
});
