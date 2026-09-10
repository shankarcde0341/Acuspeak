import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing, FadeIn } from "react-native-reanimated";

import { api, PartnerUser } from "@/src/api/client";
import { colors, gradients, shadow, typography } from "@/src/theme";
import { Avatar, ScreenHeader } from "@/src/components/ui";

type Gender = "any" | "male" | "female";

export default function Match() {
  const router = useRouter();
  const [gender, setGender] = useState<Gender>("any");
  const [status, setStatus] = useState<"idle" | "searching" | "found">("idle");
  const [partner, setPartner] = useState<PartnerUser | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [zegoToken, setZegoToken] = useState<string | null>(null);

  const pulse1 = useSharedValue(0);
  const pulse2 = useSharedValue(0);
  const pulse3 = useSharedValue(0);
  const isSearchingRef = useRef(false);

  useEffect(() => {
    isSearchingRef.current = (status === "searching");
    if (status === "searching") {
      pulse1.value = withRepeat(withTiming(1, { duration: 2500, easing: Easing.out(Easing.quad) }), -1, false);
      pulse2.value = withRepeat(withTiming(1, { duration: 2500, easing: Easing.out(Easing.quad) }), -1, false);
      pulse3.value = withRepeat(withTiming(1, { duration: 2500, easing: Easing.out(Easing.quad) }), -1, false);
    } else {
      pulse1.value = 0; pulse2.value = 0; pulse3.value = 0;
    }
  }, [status, pulse1, pulse2, pulse3]);

  // Short-polling effect when searching for partner
  useEffect(() => {
    if (status !== "searching") return;

    let mounted = true;
    const interval = setInterval(async () => {
      try {
        const st = await api.getMatchStatus();
        if (!mounted) return;

        if (st.status === "matched" && st.partner && st.room_id) {
          setPartner(st.partner);
          setRoomId(st.room_id);
          if (st.zego_token) setZegoToken(st.zego_token);
          setStatus("found");
        } else if (st.status === "expired" || st.status === "cancelled" || st.status === "idle") {
          setStatus("idle");
        }
      } catch {
        /* Ignore transient short-polling fetch error */
      }
    }, 2000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [status]);

  // Handle unmount cleanup for searching queue state
  useEffect(() => {
    return () => {
      if (isSearchingRef.current) {
        api.cancelMatch().catch(() => { });
      }
    };
  }, []);

  const ring1 = useAnimatedStyle(() => ({ opacity: 1 - pulse1.value, transform: [{ scale: 0.5 + pulse1.value * 1.5 }] }));
  const ring2 = useAnimatedStyle(() => ({ opacity: 1 - pulse2.value, transform: [{ scale: 0.5 + pulse2.value * 1.5 }] }));
  const ring3 = useAnimatedStyle(() => ({ opacity: 1 - pulse3.value, transform: [{ scale: 0.5 + pulse3.value * 1.5 }] }));

  const startMatch = async () => {
    try {
      const res = await api.joinMatch(gender);
      if (res.status === "matched" && res.room_id) {
        // Instant match with waiting online candidate
        const st = await api.getMatchStatus();
        if (st.partner && st.room_id) {
          setPartner(st.partner);
          setRoomId(st.room_id);
          if (st.zego_token) setZegoToken(st.zego_token);
          setStatus("found");
          return;
        }
      }
      setStatus("searching");
    } catch {
      setStatus("idle");
    }
  };

  const handleCancel = async () => {
    try {
      await api.cancelMatch();
    } catch {
      /* ignore */
    }
    setStatus("idle");
  };

  const handleBack = () => {
    if (status === "searching") {
      api.cancelMatch().catch(() => { });
    }
    router.back();
  };

  const startCall = () => {
    if (!partner || !roomId) return;
    router.replace({
      pathname: "/call",
      params: {
        name: partner.name,
        avatar: partner.avatar,
        gender: partner.gender,
        country: partner.country,
        room_id: roomId,
        target_user_id: partner.user_id || "",
        ...(zegoToken ? { token: zegoToken } : {}),
      },
    });
  };

  return (
    <View style={styles.root} testID="match-screen">
      <LinearGradient colors={gradients.premium} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScreenHeader title="Random Match" showBack onBack={handleBack} />

        {status === "idle" && (
          <View style={{ flex: 1, padding: 20, alignItems: "center", justifyContent: "center" }}>
            <Text style={styles.title}>Voice-match with a real learner</Text>
            <Text style={styles.sub}>Pick a preference and we&apos;ll find someone who wants to practise right now.</Text>
            <View style={styles.filterRow}>
              {(["any", "male", "female"] as Gender[]).map((g) => (
                <TouchableOpacity key={g} onPress={() => setGender(g)} style={[styles.chip, gender === g && styles.chipActive]} testID={`match-filter-${g}`}>
                  <Ionicons name={g === "any" ? "people" : g === "male" ? "man" : "woman"} size={16} color={gender === g ? "#fff" : "rgba(255,255,255,0.7)"} />
                  <Text style={[styles.chipText, gender === g && { color: "#fff" }]}>{g[0].toUpperCase() + g.slice(1)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity activeOpacity={0.9} onPress={startMatch} style={styles.startBtn} testID="match-start-btn">
              <LinearGradient colors={["#3B82F6", "#0EA5E9"]} style={styles.startBtnInner}>
                <Ionicons name="radio" size={24} color="#fff" />
                <Text style={styles.startText}>Find a match</Text>
              </LinearGradient>
            </TouchableOpacity>
            <Text style={styles.footerNote}>Be respectful — sessions are moderated.</Text>
          </View>
        )}

        {status === "searching" && (
          <View style={{ flex: 1, padding: 20, alignItems: "center", justifyContent: "center" }}>
            <Text style={styles.title}>Finding a match…</Text>
            <Text style={styles.sub}>Connecting with someone who wants to practise.</Text>
            <View style={styles.radarWrap} testID="match-radar">
              <Animated.View style={[styles.pulse, ring1]} />
              <Animated.View style={[styles.pulse, ring2]} />
              <Animated.View style={[styles.pulse, ring3]} />
              <View style={styles.radarCore}>
                <Ionicons name="mic" size={40} color="#fff" />
              </View>
            </View>
            <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn} testID="match-cancel-btn">
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {status === "found" && partner && (
          <Animated.View entering={FadeIn.duration(400)} style={{ flex: 1, padding: 20, alignItems: "center", justifyContent: "center" }}>
            <Text style={styles.matchedLabel}>MATCH FOUND</Text>
            <Avatar uri={partner.avatar} name={partner.name} size={140} isPremium={Boolean(partner.is_premium)} style={{ marginTop: 22 }} />
            <Text style={styles.partnerName}>{partner.name}</Text>
            <Text style={styles.partnerMeta}>{partner.gender === "male" ? "He/Him" : partner.gender === "female" ? "She/Her" : ""} · {partner.country}</Text>
            <TouchableOpacity onPress={startCall} style={styles.callBtn} activeOpacity={0.9} testID="match-call-btn">
              <LinearGradient colors={["#10B981", "#059669"]} style={styles.callBtnInner}>
                <Ionicons name="call" size={22} color="#fff" />
                <Text style={styles.callText}>Start voice call</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={startMatch} style={styles.skipBtn} testID="match-skip-btn">
              <Text style={styles.skipText}>Skip · Find another</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: { ...typography.h1, color: "#fff", textAlign: "center", fontSize: 26 },
  sub: { ...typography.body, color: "rgba(255,255,255,0.75)", textAlign: "center", marginTop: 8, maxWidth: 280 },
  filterRow: { flexDirection: "row", gap: 8, marginTop: 22 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  chipText: { color: "rgba(255,255,255,0.8)", fontFamily: "Manrope_600SemiBold", fontSize: 13 },
  startBtn: { marginTop: 42, borderRadius: 999, overflow: "hidden", ...shadow.strong },
  startBtnInner: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 30, paddingVertical: 18, borderRadius: 999 },
  startText: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 17 },
  footerNote: { ...typography.small, color: "rgba(255,255,255,0.5)", marginTop: 30, textAlign: "center" },

  radarWrap: { width: 280, height: 280, alignItems: "center", justifyContent: "center", marginTop: 30 },
  pulse: { position: "absolute", width: 280, height: 280, borderRadius: 999, backgroundColor: "rgba(147,197,253,0.25)" },
  radarCore: { width: 130, height: 130, borderRadius: 999, backgroundColor: "#3B82F6", alignItems: "center", justifyContent: "center", ...shadow.strong },
  cancelBtn: { marginTop: 30, paddingHorizontal: 26, paddingVertical: 12, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  cancelText: { color: "#fff", fontFamily: "Manrope_700Bold" },

  matchedLabel: { color: "#93C5FD", fontFamily: "Manrope_700Bold", letterSpacing: 2, fontSize: 12 },
  partnerAvatar: { width: 140, height: 140, borderRadius: 999, marginTop: 22, borderWidth: 4, borderColor: "#fff", ...shadow.strong },
  partnerName: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 28, marginTop: 20 },
  partnerMeta: { color: "rgba(255,255,255,0.7)", marginTop: 6, fontFamily: "Manrope_500Medium" },
  callBtn: { marginTop: 40, borderRadius: 999, overflow: "hidden", ...shadow.strong },
  callBtnInner: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 34, paddingVertical: 18, borderRadius: 999 },
  callText: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 17 },
  skipBtn: { marginTop: 16, paddingHorizontal: 22, paddingVertical: 12 },
  skipText: { color: "rgba(255,255,255,0.7)", fontFamily: "Manrope_600SemiBold" },
});
