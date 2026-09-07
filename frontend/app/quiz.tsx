import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, gradients, radii, shadow, typography } from "@/src/theme";
import { ScreenHeader, GradientButton, ProgressRing } from "@/src/components/ui";

export default function Quiz() {
  const router = useRouter();
  const { refresh, updateUser } = useAuth();
  const [questions, setQuestions] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [finished, setFinished] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => { try { const d = await api.quiz(); setQuestions(d.questions || []); } catch { /* ignore */ } })();
  }, []);

  if (questions.length === 0) return <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>;

  const q = questions[idx];

  const pick = (i: number) => {
    if (answered) return;
    setSelected(i);
    setAnswered(true);
    if (i === q.answer) setCorrect((c) => c + 1);
  };

  const next = async () => {
    if (idx < questions.length - 1) {
      setIdx(idx + 1); setSelected(null); setAnswered(false);
    } else {
      setSubmitting(true);
      try {
        const xp = 5;
        const res = await api.addXp(xp, "quiz-set-completed", 0);
        if (res && res.user_id) updateUser(res);
        try { await api.completeChallenge("c3"); } catch { /* ignore */ }
        await refresh();
      } catch { /* ignore */ }
      setSubmitting(false);
      setFinished(true);
    }
  };

  const progress = (idx + 1) / questions.length;
  const scorePct = correct / questions.length;

  return (
    <View style={styles.root} testID="quiz-screen">
      <LinearGradient colors={["#F5F3FF", colors.bg]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScreenHeader title="Quiz" showBack onBack={() => router.back()} />
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40, flexGrow: 1 }}>
          {finished ? (
            <View style={{ alignItems: "center", marginTop: 30 }}>
              <ProgressRing size={160} stroke={12} progress={scorePct} color={colors.primaryLight}>
                <Text style={styles.finalScore}>{Math.round(scorePct * 100)}%</Text>
              </ProgressRing>
              <Text style={styles.finishedTitle}>Quiz Set Complete!</Text>
              <Text style={styles.finishedSub}>You got {correct} out of {questions.length} correct.</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#DBEAFE", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, marginTop: 14 }}>
                <Ionicons name="flash" size={16} color="#1E3A8A" />
                <Text style={{ fontFamily: "Manrope_700Bold", color: "#1E3A8A", fontSize: 14 }}>+5 XP earned!</Text>
              </View>
              <View style={{ marginTop: 30, width: "100%", gap: 12 }}>
                <GradientButton label="Take another 5-question quiz" icon="reload" onPress={async () => {
                  setQuestions([]);
                  setFinished(false);
                  setIdx(0);
                  setSelected(null);
                  setCorrect(0);
                  setAnswered(false);
                  try { const d = await api.quiz(); setQuestions(d.questions || []); } catch { /* ignore */ }
                }} testID="quiz-again-btn" />
                <TouchableOpacity onPress={() => router.replace("/(tabs)/practice")} style={{ paddingVertical: 12, alignItems: "center" }} testID="quiz-back-btn">
                  <Text style={{ fontFamily: "Manrope_600SemiBold", color: colors.textSecondary }}>Back to Practice</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
              <Text style={styles.progressText}>Question {idx + 1} of {questions.length}</Text>
              <Animated.View entering={FadeIn.duration(300)} style={styles.qCard}>
                <Text style={styles.qText}>{q.question}</Text>
                <View style={{ marginTop: 22, gap: 10 }}>
                  {q.options.map((opt: string, i: number) => {
                    const isSel = selected === i;
                    const isCorrect = answered && i === q.answer;
                    const isWrong = answered && isSel && i !== q.answer;
                    return (
                      <TouchableOpacity
                        key={i}
                        activeOpacity={0.9}
                        onPress={() => pick(i)}
                        style={[styles.option, isSel && styles.optionSel, isCorrect && styles.optionCorrect, isWrong && styles.optionWrong]}
                        testID={`quiz-option-${i}`}
                      >
                        <View style={[styles.optDot, isCorrect && { backgroundColor: "#16A34A", borderColor: "#16A34A" }, isWrong && { backgroundColor: "#DC2626", borderColor: "#DC2626" }]}>
                          {isCorrect ? <Ionicons name="checkmark" size={14} color="#fff" /> : isWrong ? <Ionicons name="close" size={14} color="#fff" /> : null}
                        </View>
                        <Text style={styles.optText}>{opt}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Animated.View>
              {answered ? (
                <View style={{ marginTop: 22 }}>
                  <GradientButton label={idx === questions.length - 1 ? (submitting ? "Submitting..." : "See results") : "Next"} icon="arrow-forward" onPress={next} disabled={submitting} testID="quiz-next-btn" />
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  progressBar: { height: 6, borderRadius: 999, backgroundColor: colors.divider, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: colors.primaryLight, borderRadius: 999 },
  progressText: { ...typography.small, color: colors.textSecondary, marginTop: 8 },
  qCard: { padding: 20, borderRadius: radii.xl, backgroundColor: "#fff", marginTop: 18, ...shadow.card },
  qText: { ...typography.h2, fontSize: 20, lineHeight: 28 },
  option: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1.5, borderColor: colors.divider, borderRadius: 16, padding: 14, backgroundColor: "#F8FAFC" },
  optionSel: { borderColor: colors.primary, backgroundColor: "#EFF6FF" },
  optionCorrect: { borderColor: "#16A34A", backgroundColor: "#DCFCE7" },
  optionWrong: { borderColor: "#DC2626", backgroundColor: "#FEE2E2" },
  optDot: { width: 22, height: 22, borderRadius: 999, borderWidth: 1.5, borderColor: colors.divider, alignItems: "center", justifyContent: "center" },
  optText: { ...typography.body, flex: 1 },
  finalScore: { fontFamily: "Outfit_800ExtraBold", fontSize: 40, color: colors.primary },
  finishedTitle: { ...typography.h1, marginTop: 20 },
  finishedSub: { ...typography.body, color: colors.textSecondary, marginTop: 6, textAlign: "center" },
});
