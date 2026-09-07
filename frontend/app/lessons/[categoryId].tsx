import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, ImageBackground } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";

import { api } from "@/src/api/client";
import { colors, gradients, radii, shadow, typography } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ui";

const CAT_HERO: Record<string, string> = {
  daily: "https://images.pexels.com/photos/8199231/pexels-photo-8199231.jpeg",
  business: "https://images.pexels.com/photos/8463151/pexels-photo-8463151.jpeg",
  interview: "https://images.pexels.com/photos/9870148/pexels-photo-9870148.jpeg",
  travel: "https://images.pexels.com/photos/32021944/pexels-photo-32021944.jpeg",
  public: "https://images.unsplash.com/photo-1544531586-fde5298cdd40",
  grammar: "https://images.unsplash.com/photo-1725981934390-d9bc9807ae31",
  vocab: "https://images.pexels.com/photos/36440699/pexels-photo-36440699.jpeg",
  pronunciation: "https://images.pexels.com/photos/6532362/pexels-photo-6532362.jpeg",
};

export default function LessonList() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const router = useRouter();
  const [lessons, setLessons] = useState<any[]>([]);
  const [category, setCategory] = useState<any | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      (async () => {
        try {
          const [cats, ls, prog] = await Promise.all([
            api.lessonCategories(),
            api.lessons(categoryId as string),
            api.lessonProgress(),
          ]);
          if (isMounted) {
            setCategory((cats.categories || []).find((c: any) => c.id === categoryId));
            setLessons(ls.lessons || []);
            setCompleted(prog.completed_ids || []);
          }
        } catch {
          /* ignore */
        }
        if (isMounted) setLoading(false);
      })();
      return () => {
        isMounted = false;
      };
    }, [categoryId])
  );

  return (
    <View style={styles.root} testID="lesson-list-screen">
      <ImageBackground source={{ uri: CAT_HERO[categoryId as string] }} style={styles.hero}>
        <LinearGradient colors={["rgba(15,23,42,0.4)", "rgba(15,23,42,0.85)"]} style={StyleSheet.absoluteFill} />
        <SafeAreaView edges={["top"]}>
          <ScreenHeader title={category?.name || "Lessons"} showBack onBack={() => router.back()} testID="lesson-list-header" />
          <View style={{ padding: 20 }}>
            <Text style={styles.heroTitle}>{category?.name}</Text>
            <Text style={styles.heroSub}>{lessons.length} lessons · Bite-sized · Practical</Text>
          </View>
        </SafeAreaView>
      </ImageBackground>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 160 }} showsVerticalScrollIndicator={false}>
          {lessons.map((l, i) => {
            const done = completed.includes(l.id);
            return (
              <Animated.View key={l.id} entering={FadeInDown.delay(60 + i * 30).duration(400)}>
                <TouchableOpacity onPress={() => router.push({ pathname: "/lesson/[id]", params: { id: l.id } })} activeOpacity={0.9} style={styles.lessonRow} testID={`lesson-${l.id}`}>
                  <View style={[styles.lessonNum, done && { backgroundColor: colors.accent }]}>
                    {done ? <Ionicons name="checkmark" size={18} color="#fff" /> : <Text style={styles.lessonNumText}>{i + 1}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lessonTitle}>{l.title}</Text>
                    <Text style={styles.lessonDesc}>{l.description}</Text>
                    <View style={{ flexDirection: "row", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                      <View style={styles.metaBadge}><Ionicons name="time" size={11} color={colors.textSecondary} /><Text style={styles.metaText}>{l.duration_minutes} min</Text></View>
                      <View style={styles.metaBadge}><Ionicons name="flash" size={11} color={colors.primary} /><Text style={[styles.metaText, { color: colors.primary }]}>+{l.xp_reward} XP</Text></View>
                      <View style={styles.metaBadge}><Text style={styles.metaText}>{l.level}</Text></View>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hero: { minHeight: 200, overflow: "hidden", borderBottomLeftRadius: radii.xl, borderBottomRightRadius: radii.xl },
  heroTitle: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 30 },
  heroSub: { color: "rgba(255,255,255,0.8)", fontFamily: "Manrope_500Medium", fontSize: 13, marginTop: 4 },
  lessonRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14, backgroundColor: colors.surface, borderRadius: radii.lg, marginBottom: 12, ...shadow.soft },
  lessonNum: { width: 40, height: 40, borderRadius: 999, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  lessonNumText: { color: "#fff", fontFamily: "Outfit_700Bold" },
  lessonTitle: { ...typography.h3, fontSize: 15 },
  lessonDesc: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  metaBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F1F5F9", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  metaText: { ...typography.small, fontSize: 11, color: colors.textSecondary },
});
