import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, gradients, radii, shadow, typography } from "@/src/theme";
import { Avatar, ProTag, ScreenHeader } from "@/src/components/ui";

const MEDAL: Record<number, string> = { 0: "#F59E0B", 1: "#94A3B8", 2: "#B45309" };

export default function Leaderboard() {
  const router = useRouter();
  const { user: myUser } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await api.weeklyLeaderboard();
        setRows(Array.isArray(d.leaderboard) ? d.leaderboard : []);
        setMe(d.me_user_id);
      } catch {
        setRows([]);
      }
      setLoading(false);
    })();
  }, []);

  const scoreKey = useMemo(() => {
    if (rows.some((row) => typeof row.weekly_xp === "number")) return "weekly_xp";
    return "xp";
  }, [rows]);

  const normalizedRows = useMemo(() => {
    return [...rows]
      .map((row) => ({
        ...row,
        weekly_xp: typeof row.weekly_xp === "number" ? row.weekly_xp : row.xp || 0,
        name: row.name || "Anonymous",
        picture: row.picture || null,
      }))
      .sort((a, b) => (b.weekly_xp ?? 0) - (a.weekly_xp ?? 0));
  }, [rows]);

  const userRank = useMemo(() => normalizedRows.findIndex((row) => row.user_id === me) + 1, [normalizedRows, me]);
  const headerLabel = scoreKey === "weekly_xp" ? "Weekly XP" : "XP";

  return (
    <View style={styles.root} testID="leaderboard-screen">
      <LinearGradient colors={gradients.premium} style={styles.headerBg} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader title="Weekly Leaderboard" showBack onBack={() => router.back()} />
        <View style={styles.title}>
          <Ionicons name="trophy" size={28} color="#F59E0B" />
          <View>
            <Text style={styles.titleText}>Weekly Champions</Text>
            <Text style={styles.subtitle}>Track the top performers for the current week.</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
        ) : (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
            {normalizedRows.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No weekly data yet.</Text>
                <Text style={styles.emptySubtitle}>Come back once the leaderboard has real performance stats.</Text>
              </View>
            ) : (
              <>
                <View style={styles.podium}>
                  <PodiumCard user={normalizedRows[1]} rank={2} height={100} scoreKey={scoreKey} myUser={myUser} me={me} />
                  <PodiumCard user={normalizedRows[0]} rank={1} height={140} scoreKey={scoreKey} myUser={myUser} me={me} />
                  <PodiumCard user={normalizedRows[2]} rank={3} height={80} scoreKey={scoreKey} myUser={myUser} me={me} />
                </View>

                <View style={styles.summaryCard}>
                  <Text style={styles.summaryLabel}>Your weekly rank</Text>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryRank}>#{userRank > 0 ? userRank : "—"}</Text>
                    <Text style={styles.summaryScore}>{headerLabel}: {userRank > 0 ? normalizedRows[userRank - 1]?.weekly_xp : 0}</Text>
                  </View>
                </View>

                {normalizedRows.slice(3).map((u, i) => {
                  const rank = i + 4;
                  const mine = u.user_id === me;
                  const isUserPremium = mine ? Boolean(myUser?.is_premium) : Boolean(u.is_premium);
                  return (
                    <View key={u.user_id} style={[styles.row, mine && styles.rowMe]}>
                      <Text style={styles.rank}>#{rank}</Text>
                      <Avatar uri={u.picture} name={u.name} size={42} isPremium={isUserPremium} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={styles.name}>{u.name}</Text>
                          {isUserPremium ? <ProTag size="sm" /> : null}
                        </View>
                        <View style={styles.metaRow}>
                          <Ionicons name="flame" size={12} color="#F59E0B" />
                          <Text style={styles.streak}>{u.streak || 0} day streak</Text>
                        </View>
                      </View>
                      <View style={styles.xpBadge}>
                        <Ionicons name="flash" size={12} color="#1E3A8A" />
                        <Text style={styles.xpText}>{u.weekly_xp}</Text>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

function PodiumCard({ user, rank, height, scoreKey, myUser, me }: { user: any; rank: number; height: number; scoreKey: string; myUser: any; me: string | null }) {
  if (!user) return <View style={{ flex: 1, alignItems: "center" }} />;
  const isUserPremium = user.user_id === me ? Boolean(myUser?.is_premium) : Boolean(user.is_premium);
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Avatar uri={user.picture} name={user.name} size={64} isPremium={isUserPremium} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, justifyContent: "center" }}>
        <Text style={styles.podiumName} numberOfLines={1}>{user.name}</Text>
        {isUserPremium ? <ProTag size="sm" /> : null}
      </View>
      <Text style={styles.podiumXp}>{user[scoreKey]} {scoreKey === "weekly_xp" ? "XP" : "XP"}</Text>
      <View style={[styles.podiumBar, { height, backgroundColor: MEDAL[rank - 1] }]}>  
        <Text style={styles.podiumRank}>#{rank}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  headerBg: { position: "absolute", top: 0, left: 0, right: 0, height: 280, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  title: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 4, marginBottom: 20, paddingHorizontal: 20 },
  titleText: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 22 },
  subtitle: { color: "rgba(255,255,255,0.85)", fontFamily: "Manrope_500Medium", fontSize: 13, marginTop: 4 },
  podium: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", paddingHorizontal: 20, marginBottom: 24, gap: 12 },
  podiumAvatar: { width: 64, height: 64, borderRadius: 999, borderWidth: 2, borderColor: "#fff" },
  podiumName: { color: "#fff", fontFamily: "Outfit_600SemiBold", marginTop: 10, fontSize: 13, width: 84, textAlign: "center" },
  podiumXp: { color: "rgba(255,255,255,0.7)", fontFamily: "Manrope_500Medium", fontSize: 11, marginTop: 4 },
  podiumBar: { width: "80%", marginTop: 8, borderTopLeftRadius: 12, borderTopRightRadius: 12, alignItems: "center", justifyContent: "center" },
  podiumRank: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 20 },
  summaryCard: { borderRadius: radii.xl, backgroundColor: "#fff", padding: 16, marginBottom: 18, ...shadow.soft },
  summaryLabel: { ...typography.small, color: colors.textSecondary, marginBottom: 6 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryRank: { ...typography.h2, fontFamily: "Outfit_700Bold", color: colors.primary },
  summaryScore: { ...typography.h3, color: colors.textPrimary },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: "#fff", borderRadius: radii.lg, marginBottom: 10, ...shadow.soft },
  rowMe: { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: "#EFF6FF" },
  rank: { ...typography.h3, color: colors.textSecondary, width: 34 },
  avatar: { width: 42, height: 42, borderRadius: 999 },
  avatarFallback: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarInit: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 16 },
  name: { ...typography.body, fontFamily: "Manrope_700Bold" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  streak: { ...typography.small, color: colors.textSecondary },
  xpBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#DBEAFE", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  xpText: { color: "#1E3A8A", fontFamily: "Manrope_700Bold", fontSize: 12 },
  emptyState: { marginTop: 40, padding: 22, borderRadius: radii.xl, backgroundColor: "rgba(255,255,255,0.85)", alignItems: "center" },
  emptyTitle: { ...typography.h2, color: colors.textPrimary, textAlign: "center" },
  emptySubtitle: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginTop: 8 },
});
