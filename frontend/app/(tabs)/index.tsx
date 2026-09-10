import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl, ImageBackground } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Speech from "expo-speech";

import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/api/client";
import { colors, gradients, radii, shadow, typography } from "@/src/theme";
import { Avatar, GlassCard, GradientButton, ProgressRing, ProTag, SectionTitle } from "@/src/components/ui";

const CAT_IMAGES: Record<string, string> = {
  daily: "https://images.pexels.com/photos/8199231/pexels-photo-8199231.jpeg",
  business: "https://images.pexels.com/photos/8463151/pexels-photo-8463151.jpeg",
  interview: "https://images.pexels.com/photos/9870148/pexels-photo-9870148.jpeg",
  travel: "https://images.pexels.com/photos/32021944/pexels-photo-32021944.jpeg",
  public: "https://images.unsplash.com/photo-1544531586-fde5298cdd40",
  grammar: "https://images.unsplash.com/photo-1725981934390-d9bc9807ae31",
  vocab: "https://images.pexels.com/photos/36440699/pexels-photo-36440699.jpeg",
  pronunciation: "https://images.pexels.com/photos/6532362/pexels-photo-6532362.jpeg",
};

export default function Home() {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const d = await api.home(); setData(d); } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
      refresh();
    }, [load, refresh])
  );

  useEffect(() => {
    if (user && data) {
      if (data.xp !== user.xp || data.streak !== user.streak || data.daily_goal_completed_minutes !== user.daily_goal_completed_minutes) {
        setData((prev: any) => (prev ? { ...prev, xp: user.xp, streak: user.streak, daily_goal_completed_minutes: user.daily_goal_completed_minutes } : prev));
      }
    }
  }, [user, data]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(), refresh()]);
    setRefreshing(false);
  }, [load, refresh]);

  if (!data || !user) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} testID="home-loading" />;
  }

  const currentXp = user?.xp ?? data.xp ?? 0;
  const currentStreak = user?.streak ?? data.streak ?? 0;
  const completedMins = user?.daily_goal_completed_minutes ?? data.daily_goal_completed_minutes ?? 0;
  const totalGoalMins = user?.daily_goal_minutes ?? data.daily_goal_minutes ?? 15;
  const goalProgress = Math.min(1, completedMins / (totalGoalMins || 15));

  return (
    <View style={styles.root} testID="home-screen">
      <LinearGradient colors={["#EFF6FF", colors.bg]} style={StyleSheet.absoluteFill} />
      <View style={styles.orb} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 140, paddingHorizontal: 20, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Text style={styles.hi}>Hey, {data.welcome_name} 👋</Text>
                {user.is_premium ? <ProTag size="md" /> : null}
              </View>
              <Text style={styles.subHi}>{data.quote}</Text>
            </View>
            <TouchableOpacity onPress={() => router.push("/(tabs)/profile")} testID="home-avatar">
              <Avatar uri={user.picture} name={data.welcome_name} size={48} isPremium={user.is_premium} />
            </TouchableOpacity>
          </View>

          {/* Streak / XP / Daily Minutes Left strip */}
          <Animated.View entering={FadeInDown.duration(400)} style={styles.stripRow}>
            <View style={[styles.chip, { backgroundColor: "#FEF3C7" }]}>
              <Ionicons name="flame" size={16} color="#F59E0B" />
              <Text style={styles.chipText}>{currentStreak} day streak</Text>
            </View>
            <View style={[styles.chip, { backgroundColor: "#DBEAFE" }]}>
              <Ionicons name="flash" size={16} color="#2563EB" />
              <Text style={[styles.chipText, { color: "#1E3A8A" }]}>{currentXp} XP</Text>
            </View>
            <View style={[styles.chip, { backgroundColor: "#D1FAE5" }]}>
              <Ionicons name="hourglass" size={14} color="#059669" />
              <Text style={[styles.chipText, { color: "#065F46" }]}>{Math.max(0, totalGoalMins - completedMins)} min left</Text>
            </View>
          </Animated.View>

          {/* Daily goal card */}
          <Animated.View entering={FadeInDown.delay(80).duration(400)}>
            <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.goalCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.goalLabel}>Daily Speaking Goal</Text>
                <Text style={styles.goalMinutes}>
                  {data.daily_goal_completed_minutes}<Text style={styles.goalUnit}> / {data.daily_goal_minutes} min</Text>
                </Text>
                <Text style={styles.goalHint}>Keep going — you&apos;re {Math.round(goalProgress * 100)}% there.</Text>
                <TouchableOpacity style={styles.goalCta} onPress={() => router.push("/match")} testID="home-continue-btn">
                  <Text style={styles.goalCtaText}>Continue Learning</Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <ProgressRing size={100} stroke={9} progress={goalProgress} color="#fff" trackColor="rgba(255,255,255,0.25)">
                <Text style={styles.ringText}>{Math.round(goalProgress * 100)}%</Text>
              </ProgressRing>
            </LinearGradient>
          </Animated.View>

          {/* Word of the day */}
          <Animated.View entering={FadeInDown.delay(140).duration(400)} style={{ marginTop: 18 }}>
            <SectionTitle title="Word of the day" action="See all" onAction={() => router.push("/vocabulary")} />
            <LinearGradient colors={["#3B82F6", "#0EA5E9"] as const} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.wodCard} testID="home-word-of-day">
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Text style={styles.wodWord}>{data.word_of_the_day.word}</Text>
                    <TouchableOpacity
                      onPress={() => Speech.speak(data.word_of_the_day.word, { language: "en-US", rate: 0.85 })}
                      style={styles.wodSpeaker}
                      testID="home-word-speaker-btn"
                      activeOpacity={0.85}
                    >
                      <Ionicons name="volume-high" size={16} color="#fff" />
                    </TouchableOpacity>
                    {data.word_of_the_day.phonetic ? (
                      <View style={styles.phoneticBadge}>
                        <Text style={styles.wodPhonetic}>{data.word_of_the_day.phonetic}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.wodMeaning}>{data.word_of_the_day.meaning}</Text>
                  {data.word_of_the_day.example ? (
                    <View style={styles.exampleBox}>
                      <Text style={styles.wodExample}>&quot;{data.word_of_the_day.example}&quot;</Text>
                    </View>
                  ) : null}
                </View>
                <TouchableOpacity style={styles.wodBtn} onPress={() => router.push("/vocabulary")} testID="home-word-flashcards" activeOpacity={0.9}>
                  <Ionicons name="albums" size={20} color={colors.primary} />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* Speak with Real People */}
          <Animated.View entering={FadeInDown.delay(200).duration(400)} style={{ marginTop: 18 }}>
            <SectionTitle title="Don't just Learn Start Speaking" />
            <TouchableOpacity onPress={() => router.push("/match")} activeOpacity={0.85} testID="home-quick-match">
              <LinearGradient colors={["#3B82F6", "#0EA5E9"] as const} style={styles.quickWide}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.quickTag}>REAL PEOPLE</Text>
                  <Text style={styles.quickTitle}>Speak with Real People</Text>
                  <Text style={styles.quickSub}>Voice-call a real learner right now</Text>
                </View>
                <View style={styles.quickIconWrap}>
                  <Ionicons name="people" size={30} color="#fff" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          {/* Categories */}
          <Animated.View entering={FadeInDown.delay(260).duration(400)} style={{ marginTop: 22 }}>
            <SectionTitle title="English Lessons" action="Browse all" onAction={() => router.push("/(tabs)/practice")} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 12, gap: 12 }}>
              {data.categories.map((cat: any) => (
                <TouchableOpacity key={cat.id} onPress={() => router.push(`/lessons/${cat.id}`)} activeOpacity={0.9} testID={`home-cat-${cat.id}`}>
                  <ImageBackground source={{ uri: CAT_IMAGES[cat.id] }} style={styles.catCard} imageStyle={{ borderRadius: radii.lg }}>
                    <LinearGradient colors={["transparent", "rgba(2,6,23,0.85)"]} style={StyleSheet.absoluteFill} />
                    <View style={{ padding: 14 }}>
                      <View style={[styles.catIcon, { backgroundColor: cat.color }]}>
                        <Ionicons name={cat.icon} size={16} color="#fff" />
                      </View>
                      <Text style={styles.catTitle}>{cat.name}</Text>
                    </View>
                  </ImageBackground>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>

          {/* Daily challenges */}
          <Animated.View entering={FadeInDown.delay(320).duration(400)} style={{ marginTop: 22 }}>
            <SectionTitle title="Daily Challenges" action="View all" onAction={() => router.push("/challenges")} />
            <View style={{ gap: 12 }}>
              {data.challenges.slice(0, 3).map((c: any, index: number) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => {
                    if (c.id === "c3" || c.type === "quiz" || c.title?.toLowerCase().includes("quiz")) {
                      router.push("/quiz");
                    } else if (c.id === "c2" || c.type === "vocab" || c.title?.toLowerCase().includes("words")) {
                      router.push("/vocabulary");
                    } else if (index === 0 || c.type === "speak" || c.id === "c1") {
                      router.push("/match");
                    } else if (c.type === "lesson") {
                      router.push("/lessons/daily");
                    } else {
                      router.push("/challenges");
                    }
                  }}
                  activeOpacity={0.9}
                  testID={`home-challenge-${c.id}`}
                >
                  <GlassCard>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={styles.challengeIcon}>
                        <Ionicons name={c.icon} size={20} color="#fff" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.challengeTitle}>{c.title}</Text>
                        <Text style={styles.challengeDesc}>{c.description}</Text>
                      </View>
                      <View style={styles.xpBadge}>
                        <Ionicons name="flash" size={12} color="#1E3A8A" />
                        <Text style={styles.xpText}>+{c.xp}</Text>
                      </View>
                    </View>
                  </GlassCard>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>

          {/* Premium banner */}
          {!user.is_premium && (
            <TouchableOpacity onPress={() => router.push("/premium")} activeOpacity={0.9} style={{ marginTop: 22 }} testID="home-premium-banner">
              <LinearGradient colors={gradients.premium} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.premiumBanner}>
                <View style={{ flex: 1 }}>
                  <View style={styles.premiumTag}><Text style={styles.premiumTagText}>PREMIUM</Text></View>
                  <Text style={styles.premiumTitle}>Unlock unlimited practice</Text>
                  <Text style={styles.premiumSub}>Certificates, advanced analytics & offline lessons.</Text>
                </View>
                <Ionicons name="diamond" size={44} color="#F59E0B" />
              </LinearGradient>
            </TouchableOpacity>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  orb: { position: "absolute", top: -80, right: -60, width: 260, height: 260, borderRadius: 999, backgroundColor: "rgba(59,130,246,0.15)" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginTop: 4, marginBottom: 18 },
  hi: { ...typography.h1, fontSize: 26 },
  subHi: { ...typography.small, color: colors.textSecondary, marginTop: 4, maxWidth: 250 },
  avatar: { width: 46, height: 46, borderRadius: 999, borderWidth: 2, borderColor: "#fff", ...shadow.soft },
  avatarFallback: { backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 18 },
  stripRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { ...typography.small, fontFamily: "Manrope_600SemiBold", color: "#78350F" },

  goalCard: { flexDirection: "row", alignItems: "center", padding: 22, borderRadius: radii.xl, gap: 16, ...shadow.strong },
  goalLabel: { ...typography.small, color: "rgba(255,255,255,0.85)", letterSpacing: 0.4 },
  goalMinutes: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 36, marginTop: 2 },
  goalUnit: { fontSize: 16, color: "rgba(255,255,255,0.8)" },
  goalHint: { ...typography.small, color: "rgba(255,255,255,0.85)", marginTop: 4 },
  goalCta: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", marginTop: 12, backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, gap: 6 },
  goalCtaText: { ...typography.body, color: colors.primary, fontFamily: "Outfit_600SemiBold" },
  ringText: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 20 },

  wodCard: {
    padding: 11,
    borderRadius: radii.xl,
    ...shadow.strong,
  },
  wodWord: { fontFamily: "Outfit_800ExtraBold", fontSize: 24, color: "#FFFFFF" },
  wodSpeaker: { width: 34, height: 34, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.20)", alignItems: "center", justifyContent: "center" },
  phoneticBadge: { backgroundColor: "rgba(255,255,255,0.20)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill },
  wodPhonetic: { fontFamily: "Manrope_600SemiBold", fontSize: 12, color: "#FFFFFF" },
  wodMeaning: { ...typography.body, fontFamily: "Manrope_600SemiBold", color: "rgba(255,255,255,0.95)", marginTop: 10, lineHeight: 22 },
  exampleBox: { marginTop: 12, padding: 12, borderRadius: radii.md, backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", borderLeftWidth: 3, borderLeftColor: "#38BDF8" },
  wodExample: { ...typography.small, color: "rgba(255,255,255,0.90)", fontStyle: "italic", lineHeight: 20 },
  wodBtn: { width: 48, height: 48, borderRadius: radii.lg, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", ...shadow.soft },

  quickWide: { flexDirection: "row", alignItems: "center", gap: 14, padding: 20, borderRadius: radii.xl, ...shadow.strong },
  quickTag: { color: "rgba(255,255,255,0.8)", fontFamily: "Manrope_700Bold", fontSize: 10, letterSpacing: 1.4 },
  quickTitle: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 20, marginTop: 4 },
  quickSub: { color: "rgba(255,255,255,0.8)", fontFamily: "Manrope_500Medium", fontSize: 13, marginTop: 4 },
  quickIconWrap: { width: 62, height: 62, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },

  catCard: { width: 160, height: 190, borderRadius: radii.lg, overflow: "hidden", justifyContent: "flex-end" },
  catIcon: { width: 32, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  catTitle: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 15 },

  challengeIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  challengeTitle: { ...typography.h3, fontSize: 15 },
  challengeDesc: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  xpBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#DBEAFE" },
  xpText: { ...typography.small, color: "#1E3A8A", fontFamily: "Manrope_700Bold" },

  premiumBanner: { flexDirection: "row", alignItems: "center", padding: 22, borderRadius: radii.xl, gap: 16, ...shadow.strong },
  premiumTag: { alignSelf: "flex-start", backgroundColor: "rgba(245,158,11,0.2)", borderColor: colors.gold, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  premiumTagText: { color: colors.gold, fontFamily: "Manrope_700Bold", fontSize: 10, letterSpacing: 1.5 },
  premiumTitle: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 18, marginTop: 6 },
  premiumSub: { color: "rgba(255,255,255,0.75)", fontFamily: "Manrope_500Medium", fontSize: 12, marginTop: 3 },
});
