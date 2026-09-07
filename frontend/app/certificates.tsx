import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, Platform, Linking } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, gradients, radii, shadow, typography } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ui";

export default function Certificates() {
  const router = useRouter();
  const { user } = useAuth();
  const certs = user?.certificates || [];

  const shareCert = async (c: any) => {
    const msg = `I just earned my ${c.title} on Acuspeak with a score of ${c.score}/100! 🎉 Learn English with me — get 20% off Premium with my code. https://lingua-franca-6.preview.emergentagent.com`;
    try {
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(msg);
      } else {
        await Share.share({ message: msg });
      }
    } catch { /* ignore */ }
  };

  const shareTo = async (network: "whatsapp" | "linkedin" | "twitter", c: any) => {
    let refCode = "";
    try { const r = await api.getReferral(); refCode = r.referral_code; } catch { /* ignore */ }
    const msg = encodeURIComponent(`I just earned my ${c.title} on Acuspeak (${c.score}/100)! 🎉 Get 20% off Premium with code ${refCode}: https://lingua-franca-6.preview.emergentagent.com`);
    const map: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${msg}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent("https://lingua-franca-6.preview.emergentagent.com")}&summary=${msg}`,
      twitter: `https://twitter.com/intent/tweet?text=${msg}`,
    };
    try {
      if (Platform.OS === "web" && typeof window !== "undefined") window.open(map[network], "_blank");
      else await Linking.openURL(map[network]);
    } catch { /* ignore */ }
  };

  return (
    <View style={styles.root} testID="certificates-screen">
      <LinearGradient colors={["#FFFBEB", colors.bg]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader title="Certificates" showBack onBack={() => router.back()} right={
          <TouchableOpacity onPress={() => router.push("/referral")} testID="cert-header-referral">
            <View style={styles.giftBtn}><Ionicons name="gift" size={16} color="#fff" /></View>
          </TouchableOpacity>
        } />
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 160 }}>
          {certs.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="ribbon" size={54} color={colors.textMuted} />
              <Text style={styles.emptyText}>No certificates yet</Text>
              <Text style={styles.emptySub}>Score 80+ on a speaking test to earn your first certificate.</Text>
            </View>
          ) : (
            certs.map((c: any, i: number) => (
              <View key={c.id || i} style={{ marginBottom: 16 }}>
                <View style={styles.certCard} testID={`certificate-${c.id}`}>
                  <LinearGradient colors={gradients.premium} style={StyleSheet.absoluteFill} />
                  <View style={styles.certHeader}>
                    <Ionicons name="ribbon" size={28} color={colors.gold} />
                    <View style={styles.premiumChip}><Text style={styles.premiumChipText}>CERTIFICATE</Text></View>
                  </View>
                  <Text style={styles.certTitle}>{c.title}</Text>
                  <Text style={styles.certName}>Awarded to <Text style={{ color: "#F59E0B" }}>{user?.name}</Text></Text>
                  <View style={styles.certFooter}>
                    <View>
                      <Text style={styles.footerLabel}>Score</Text>
                      <Text style={styles.footerValue}>{c.score}/100</Text>
                    </View>
                    <View>
                      <Text style={styles.footerLabel}>Date</Text>
                      <Text style={styles.footerValue}>{c.date}</Text>
                    </View>
                    <View>
                      <Text style={styles.footerLabel}>Issued by</Text>
                      <Text style={styles.footerValue}>Acuspeak</Text>
                    </View>
                  </View>
                </View>

                {/* Share row */}
                <View style={styles.shareRow}>
                  <Text style={styles.shareTitle}>Share your win — earn 20% off Premium</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <TouchableOpacity onPress={() => shareTo("whatsapp", c)} style={[styles.shareBtn, { backgroundColor: "#25D366" }]} testID={`share-cert-whatsapp-${c.id}`}>
                      <Ionicons name="logo-whatsapp" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => shareTo("linkedin", c)} style={[styles.shareBtn, { backgroundColor: "#0A66C2" }]} testID={`share-cert-linkedin-${c.id}`}>
                      <Ionicons name="logo-linkedin" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => shareTo("twitter", c)} style={[styles.shareBtn, { backgroundColor: "#1DA1F2" }]} testID={`share-cert-twitter-${c.id}`}>
                      <Ionicons name="logo-twitter" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => shareCert(c)} style={[styles.shareBtn, { backgroundColor: colors.primary }]} testID={`share-cert-more-${c.id}`}>
                      <Ionicons name="share-social" size={18} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  giftBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 8 },
  emptyText: { ...typography.h2 },
  emptySub: { ...typography.body, color: colors.textSecondary, textAlign: "center", paddingHorizontal: 20 },
  certCard: { padding: 22, borderRadius: radii.xl, overflow: "hidden", ...shadow.strong },
  certHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  premiumChip: { backgroundColor: "rgba(245,158,11,0.2)", borderColor: colors.gold, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  premiumChipText: { color: colors.gold, fontFamily: "Manrope_700Bold", fontSize: 10, letterSpacing: 1 },
  certTitle: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 22, marginTop: 22 },
  certName: { color: "rgba(255,255,255,0.75)", fontFamily: "Manrope_500Medium", marginTop: 4 },
  certFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 22 },
  footerLabel: { color: "rgba(255,255,255,0.6)", fontFamily: "Manrope_700Bold", fontSize: 10, letterSpacing: 1, textTransform: "uppercase" },
  footerValue: { color: "#fff", fontFamily: "Outfit_600SemiBold", marginTop: 4 },
  shareRow: { marginTop: 10, backgroundColor: "#fff", padding: 14, borderRadius: radii.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, ...shadow.soft },
  shareTitle: { ...typography.small, flex: 1, color: colors.textPrimary, fontFamily: "Manrope_600SemiBold" },
  shareBtn: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
