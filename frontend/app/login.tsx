import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, TextInput, KeyboardAvoidingView, ScrollView, Keyboard } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import Animated, { FadeIn } from "react-native-reanimated";

import { colors, gradients, radii, shadow, typography } from "@/src/theme";
import { useAuth } from "@/src/context/AuthContext";
import { api } from "@/src/api/client";

type Mode = "picker" | "phone-enter" | "phone-otp";

export default function LoginScreen() {
  const router = useRouter();
  const { signInWithSessionId, signInWithPhoneToken, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("picker");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [referral, setReferral] = useState("");
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => { if (user) router.replace("/(tabs)"); }, [user, router]);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      () => setKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardVisible(false)
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const parseSessionId = (url: string): string | null => {
    try {
      const hashIdx = url.indexOf("#");
      if (hashIdx !== -1) {
        const params = new URLSearchParams(url.slice(hashIdx + 1));
        const s = params.get("session_id");
        if (s) return s;
      }
      const qIdx = url.indexOf("?");
      if (qIdx !== -1) {
        const q = new URLSearchParams(url.slice(qIdx + 1));
        const s = q.get("session_id");
        if (s) return s;
      }
    } catch { /* ignore */ }
    return null;
  };

  const handleGoogleLogin = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const redirectUrl = Platform.OS === "web"
        ? (typeof window !== "undefined" ? window.location.origin + "/auth" : "")
        : Linking.createURL("auth");
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;

      if (Platform.OS === "web") {
        if (typeof window !== "undefined") window.location.href = authUrl;
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
      if (result.type === "success" && result.url) {
        const sid = parseSessionId(result.url);
        if (!sid) throw new Error("No session_id returned");
        await signInWithSessionId(sid);
        router.replace("/(tabs)");
      }
    } catch (e: any) {
      setError(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }, [signInWithSessionId, router]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    const s = parseSessionId(window.location.href);
    if (s) {
      console.log("[/login] session_id detected in URL — forwarding to /auth");
      router.replace("/auth");
    }
  }, [router]);

  const sendOtp = async () => {
    setError(null);
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 6) { setError("Please enter a valid phone number."); return; }
    setBusy(true);
    try {
      const res = await api.sendPhoneOtp(`${countryCode}${clean}`);
      if (res.debug_code) setDebugCode(res.debug_code);
      setMode("phone-otp");
    } catch (e: any) { setError(e.message || "Could not send OTP"); }
    setBusy(false);
  };

  const verifyOtp = async () => {
    setError(null);
    if (!/^\d{6}$/.test(otp)) { setError("Enter the 6-digit code"); return; }
    setBusy(true);
    try {
      const clean = phone.replace(/\D/g, "");
      const res = await api.verifyPhoneOtp(`${countryCode}${clean}`, otp, name || undefined, referral || undefined);
      await signInWithPhoneToken(res.session_token, res.user);
      router.replace("/(tabs)");
    } catch (e: any) { setError(e.message || "Verification failed"); }
    setBusy(false);
  };

  return (
    <View style={styles.root} testID="login-screen">
      <LinearGradient colors={gradients.premium} style={StyleSheet.absoluteFill} />
      <View style={styles.orb1} />
      <View style={styles.orb2} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={[styles.scrollContent, !keyboardVisible && { flexGrow: 1, justifyContent: "flex-end" }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.top, keyboardVisible && styles.topCompact]}>
              <LinearGradient colors={["#93C5FD", "#3B82F6", "#1E40AF"]} style={[styles.logo, keyboardVisible && styles.logoCompact]}>
                <Ionicons name="mic" size={keyboardVisible ? 22 : 30} color="#fff" />
              </LinearGradient>
              <Text style={[styles.brand, keyboardVisible && styles.brandCompact]}>Acuspeak</Text>
              {!keyboardVisible && <Text style={styles.tag}>Your personal English speaking coach</Text>}
            </View>

            <View style={[styles.card, !keyboardVisible && { marginTop: "auto" }]}>
              {mode === "picker" && (
                <Animated.View entering={FadeIn.duration(400)}>
                  <Text style={styles.welcome}>Welcome</Text>
                  <Text style={styles.welcomeSub}>Sign in to start your speaking journey.</Text>

                  <TouchableOpacity testID="google-signin-btn" style={styles.googleBtn} onPress={handleGoogleLogin} disabled={busy} activeOpacity={0.9}>
                    {busy ? <ActivityIndicator color={colors.primary} /> : (
                      <>
                        <View style={styles.gIcon}><Text style={styles.gIconText}>G</Text></View>
                        <Text style={styles.googleText}>Continue with Google</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  <View style={styles.divider}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>OR</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  <TouchableOpacity testID="phone-signin-btn" style={styles.phoneBtn} onPress={() => setMode("phone-enter")} activeOpacity={0.9}>
                    <Ionicons name="call" size={20} color="#fff" />
                    <Text style={styles.phoneText}>Continue with Phone</Text>
                  </TouchableOpacity>

                  {error ? <Text style={styles.error} testID="login-error">{error}</Text> : null}

                  <Text style={styles.disclaimer}>
                    By continuing you agree to our{" "}
                    <Text style={styles.link} onPress={() => router.push("/terms")}>Terms</Text> and{" "}
                    <Text style={styles.link} onPress={() => router.push("/privacy")}>Privacy Policy</Text>.
                  </Text>
                </Animated.View>
              )}

              {mode === "phone-enter" && (
                <Animated.View entering={FadeIn.duration(300)}>
                  <TouchableOpacity onPress={() => setMode("picker")} style={styles.backLink} testID="phone-back-btn">
                    <Ionicons name="chevron-back" size={18} color={colors.primary} />
                    <Text style={styles.backText}>Back</Text>
                  </TouchableOpacity>
                  <Text style={styles.welcome}>Enter your phone</Text>
                  <Text style={styles.welcomeSub}>We&apos;ll text you a 6-digit code.</Text>

                  <View style={styles.phoneRow}>
                    <View style={styles.ccBox}>
                      <TextInput
                        value={countryCode}
                        onChangeText={setCountryCode}
                        style={styles.ccInput}
                        keyboardType="phone-pad"
                        maxLength={5}
                        testID="phone-cc-input"
                      />
                    </View>
                    <TextInput
                      value={phone}
                      onChangeText={setPhone}
                      placeholder="Phone number"
                      placeholderTextColor={colors.textMuted}
                      style={styles.phoneInput}
                      keyboardType="phone-pad"
                      testID="phone-number-input"
                    />
                  </View>

                  <TouchableOpacity onPress={sendOtp} disabled={busy} activeOpacity={0.9} style={{ marginTop: 18 }} testID="send-otp-btn">
                    <LinearGradient colors={gradients.primary} style={styles.primaryCta}>
                      {busy ? <ActivityIndicator color="#fff" /> : (
                        <>
                          <Text style={styles.primaryCtaText}>Send code</Text>
                          <Ionicons name="arrow-forward" size={18} color="#fff" />
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  {error ? <Text style={styles.error} testID="login-error">{error}</Text> : null}
                  <Text style={styles.mockNote}>MOCK OTP mode — any 6-digit code will work.</Text>
                </Animated.View>
              )}

              {mode === "phone-otp" && (
                <Animated.View entering={FadeIn.duration(300)}>
                  <TouchableOpacity onPress={() => setMode("phone-enter")} style={styles.backLink} testID="otp-back-btn">
                    <Ionicons name="chevron-back" size={18} color={colors.primary} />
                    <Text style={styles.backText}>Change number</Text>
                  </TouchableOpacity>
                  <Text style={styles.welcome}>Verify code</Text>
                  <Text style={styles.welcomeSub}>Sent to {countryCode}{phone}</Text>
                  {debugCode ? (
                    <View style={styles.mockChip} testID="otp-debug-code">
                      <Ionicons name="information-circle" size={14} color="#78350F" />
                      <Text style={styles.mockChipText}>Debug code: {debugCode}</Text>
                    </View>
                  ) : null}

                  <TextInput
                    value={otp}
                    onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6-digit code"
                    placeholderTextColor={colors.textMuted}
                    style={styles.otpInput}
                    keyboardType="number-pad"
                    maxLength={6}
                    testID="otp-input"
                  />

                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Your name (new users)"
                    placeholderTextColor={colors.textMuted}
                    style={styles.textInput}
                    testID="signup-name-input"
                  />
                  <TextInput
                    value={referral}
                    onChangeText={(t) => setReferral(t.toUpperCase())}
                    placeholder="Referral code (optional)"
                    placeholderTextColor={colors.textMuted}
                    style={styles.textInput}
                    autoCapitalize="characters"
                    testID="signup-referral-input"
                  />

                  <TouchableOpacity onPress={verifyOtp} disabled={busy} activeOpacity={0.9} style={{ marginTop: 18 }} testID="verify-otp-btn">
                    <LinearGradient colors={gradients.primary} style={styles.primaryCta}>
                      {busy ? <ActivityIndicator color="#fff" /> : (
                        <>
                          <Text style={styles.primaryCtaText}>Verify & continue</Text>
                          <Ionicons name="checkmark" size={18} color="#fff" />
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={sendOtp} style={{ marginTop: 12, alignSelf: "center" }} testID="resend-otp-btn">
                    <Text style={styles.link}>Resend code</Text>
                  </TouchableOpacity>

                  {error ? <Text style={styles.error}>{error}</Text> : null}
                </Animated.View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  orb1: { position: "absolute", top: -60, left: -60, width: 240, height: 240, borderRadius: 999, backgroundColor: "rgba(147,197,253,0.15)" },
  orb2: { position: "absolute", bottom: -80, right: -60, width: 260, height: 260, borderRadius: 999, backgroundColor: "rgba(56,189,248,0.18)" },
  scrollContent: { flexGrow: 1, paddingBottom: 16 },
  top: { alignItems: "center", marginTop: 40, marginBottom: 16 },
  topCompact: { marginTop: 48, marginBottom: 14 },
  logo: { width: 84, height: 84, borderRadius: 30, alignItems: "center", justifyContent: "center", ...shadow.strong },
  logoCompact: { width: 44, height: 44, borderRadius: 16 },
  brand: { ...typography.h1, color: "#fff", marginTop: 14, fontSize: 30 },
  brandCompact: { fontSize: 20, marginTop: 4 },
  tag: { ...typography.body, color: "rgba(255,255,255,0.72)", marginTop: 6 },
  card: { marginHorizontal: 20, marginBottom: 16, padding: 22, borderRadius: radii.xl, backgroundColor: "rgba(255,255,255,0.96)", ...shadow.card },
  welcome: { ...typography.h2, fontSize: 22 },
  welcomeSub: { ...typography.body, color: colors.textSecondary, marginTop: 4, marginBottom: 14, fontSize: 14 },
  googleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12, height: 52, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1.5, borderColor: colors.divider },
  gIcon: { width: 24, height: 24, borderRadius: 999, backgroundColor: "#EA4335", alignItems: "center", justifyContent: "center" },
  gIconText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  googleText: { ...typography.button, color: colors.textPrimary, fontSize: 15 },
  divider: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.divider },
  dividerText: { ...typography.tiny, color: colors.textMuted },
  phoneBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 52, borderRadius: 999, backgroundColor: colors.primary },
  phoneText: { ...typography.button, fontSize: 15 },
  disclaimer: { ...typography.small, color: colors.textSecondary, textAlign: "center", marginTop: 14, lineHeight: 18, fontSize: 12 },
  link: { color: colors.primary, textDecorationLine: "underline" },
  error: { ...typography.small, color: colors.danger, marginTop: 10, textAlign: "center" },
  backLink: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 10, alignSelf: "flex-start" },
  backText: { ...typography.small, color: colors.primary, fontFamily: "Manrope_700Bold" },
  phoneRow: { flexDirection: "row", gap: 8 },
  ccBox: { minWidth: 72 },
  ccInput: { height: 50, borderRadius: radii.lg, backgroundColor: "#F1F5F9", paddingHorizontal: 12, fontFamily: "Manrope_700Bold", fontSize: 15, textAlign: "center", color: colors.textPrimary },
  phoneInput: { flex: 1, height: 50, borderRadius: radii.lg, backgroundColor: "#F1F5F9", paddingHorizontal: 16, fontFamily: "Manrope_500Medium", fontSize: 15, color: colors.textPrimary },
  primaryCta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, height: 52, borderRadius: 999, ...shadow.strong },
  primaryCtaText: { ...typography.button, fontSize: 15 },
  otpInput: { height: 54, borderRadius: radii.lg, backgroundColor: "#F1F5F9", fontFamily: "Outfit_700Bold", fontSize: 24, letterSpacing: 10, textAlign: "center", color: colors.textPrimary, marginBottom: 10 },
  textInput: { height: 48, borderRadius: radii.lg, backgroundColor: "#F1F5F9", paddingHorizontal: 16, fontFamily: "Manrope_500Medium", fontSize: 14, color: colors.textPrimary, marginTop: 8 },
  mockNote: { ...typography.small, color: colors.textMuted, textAlign: "center", marginTop: 10, fontStyle: "italic", fontSize: 12 },
  mockChip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FEF3C7", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, alignSelf: "flex-start", marginTop: 2, marginBottom: 10 },
  mockChipText: { color: "#78350F", fontFamily: "Manrope_700Bold", fontSize: 12 },
});
