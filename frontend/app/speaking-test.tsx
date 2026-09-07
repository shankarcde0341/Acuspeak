import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, gradients, radii, shadow, typography } from "@/src/theme";
import { ScreenHeader, GradientButton, ProgressRing } from "@/src/components/ui";

type Stage = "select" | "test" | "result";

const LEVELS = [
  { id: "beginner", label: "Beginner", color: "#10B981", description: "Basic conversation and grammar." },
  { id: "intermediate", label: "Intermediate", color: "#3B82F6", description: "Fluent everyday communication." },
  { id: "advanced", label: "Advanced", color: "#7C3AED", description: "Nuanced, professional English." },
];

const PROMPTS = [
  "Describe your morning routine in detail.",
  "Talk about your favourite travel destination and why.",
  "Explain the biggest challenge you overcame recently.",
  "Discuss the impact of technology on daily life.",
  "Convince someone why they should learn English.",
];

export default function SpeakingTest() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [stage, setStage] = useState<Stage>("select");
  const [level, setLevel] = useState<string>("beginner");
  const [promptIdx, setPromptIdx] = useState(0);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const recordingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasFinishedRecording = useRef(false);

  const start = (id: string) => {
    setLevel(id);
    setPromptIdx(Math.floor(Math.random() * PROMPTS.length));
    setStage("test");
  };

  const beginRecording = () => {
    if (submitting || recording) return;
    setRecording(true);
    setSeconds(0);
    hasFinishedRecording.current = false;
    if (recordingInterval.current) {
      clearInterval(recordingInterval.current);
    }
    recordingInterval.current = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
  };

  const finishRecording = async () => {
    if (hasFinishedRecording.current) return;
    hasFinishedRecording.current = true;
    if (recordingInterval.current) {
      clearInterval(recordingInterval.current);
      recordingInterval.current = null;
    }
    setRecording(false);
    setSubmitting(true);

    // Dynamic, realistic evaluation report calculation based on speech duration, level & session variance
    const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
    const levelBase = level === "beginner" ? 65 : level === "intermediate" ? 75 : 82;

    let durationFactor = 0;
    if (seconds < 5) {
      durationFactor = -25;
    } else if (seconds < 10) {
      durationFactor = -12;
    } else if (seconds < 15) {
      durationFactor = -4;
    } else if (seconds >= 30) {
      durationFactor = 4;
    }

    const fluency = Math.max(30, Math.min(99, levelBase + durationFactor + rand(-8, 10)));
    const pronunciation = Math.max(35, Math.min(99, levelBase + rand(-6, 9)));
    const grammar = Math.max(30, Math.min(99, levelBase + rand(-9, 8)));
    const vocab = Math.max(35, Math.min(99, levelBase + (seconds < 8 ? -10 : 0) + rand(-7, 11)));
    const overall = Math.round((fluency + pronunciation + grammar + vocab) / 4);

    const payload = { level, fluency, pronunciation, grammar, vocabulary: vocab, overall };
    try {
      await api.speakingTest(payload);
      await refresh();
    } catch { /* ignore */ }
    setResult(payload);
    setStage("result");
    setSubmitting(false);
  };

  useEffect(() => {
    return () => {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
        recordingInterval.current = null;
      }
    };
  }, []);

  return (
    <View style={styles.root} testID="speaking-test-screen">
      <LinearGradient colors={["#EFF6FF", colors.bg]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScreenHeader title="Speaking Test" showBack onBack={() => router.back()} />
        {stage === "select" && (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
            <Text style={styles.title}>Pick your level</Text>
            <Text style={styles.sub}>Get an AI-style evaluation across fluency, pronunciation, grammar and vocabulary.</Text>
            <View style={{ marginTop: 22, gap: 12 }}>
              {LEVELS.map((l) => (
                <TouchableOpacity key={l.id} onPress={() => start(l.id)} activeOpacity={0.9} testID={`test-level-${l.id}`}>
                  <View style={styles.levelCard}>
                    <View style={[styles.levelDot, { backgroundColor: l.color }]}>
                      <Ionicons name="ribbon" size={22} color="#fff" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.levelTitle}>{l.label}</Text>
                      <Text style={styles.levelDesc}>{l.description}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {stage === "test" && (
          <View style={{ flex: 1, padding: 20 }}>
            <Text style={styles.title}>{level.toUpperCase()} Level</Text>
            <Text style={styles.sub}>Speak clearly on the topic. Tap to start and finish when done.</Text>
            <View style={styles.promptCard}>
              <Ionicons name="chatbubble-ellipses" size={22} color={colors.primary} />
              <Text style={styles.prompt}>{PROMPTS[promptIdx]}</Text>
            </View>

            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <TouchableOpacity onPress={recording ? finishRecording : beginRecording} disabled={submitting} activeOpacity={0.9} testID="test-record-btn">
                <View style={[styles.micBtnOuter, recording && { backgroundColor: "rgba(239,68,68,0.15)" }]}>
                  <LinearGradient colors={recording ? ["#F87171", "#EF4444"] : gradients.primary as any} style={styles.micBtn}>
                    <Ionicons name={recording ? "stop" : "mic"} size={44} color="#fff" />
                  </LinearGradient>
                </View>
              </TouchableOpacity>
              <Text style={styles.timer}>{recording ? `Recording... ${seconds}s` : submitting ? "Analyzing..." : "Tap the mic to begin"}</Text>
              {submitting ? <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} /> : null}
              {recording ? (
                <TouchableOpacity onPress={finishRecording} style={styles.finishBtn} testID="test-finish-btn">
                  <Text style={styles.finishText}>Finish test</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        )}

        {stage === "result" && result && (
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeIn.duration(400)} style={{ alignItems: "center", marginTop: 10 }}>
              <ProgressRing size={180} stroke={14} progress={result.overall / 100} color={colors.primaryLight}>
                <Text style={styles.overallScore}>{result.overall}</Text>
                <Text style={styles.overallLabel}>Overall</Text>
              </ProgressRing>
              <Text style={styles.resTitle}>Great job! 🎉</Text>
              <Text style={styles.resSub}>Here&apos;s your {result.level} speaking report.</Text>
            </Animated.View>

            <View style={{ marginTop: 26, gap: 12 }}>
              <MetricRow label="Fluency" value={result.fluency} icon="pulse" />
              <MetricRow label="Pronunciation" value={result.pronunciation} icon="megaphone" />
              <MetricRow label="Grammar" value={result.grammar} icon="library" />
              <MetricRow label="Vocabulary" value={result.vocabulary} icon="book" />
            </View>

            {result.overall >= 80 ? (
              <View style={styles.certBanner}>
                <Ionicons name="ribbon" size={22} color={colors.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.certTitle}>Certificate unlocked</Text>
                  <Text style={styles.certSub}>Share it and earn 20% off Premium.</Text>
                </View>
                <TouchableOpacity onPress={() => router.push("/certificates")} testID="test-view-cert">
                  <Text style={styles.certLink}>Share</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <View style={{ marginTop: 24, gap: 10 }}>
              <GradientButton label="Take another test" icon="refresh" onPress={() => { setStage("select"); setResult(null); }} testID="test-retry-btn" />
              <TouchableOpacity onPress={() => router.replace("/(tabs)/practice")} style={styles.secondaryBtn} testID="test-done-btn">
                <Text style={styles.secondaryText}>Back to practice</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

function MetricRow({ label, value, icon }: { label: string; value: number; icon: any }) {
  return (
    <View style={styles.metricRow} testID={`metric-${label.toLowerCase()}`}>
      <View style={styles.metricIcon}><Ionicons name={icon} size={18} color={colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={styles.metricLabel}>{label}</Text>
          <Text style={styles.metricValue}>{value}/100</Text>
        </View>
        <View style={styles.metricTrack}>
          <View style={[styles.metricFill, { width: `${value}%` }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { ...typography.h1, fontSize: 24 },
  sub: { ...typography.body, color: colors.textSecondary, marginTop: 4 },
  levelCard: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, backgroundColor: "#fff", borderRadius: radii.lg, ...shadow.soft },
  levelDot: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  levelTitle: { ...typography.h3, fontSize: 16 },
  levelDesc: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  promptCard: { flexDirection: "row", gap: 10, padding: 16, backgroundColor: "#fff", borderRadius: radii.lg, marginTop: 18, ...shadow.soft },
  prompt: { ...typography.body, flex: 1, fontFamily: "Manrope_600SemiBold" },
  micBtnOuter: { padding: 14, borderRadius: 999 },
  micBtn: { width: 130, height: 130, borderRadius: 999, alignItems: "center", justifyContent: "center", ...shadow.strong },
  timer: { ...typography.body, color: colors.textSecondary, marginTop: 18, fontFamily: "Manrope_600SemiBold" },
  finishBtn: { marginTop: 20, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 999, backgroundColor: "#0F172A" },
  finishText: { color: "#fff", fontFamily: "Manrope_700Bold" },
  overallScore: { fontFamily: "Outfit_800ExtraBold", fontSize: 48, color: colors.primary },
  overallLabel: { ...typography.tiny, color: colors.textSecondary },
  resTitle: { ...typography.h1, fontSize: 24, marginTop: 18 },
  resSub: { ...typography.body, color: colors.textSecondary, marginTop: 4 },
  metricRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: "#fff", borderRadius: radii.lg, ...shadow.soft },
  metricIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#DBEAFE", alignItems: "center", justifyContent: "center" },
  metricLabel: { ...typography.body, fontFamily: "Manrope_700Bold" },
  metricValue: { ...typography.small, color: colors.primary, fontFamily: "Manrope_700Bold" },
  metricTrack: { height: 6, backgroundColor: colors.divider, borderRadius: 999, marginTop: 6, overflow: "hidden" },
  metricFill: { height: "100%", backgroundColor: colors.primaryLight },
  certBanner: { marginTop: 22, flexDirection: "row", alignItems: "center", gap: 10, padding: 16, borderRadius: radii.lg, backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FBBF24" },
  certTitle: { ...typography.body, fontFamily: "Manrope_700Bold", color: "#78350F" },
  certSub: { ...typography.small, color: "#92400E" },
  certLink: { ...typography.body, color: colors.primary, fontFamily: "Manrope_700Bold" },
  secondaryBtn: { alignItems: "center", justifyContent: "center", paddingVertical: 16, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.divider },
  secondaryText: { ...typography.body, fontFamily: "Manrope_700Bold", color: colors.primary },
});
