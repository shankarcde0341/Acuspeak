import { View, Text, StyleSheet, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, typography } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ui";

const SECTIONS = [
  { h: "Introduction", p: "Welcome to Acuspeak. Your privacy matters to us. This policy explains what data we collect and how we use it to power your speaking practice." },
  { h: "Information we collect", p: "We collect your Google account information (email, name, profile picture) at sign-in, plus content you generate inside the app (progress, saved words, call metadata such as duration, and voluntary reports)." },
  { h: "How we use data", p: "Data is used to personalise your learning path, calculate XP/streaks, deliver premium features, and improve app quality. We never sell your personal data." },
  { h: "Voice interactions", p: "Voice sessions with other learners are peer-to-peer and are not recorded by the Acuspeak servers. Only metadata (duration, timestamp) is stored." },
  { h: "Third parties", p: "We use Google for authentication and Stripe for payments. Both are subject to their own privacy policies." },
  { h: "Your rights", p: "You may request deletion of your account at any time by contacting support. On deletion, personal identifiers are permanently removed within 30 days." },
  { h: "Contact", p: "Questions? Email privacy@acuspeak.app." },
];

export default function Privacy() {
  const router = useRouter();
  return (
    <View style={styles.root} testID="privacy-screen">
      <LinearGradient colors={["#EFF6FF", colors.bg]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScreenHeader title="Privacy Policy" showBack onBack={() => router.back()} />
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <Text style={styles.updated}>Last updated: February 2026</Text>
          {SECTIONS.map((s) => (
            <View key={s.h} style={{ marginTop: 22 }}>
              <Text style={styles.h}>{s.h}</Text>
              <Text style={styles.p}>{s.p}</Text>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  updated: { ...typography.small, color: colors.textSecondary },
  h: { ...typography.h3, fontSize: 17, marginBottom: 6 },
  p: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
});
