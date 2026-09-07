import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, gradients, radii, shadow, typography } from "@/src/theme";
import { ScreenHeader, GradientButton } from "@/src/components/ui";
import { ScriptRolePlayer } from "@/src/components/ScriptRolePlayer";

interface ScriptLine {
  line_id: string;
  speaker: string;
  text: string;
}

interface ContentItem {
  type: "intro" | "phrase" | "tip";
  text: string;
}

interface Lesson {
  id: string;
  category_id?: string;
  title: string;
  description: string;
  level: string;
  duration_minutes: number;
  xp_reward: number;
  script: ScriptLine[];
  content: ContentItem[];
}

export default function LessonDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { refresh, updateUser } = useAuth();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [completing, setCompleting] = useState(false);
  const [xpEarned, setXpEarned] = useState<number | null>(null);


  useEffect(() => {
    (async () => {
      try { const d = await api.lesson(id as string); setLesson(d); } catch { /* ignore */ }
    })();
  }, [id]);

  const getCatId = () => {
    if (lesson?.category_id) return lesson.category_id;
    if (typeof id === "string") {
      if (id.startsWith("biz")) return "business";
      if (id.startsWith("int")) return "interview";
      if (id.startsWith("trv")) return "travel";
      if (id.startsWith("pub")) return "public";
      if (id.startsWith("grm")) return "grammar";
      if (id.startsWith("voc")) return "vocab";
      if (id.startsWith("prn")) return "pronunciation";
      if (id.includes("-")) return id.split("-")[0];
    }
    return "daily";
  };

  const handleBack = () => {
    const catId = getCatId();
    router.replace({ pathname: "/lessons/[categoryId]", params: { categoryId: catId } });
  };

  const complete = async () => {
    if (!lesson) return;
    setCompleting(true);
    try {
      const res = await api.completeLesson(lesson.id);
      if (res?.user) updateUser(res.user);
      setXpEarned(res.xp_earned);
      await refresh();
      setTimeout(() => {
        handleBack();
      }, 1200);
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setCompleting(false);
    }
  };

  if (!lesson) return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <View style={styles.root} testID="lesson-detail-screen">
      <LinearGradient colors={["#EFF6FF", colors.bg]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScreenHeader title="Lesson" showBack onBack={handleBack} />
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          <View style={styles.tagRow}>
            <View style={styles.tag}><Text style={styles.tagText}>{lesson.level}</Text></View>
            <View style={styles.tag}><Ionicons name="time" size={12} color={colors.textSecondary} /><Text style={styles.tagText}>{lesson.duration_minutes} min</Text></View>
            <View style={[styles.tag, { backgroundColor: "#DBEAFE" }]}><Ionicons name="flash" size={12} color={colors.primary} /><Text style={[styles.tagText, { color: colors.primary }]}>+{lesson.xp_reward} XP</Text></View>
          </View>
          <Text style={styles.title}>{lesson.title}</Text>
          <Text style={styles.desc}>{lesson.description}</Text>

          {lesson.script?.length > 0 ? (
            <ScriptRolePlayer script={lesson.script} lessonId={lesson.id} onBack={handleBack} onComplete={complete} />
          ) : (
            <View style={{ marginTop: 24, gap: 12 }}>
              {lesson.content.map((c: ContentItem, i: number) => (
                <Animated.View key={i} entering={FadeInDown.delay(80 + i * 60).duration(400)}>
                  <View style={styles.step}>
                    <View style={[styles.stepBadge, c.type === "tip" ? styles.tipBadge : c.type === "intro" ? styles.introBadge : styles.phraseBadge]}>
                      <Ionicons name={c.type === "tip" ? "bulb" : c.type === "intro" ? "book" : "chatbubble-ellipses"} size={16} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.stepLabel}>{c.type === "tip" ? "TIP" : c.type === "intro" ? "INTRO" : "PRACTICE"}</Text>
                      <Text style={styles.stepText}>{c.text}</Text>
                    </View>
                  </View>
                </Animated.View>
              ))}
            </View>
          )}

          {xpEarned ? (
            <View style={{ marginTop: 24, gap: 12 }}>
              <View style={styles.successCard} testID="lesson-complete-toast">
                <Ionicons name="checkmark-circle" size={22} color={colors.accent} />
                <Text style={styles.successText}>Lesson complete! +{xpEarned} XP</Text>
              </View>
              <GradientButton
                testID="lesson-back-to-list-btn"
                label="Go to Lessons List"
                icon="arrow-forward"
                onPress={handleBack}
              />
            </View>
          ) : (
            <View style={{ marginTop: 24 }}>
              <GradientButton
                testID="lesson-complete-btn"
                label={completing ? "Marking..." : "Mark as complete"}
                icon="checkmark-circle"
                onPress={complete}
                disabled={completing}
              />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tagRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F1F5F9", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  tagText: { ...typography.small, fontSize: 11, color: colors.textSecondary },
  title: { ...typography.h1, fontSize: 26, marginTop: 12 },
  desc: { ...typography.body, color: colors.textSecondary, marginTop: 6 },
  step: { flexDirection: "row", gap: 12, padding: 16, backgroundColor: colors.surface, borderRadius: radii.lg, ...shadow.soft },
  stepBadge: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  introBadge: { backgroundColor: colors.primary },
  phraseBadge: { backgroundColor: colors.accent },
  tipBadge: { backgroundColor: colors.gold },
  stepLabel: { ...typography.tiny, color: colors.textMuted },
  stepText: { ...typography.body, marginTop: 4 },
  successCard: { marginTop: 24, flexDirection: "row", alignItems: "center", gap: 10, padding: 16, borderRadius: radii.lg, backgroundColor: "#DCFCE7", borderWidth: 1, borderColor: "#86EFAC" },
  successText: { ...typography.body, color: "#166534", fontFamily: "Manrope_700Bold" },
});
