import { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { GlassCard } from "@/src/components/ui";
import { colors, gradients, radii, shadow, typography } from "@/src/theme";

const SLIDES = [
  {
    id: "1",
    title: "Speak with real people",
    subtitle: "Match with English learners worldwide and practice one voice-call at a time.",
    quote: "Language is the roadmap of a culture. It tells you where its people come from and where they are going.",
    author: "Rita Mae Brown",
    image: "https://images.pexels.com/photos/8199231/pexels-photo-8199231.jpeg",
    icon: "people",
    tag: "Real-Time Practice",
  },
  {
    id: "2",
    title: "Master every skill",
    subtitle: "Business, travel, interviews — bite-sized lessons that stick.",
    quote: "To have another language is to possess a second soul.",
    author: "Charlemagne",
    image: "https://images.pexels.com/photos/8463151/pexels-photo-8463151.jpeg",
    icon: "school",
    tag: "Interactive Lessons",
  },
  {
    id: "3",
    title: "Track your growth",
    subtitle: "Streaks, XP, certificates and daily challenges to keep you unstoppable.",
    quote: "A different language is a different vision of life.",
    author: "Federico Fellini",
    image: "https://images.pexels.com/photos/6532362/pexels-photo-6532362.jpeg",
    icon: "trending-up",
    tag: "Gamified Progress",
  },
];

export default function Onboarding() {
  const router = useRouter();
  const [index, setIndex] = useState(0);

  const next = () => {
    if (index < SLIDES.length - 1) setIndex(index + 1);
    else router.replace("/login");
  };

  const prev = () => {
    if (index > 0) setIndex(index - 1);
  };

  const skip = () => router.replace("/login");
  const item = SLIDES[index];

  return (
    <View style={styles.root} testID="onboarding-screen">
      <LinearGradient colors={gradients.soft} style={StyleSheet.absoluteFill} />
      <View style={styles.orb1} />
      <View style={styles.orb2} />

      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View style={styles.topRow}>
          <View style={styles.brandRow}>
            {index > 0 && (
              <TouchableOpacity onPress={prev} style={styles.backBtn} testID="onboarding-back-btn">
                <Ionicons name="chevron-back" size={18} color={colors.primaryDeeper} />
              </TouchableOpacity>
            )}
            <LinearGradient colors={gradients.primary} style={styles.logoMini}>
              <Ionicons name="mic" size={16} color="#fff" />
            </LinearGradient>
            <Text style={styles.brandSmall}>Acuspeak</Text>
          </View>
          <TouchableOpacity onPress={skip} testID="onboarding-skip-btn">
            <Text style={styles.skip}>Skip</Text>
          </TouchableOpacity>
        </View>

        {/* 70% Image + 30% Quote Section Container */}
        <View style={styles.centerContainer}>
          <Animated.View key={`img-${index}`} entering={FadeIn.duration(400)} style={styles.imageSection}>
            <TouchableOpacity activeOpacity={0.95} onPress={next} style={{ flex: 1 }} testID={`onboarding-image-${index}`}>
              <Image source={{ uri: item.image }} style={styles.img} resizeMode="cover" />
              <LinearGradient colors={["transparent", "rgba(15,23,42,0.45)"]} style={StyleSheet.absoluteFill} />
              <View style={styles.iconBadge}>
                <Ionicons name={item.icon as any} size={16} color="#fff" />
                <Text style={styles.tagText}>{item.tag}</Text>
              </View>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View key={`txt-${index}`} entering={FadeInDown.delay(80).duration(500)} style={styles.quoteSection}>
            <GlassCard style={styles.card} testID="onboarding-message-card">
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>

              {/* Quote section matching theme background */}
              <View style={styles.quoteBox}>
                <Text style={styles.quoteText}>&ldquo;{item.quote}&rdquo;</Text>
                <Text style={styles.quoteAuthor}>— {item.author}</Text>
              </View>
            </GlassCard>
          </Animated.View>
        </View>

        <View style={styles.footer}>
          {/* Clickable Navigation Dots */}
          <View style={styles.dots}>
            {SLIDES.map((_, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => setIndex(i)}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                testID={`onboarding-dot-${i}`}
              >
                <View style={[styles.dot, i === index && styles.dotActive]} />
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.actionRow}>
            {index > 0 && (
              <TouchableOpacity activeOpacity={0.8} onPress={prev} style={styles.secondaryBackBtn} testID="onboarding-footer-back-btn">
                <Ionicons name="arrow-back" size={18} color={colors.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity activeOpacity={0.9} onPress={next} style={{ flex: 1 }} testID="onboarding-next-btn">
              <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cta}>
                <Text style={styles.ctaText}>{index === SLIDES.length - 1 ? "Get Started" : "Next"}</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={styles.legalRow}>
            <TouchableOpacity onPress={() => router.push("/privacy")} testID="onboarding-privacy-link">
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>·</Text>
            <TouchableOpacity onPress={() => router.push("/terms")} testID="onboarding-terms-link">
              <Text style={styles.legalLink}>Terms</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  orb1: { position: "absolute", top: -90, right: -60, width: 240, height: 240, borderRadius: 999, backgroundColor: "rgba(59,130,246,0.18)" },
  orb2: { position: "absolute", bottom: -120, left: -80, width: 280, height: 280, borderRadius: 999, backgroundColor: "rgba(13,148,136,0.15)" },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 24, paddingTop: 6, paddingBottom: 8 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  backBtn: {
    width: 30,
    height: 30,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.9)",
    ...shadow.soft,
  },
  logoMini: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  brandSmall: { ...typography.h3, fontSize: 18, color: colors.primaryDeeper },
  skip: { ...typography.body, color: colors.textSecondary, fontFamily: "Manrope_600SemiBold" },

  centerContainer: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: "space-between",
    gap: 12,
  },

  /* Image Section (approx. 70% of middle screen area) */
  imageSection: {
    flex: 6.8,
    width: "100%",
    borderRadius: radii.xl,
    overflow: "hidden",
    ...shadow.card,
  },
  img: { width: "100%", height: "100%" },
  iconBadge: {
    position: "absolute",
    top: 14,
    right: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  tagText: { color: "#FFFFFF", fontSize: 12, fontFamily: "Manrope_600SemiBold" },

  /* Quote/Card Section (approx. 30% of middle screen area) */
  quoteSection: {
    flex: 3.2,
    width: "100%",
    zIndex: 1,
  },
  card: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.88)",
    borderRadius: radii.xl,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.9)",
    ...shadow.card,
  },
  title: { ...typography.h1, fontSize: 22, color: colors.textPrimary },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: 4, lineHeight: 18, fontSize: 13 },

  /* Quote box matching theme background */
  quoteBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: radii.md,
    backgroundColor: "rgba(219, 234, 254, 0.45)",
    borderLeftWidth: 3,
    borderLeftColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.15)",
  },
  quoteText: {
    fontFamily: "Manrope_500Medium",
    fontSize: 12.5,
    fontStyle: "italic",
    color: colors.primaryDeeper,
    lineHeight: 18,
  },
  quoteAuthor: {
    fontFamily: "Manrope_600SemiBold",
    fontSize: 11,
    color: colors.primaryLight,
    marginTop: 4,
    textAlign: "right",
  },

  footer: { paddingHorizontal: 24, paddingBottom: 14, paddingTop: 4 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: 999, backgroundColor: "#CBD5E1" },
  dotActive: { width: 22, backgroundColor: colors.primaryLight },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  secondaryBackBtn: {
    width: 50,
    height: 50,
    borderRadius: radii.pill,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.2)",
    ...shadow.soft,
  },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 999, ...shadow.strong },
  ctaText: { ...typography.button },
  legalRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 10, gap: 6 },
  legalLink: { ...typography.small, color: colors.primary },
  legalDot: { color: colors.textMuted },
});



