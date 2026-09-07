import { View, Text, StyleSheet, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, typography } from "@/src/theme";
import { ScreenHeader } from "@/src/components/ui";

const SECTIONS = [
  { h: "Agreement", p: "By using Acuspeak you agree to these Terms & Conditions. If you do not agree, please stop using the service." },
  { h: "Account", p: "You&apos;re responsible for the safety of your Google account and any activity that happens under it inside the app." },
  { h: "Acceptable use", p: "Be kind and respectful during voice sessions. Harassment, hate speech, spamming, or sharing sensitive personal data of others is prohibited and may result in account suspension." },
  { h: "Reporting & blocking", p: "You can report or block any user directly during a call. Reports are reviewed by our safety team." },
  { h: "Subscriptions", p: "Premium subscriptions are billed via Stripe. You may cancel at any time; access remains active until the current period ends." },
  { h: "Refund policy", p: "All purchases are non-refundable unless required by applicable law." },
  { h: "Certificates", p: "Certificates issued in-app are for practice validation only and do not constitute official qualifications." },
  { h: "Changes", p: "We may update these terms occasionally. Continued use of the app implies acceptance of the updated terms." },
  { h: "Contact", p: "For legal enquiries reach us at legal@acuspeak.app." },
];

export default function Terms() {
  const router = useRouter();
  return (
    <View style={styles.root} testID="terms-screen">
      <LinearGradient colors={["#EFF6FF", colors.bg]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScreenHeader title="Terms & Conditions" showBack onBack={() => router.back()} />
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
