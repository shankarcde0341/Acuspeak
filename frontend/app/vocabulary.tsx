import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, gradients, radii, shadow, typography } from "@/src/theme";
import { ScreenHeader, GradientButton } from "@/src/components/ui";

type Mode = "all" | "saved";

export default function Vocabulary() {
  const router = useRouter();
  const { user, refresh, updateUser } = useAuth();
  const [words, setWords] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useState<Mode>("all");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const flip = useSharedValue(0);

  useEffect(() => {
    (async () => {
      try { const d = await api.vocab(); setWords(d.words || []); } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (mode === "saved") return words.filter((w) => user?.saved_words.includes(w.id));
    return words;
  }, [words, mode, user]);

  const current = filtered[idx];
  const isSaved = current ? user?.saved_words.includes(current.id) : false;

  const doFlip = () => {
    setFlipped((f) => !f);
    flip.value = withTiming(flipped ? 0 : 1, { duration: 400 });
  };
  const front = useAnimatedStyle(() => ({ opacity: 1 - flip.value }));
  const back = useAnimatedStyle(() => ({ opacity: flip.value }));

  const next = () => { setFlipped(false); flip.value = withTiming(0, { duration: 200 }); setIdx((i) => (i + 1) % Math.max(1, filtered.length)); };
  const prev = () => { setFlipped(false); flip.value = withTiming(0, { duration: 200 }); setIdx((i) => (i - 1 + filtered.length) % Math.max(1, filtered.length)); };

  const toggleSave = async () => {
    if (!current) return;
    try {
      if (isSaved) {
        const res = await api.unsaveWord(current.id);
        if (res && res.user_id) updateUser(res);
      } else {
        const res = await api.saveWord(current.id);
        if (res && res.user_id) updateUser(res);
        setToast("+2 XP earned!");
        setTimeout(() => setToast(null), 2200);
      }
      await refresh();
    } catch { /* ignore */ }
  };

  return (
    <View style={styles.root} testID="vocabulary-screen">
      <LinearGradient colors={["#EFF6FF", colors.bg]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScreenHeader title="Vocabulary" showBack onBack={() => router.back()} />
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, flexGrow: 1 }}>
          <View style={styles.tabsRow}>
            <TouchableOpacity onPress={() => { setMode("all"); setIdx(0); }} style={[styles.modeTab, mode === "all" && styles.modeTabActive]} testID="vocab-tab-all">
              <Text style={[styles.modeText, mode === "all" && styles.modeTextActive]}>All words</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setMode("saved"); setIdx(0); }} style={[styles.modeTab, mode === "saved" && styles.modeTabActive]} testID="vocab-tab-saved">
              <Text style={[styles.modeText, mode === "saved" && styles.modeTextActive]}>Saved ({user?.saved_words.length || 0})</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 }}><ActivityIndicator color={colors.primary} /></View>
          ) : filtered.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="albums-outline" size={60} color={colors.textMuted} />
              <Text style={styles.emptyText}>No saved words yet. Save some to revise later.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.counter}>{idx + 1} / {filtered.length}</Text>
              <TouchableOpacity activeOpacity={0.9} onPress={doFlip} style={{ marginTop: 12 }} testID="vocab-flashcard">
                <View style={styles.cardWrap}>
                  <Animated.View style={[styles.card, front]}>
                    <LinearGradient colors={gradients.primary} style={StyleSheet.absoluteFill} />
                    <Text style={styles.tapHint}>TAP TO FLIP</Text>
                    <Text style={styles.word}>{current.word}</Text>
                    <Text style={styles.phonetic}>{current.phonetic}</Text>
                    <View style={styles.levelChip}><Text style={styles.levelChipText}>{current.level}</Text></View>
                  </Animated.View>
                  <Animated.View style={[styles.card, styles.cardBack, back]}>
                    <Text style={styles.tapHint}>MEANING</Text>
                    <Text style={styles.meaning}>{current.meaning}</Text>
                    <View style={styles.divider} />
                    <Text style={styles.exampleLabel}>Example</Text>
                    <Text style={styles.example}>&quot;{current.example}&quot;</Text>
                  </Animated.View>
                </View>
              </TouchableOpacity>

              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.circleBtn} onPress={prev} testID="vocab-prev">
                  <Ionicons name="chevron-back" size={22} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtn, isSaved && styles.saveBtnActive]} onPress={toggleSave} testID="vocab-save-btn">
                  <Ionicons name={isSaved ? "bookmark" : "bookmark-outline"} size={18} color={isSaved ? "#fff" : colors.primary} />
                  <Text style={[styles.saveBtnText, isSaved && { color: "#fff" }]}>{isSaved ? "Saved" : "Save word"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.circleBtn} onPress={next} testID="vocab-next">
                  <Ionicons name="chevron-forward" size={22} color={colors.primary} />
                </TouchableOpacity>
              </View>

              <View style={{ marginTop: 22 }}>
                <GradientButton
                  label="Study another set"
                  icon="shuffle"
                  onPress={() => { setIdx(Math.floor(Math.random() * filtered.length)); setFlipped(false); flip.value = 0; }}
                  testID="vocab-shuffle"
                />
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
      {toast ? (
        <View style={styles.toast} testID="vocab-toast">
          <Ionicons name="flash" size={16} color="#fff" />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  toast: { position: "absolute", bottom: 40, left: 20, right: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 999, ...shadow.strong },
  toastText: { color: "#fff", fontFamily: "Manrope_700Bold" },
  tabsRow: { flexDirection: "row", backgroundColor: "#E2E8F0", padding: 4, borderRadius: 999, alignSelf: "center", gap: 4 },
  modeTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999 },
  modeTabActive: { backgroundColor: "#fff", ...shadow.soft },
  modeText: { ...typography.small, color: colors.textSecondary, fontFamily: "Manrope_600SemiBold" },
  modeTextActive: { color: colors.primary },
  counter: { ...typography.tiny, color: colors.textSecondary, textAlign: "center", marginTop: 18 },
  cardWrap: { height: 340 },
  card: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: radii.xl, padding: 24, justifyContent: "center", ...shadow.strong, overflow: "hidden" },
  cardBack: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.divider },
  tapHint: { color: "rgba(255,255,255,0.65)", fontFamily: "Manrope_700Bold", fontSize: 10, letterSpacing: 1.5, position: "absolute", top: 20, left: 24 },
  word: { color: "#fff", fontFamily: "Outfit_800ExtraBold", fontSize: 46, textAlign: "center" },
  phonetic: { color: "rgba(255,255,255,0.85)", fontFamily: "Manrope_500Medium", fontSize: 16, textAlign: "center", marginTop: 8 },
  levelChip: { alignSelf: "center", marginTop: 20, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  levelChipText: { color: "#fff", fontFamily: "Manrope_700Bold", fontSize: 11, letterSpacing: 1 },
  meaning: { ...typography.h2, fontSize: 22, textAlign: "center" },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 20 },
  exampleLabel: { ...typography.tiny, color: colors.textMuted, textAlign: "center" },
  example: { ...typography.body, fontStyle: "italic", textAlign: "center", marginTop: 8 },
  actionsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginTop: 22 },
  circleBtn: { width: 52, height: 52, borderRadius: 999, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", ...shadow.soft },
  saveBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 999, backgroundColor: "#fff", ...shadow.soft },
  saveBtnActive: { backgroundColor: colors.primary },
  saveBtnText: { ...typography.body, color: colors.primary, fontFamily: "Manrope_700Bold" },
  empty: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 12 },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
});
