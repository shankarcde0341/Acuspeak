import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, gradients, radii, shadow, typography } from "@/src/theme";
import { Avatar, GlassCard, ProgressRing, ProTag, SectionTitle } from "@/src/components/ui";

export default function Profile() {
  const { user, refresh, signOut } = useAuth();
  const router = useRouter();
  const [ach, setAch] = useState<any[]>([]);

  const load = useCallback(async () => {
    try { const d = await api.achievements(); setAch(d.achievements || []); } catch { /* ignore */ }
    refresh();
  }, [refresh]);

  useEffect(() => { load(); }, [load]);

  if (!user) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const unlockedCount = ach.filter((a) => a.unlocked).length;
  const nextLevelXp = Math.max(500, Math.ceil((user.xp + 1) / 500) * 500);
  const levelProgress = user.xp / nextLevelXp;

  return (
    <View style={styles.root} testID="profile-screen">
      <LinearGradient colors={gradients.premium} style={styles.headerBg} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView contentContainerStyle={{ paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>Profile</Text>
            <TouchableOpacity onPress={signOut} testID="profile-signout" style={styles.signoutBtn}>
              <Ionicons name="log-out-outline" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.profileCard}>
            <Avatar uri={user.picture} name={user.name} size={96} isPremium={user.is_premium} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
              <Text style={styles.name} testID="profile-name">{user.name}</Text>
              {user.is_premium ? <ProTag size="md" /> : null}
            </View>
            <Text style={styles.email}>{user.email}</Text>
            <View style={styles.levelBadge}>
              <Ionicons name="school" size={12} color={colors.primary} />
              <Text style={styles.levelText}>{user.english_level}</Text>
              {user.is_premium ? (
                <View style={styles.premiumTag}><Ionicons name="star" size={10} color="#fff" /><Text style={styles.premiumTagText}>PREMIUM</Text></View>
              ) : null}
            </View>
          </View>

          {/* Stats */}
          <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
            <View style={styles.statsRow}>
              <GlassCard style={styles.statCard} testID="stat-xp">
                <View style={styles.statInner}>
                  <ProgressRing size={64} stroke={6} progress={levelProgress} color={colors.primaryLight}>
                    <Ionicons name="flash" size={20} color={colors.primaryLight} />
                  </ProgressRing>
                  <Text style={styles.statValue}>{user.xp}</Text>
                  <Text style={styles.statLabel}>Total XP</Text>
                </View>
              </GlassCard>
              <GlassCard style={styles.statCard} testID="stat-streak">
                <View style={styles.statInner}>
                  <View style={styles.statIcon}><Ionicons name="flame" size={24} color="#F59E0B" /></View>
                  <Text style={styles.statValue}>{user.streak}</Text>
                  <Text style={styles.statLabel}>Day streak</Text>
                </View>
              </GlassCard>
              <GlassCard style={styles.statCard} testID="stat-daily-minutes">
                <View style={styles.statInner}>
                  <View style={[styles.statIcon, { backgroundColor: "#D1FAE5" }]}><Ionicons name="hourglass" size={22} color="#059669" /></View>
                  <Text style={styles.statValue}>{Math.max(0, user.daily_goal_minutes - user.daily_goal_completed_minutes)}</Text>
                  <Text style={styles.statLabel}>Min left</Text>
                </View>
              </GlassCard>
            </View>

            {!user.is_premium && (
              <TouchableOpacity onPress={() => router.push("/premium")} activeOpacity={0.9} style={{ marginTop: 18 }} testID="profile-premium-cta">
                <LinearGradient colors={gradients.premium} style={styles.premiumCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.premiumTitle}>Go Premium</Text>
                    <Text style={styles.premiumSub}>Unlock unlimited AI Speaking, calls, certificates & more.</Text>
                  </View>
                  <View style={styles.diamondWrap}><Ionicons name="diamond" size={30} color="#F59E0B" /></View>
                </LinearGradient>
              </TouchableOpacity>
            )}

            <View style={{ marginTop: 22 }}>
              <SectionTitle title="Achievements" action="View all" onAction={() => router.push("/achievements")} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 16 }}>
                {ach.slice(0, 8).map((a) => (
                  <View key={a.id} style={[styles.achCard, !a.unlocked && styles.achLocked]} testID={`ach-${a.id}`}>
                    <View style={[styles.achIcon, !a.unlocked && { backgroundColor: colors.divider }]}>
                      <Ionicons name={a.icon} size={22} color={a.unlocked ? colors.gold : colors.textMuted} />
                    </View>
                    <Text style={[styles.achTitle, !a.unlocked && { color: colors.textMuted }]} numberOfLines={2}>{a.title}</Text>
                  </View>
                ))}
              </ScrollView>
              <Text style={styles.achMeta}>{unlockedCount}/{ach.length} unlocked</Text>
            </View>

            <View style={{ marginTop: 22 }}>
              <SectionTitle title="More" />
              <View style={{ gap: 10 }}>
                <MenuRow icon="star" label="My Membership" onPress={() => router.push("/membership")} testID="menu-membership" />
                <MenuRow icon="ribbon" label="Certificates" onPress={() => router.push("/certificates")} testID="menu-certificates" />
                <MenuRow icon="gift" label="Invite & Earn 20% Off" onPress={() => router.push("/referral")} testID="menu-referral" />
                <MenuRow icon="podium" label="Leaderboard" onPress={() => router.push("/leaderboard")} testID="menu-leaderboard" />
                <MenuRow icon="albums" label="Saved Vocabulary" onPress={() => router.push("/vocabulary")} testID="menu-saved-vocab" />
                <MenuRow icon="time" label="Call History" onPress={() => router.push("/call-history")} testID="menu-call-history" />
                <MenuRow icon="settings" label="Settings" onPress={() => router.push("/settings")} testID="menu-settings" />
                <MenuRow icon="shield-checkmark" label="Privacy Policy" onPress={() => router.push("/privacy")} testID="menu-privacy" />
                <MenuRow icon="document-text" label="Terms & Conditions" onPress={() => router.push("/terms")} testID="menu-terms" />
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function MenuRow({ icon, label, onPress, testID }: { icon: any; label: string; onPress: () => void; testID: string }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} testID={testID}>
      <GlassCard style={{ padding: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={styles.menuIcon}><Ionicons name={icon} size={18} color={colors.primary} /></View>
          <Text style={styles.menuLabel}>{label}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} style={{ marginLeft: "auto" }} />
        </View>
      </GlassCard>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerBg: { position: "absolute", top: 0, left: 0, right: 0, height: 280, borderBottomLeftRadius: 40, borderBottomRightRadius: 40 },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8 },
  headerTitle: { ...typography.h2, color: "#fff", fontSize: 22 },
  signoutBtn: { width: 40, height: 40, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  profileCard: { alignItems: "center", marginTop: 16, paddingHorizontal: 20 },
  avatar: { width: 96, height: 96, borderRadius: 999, borderWidth: 3, borderColor: "#fff", ...shadow.strong },
  avatarFallback: { backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: colors.primary, fontFamily: "Outfit_700Bold", fontSize: 40 },
  name: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 24, marginTop: 12 },
  email: { color: "rgba(255,255,255,0.7)", fontFamily: "Manrope_500Medium", fontSize: 13, marginTop: 2 },
  levelBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginTop: 12 },
  levelText: { color: colors.primary, fontFamily: "Manrope_700Bold", fontSize: 12 },
  premiumTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.gold, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 6 },
  premiumTagText: { color: "#fff", fontFamily: "Manrope_700Bold", fontSize: 9, letterSpacing: 1 },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, padding: 12, alignItems: "center", backgroundColor: "#fff" },
  statInner: { alignItems: "center" },
  statIcon: { width: 64, height: 64, borderRadius: 999, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" },
  statValue: { ...typography.h2, fontSize: 20, marginTop: 8 },
  statLabel: { ...typography.small, color: colors.textSecondary },
  premiumCard: { flexDirection: "row", alignItems: "center", padding: 20, borderRadius: radii.xl, gap: 12, ...shadow.strong },
  premiumTitle: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 18 },
  premiumSub: { color: "rgba(255,255,255,0.75)", fontFamily: "Manrope_500Medium", fontSize: 12, marginTop: 4 },
  diamondWrap: { width: 56, height: 56, borderRadius: 999, backgroundColor: "rgba(255,122,0,0.18)", borderColor: colors.premiumOrange, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  achCard: { width: 110, backgroundColor: "#fff", padding: 12, borderRadius: radii.lg, alignItems: "center", ...shadow.soft },
  achLocked: { backgroundColor: "#F1F5F9" },
  achIcon: { width: 52, height: 52, borderRadius: 999, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center" },
  achTitle: { ...typography.small, textAlign: "center", marginTop: 8, minHeight: 32, fontFamily: "Manrope_600SemiBold" },
  achMeta: { ...typography.small, color: colors.textSecondary, marginTop: 8 },
  menuIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" },
  menuLabel: { ...typography.body, color: colors.textPrimary, fontFamily: "Manrope_600SemiBold" },
});
