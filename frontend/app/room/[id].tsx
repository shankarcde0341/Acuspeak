import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, gradients, radii, shadow, typography } from "@/src/theme";
import { Avatar, ScreenHeader } from "@/src/components/ui";

const FAKE_LISTENERS = [
  { name: "Aisha", avatar: "https://i.pravatar.cc/150?img=48" },
  { name: "Diego", avatar: "https://i.pravatar.cc/150?img=13" },
  { name: "Yuki", avatar: "https://i.pravatar.cc/150?img=25" },
  { name: "Liam", avatar: "https://i.pravatar.cc/150?img=8" },
  { name: "Sofia", avatar: "https://i.pravatar.cc/150?img=36" },
  { name: "Ravi", avatar: "https://i.pravatar.cc/150?img=11" },
];

export default function Room() {
  const { id, title, topic, host, avatar } = useLocalSearchParams<{ id: string; title: string; topic: string; host: string; avatar: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [handUp, setHandUp] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    (async () => { try { await api.joinRoom(String(id || "")); } catch { /* ignore */ } })();
  }, [id]);

  const pulse = useSharedValue(0);
  useEffect(() => { pulse.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true); }, [pulse]);
  const speakerPulse = useAnimatedStyle(() => ({ opacity: 0.3 + pulse.value * 0.7, transform: [{ scale: 1 + pulse.value * 0.06 }] }));

  return (
    <View style={styles.root} testID="room-screen">
      <LinearGradient colors={gradients.premium} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScreenHeader title={String(topic || "Live Room")} showBack onBack={() => router.back()} right={
          <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View>
        } />

        <View style={styles.header}>
          <Text style={styles.roomTitle}>{title}</Text>
          <Text style={styles.roomMeta}>Hosted by {host}</Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 20 }}>
          <Text style={styles.sectionLabel}>Speakers</Text>
          <View style={styles.speakers}>
            <Animated.View style={[styles.speakerRing, speakerPulse]} />
            <View style={styles.speaker}>
              <Avatar uri={String(avatar || "")} name={String(host || "")} size={100} isPremium={false} />
              <Text style={styles.speakerName}>{host}</Text>
              <View style={styles.hostChip}><Text style={styles.hostChipText}>HOST</Text></View>
            </View>
          </View>

          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Listeners</Text>
          <View style={styles.listeners}>
            {FAKE_LISTENERS.map((l, i) => (
              <Animated.View key={i} entering={FadeInDown.delay(60 + i * 40).duration(400)} style={{ alignItems: "center", width: "22%" }}>
                <Avatar uri={l.avatar} name={l.name} size={60} isPremium={false} />
                <Text style={styles.listenerName} numberOfLines={1}>{l.name}</Text>
              </Animated.View>
            ))}
            {user ? (
              <Animated.View entering={FadeInDown.delay(320).duration(400)} style={{ alignItems: "center", width: "22%" }}>
                <Avatar uri={user.picture} name={user.name} size={60} isPremium={user.is_premium} />
                <Text style={styles.listenerName} numberOfLines={1}>You</Text>
              </Animated.View>
            ) : null}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity onPress={() => setHandUp(!handUp)} style={[styles.footBtn, handUp && styles.footBtnActive]} testID="room-hand">
            <Ionicons name="hand-right" size={22} color={handUp ? "#fff" : colors.gold} />
            <Text style={[styles.footBtnText, handUp && { color: "#fff" }]}>{handUp ? "Hand raised" : "Raise hand"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMuted(!muted)} style={styles.footBtn} testID="room-mute">
            <Ionicons name={muted ? "mic-off" : "mic"} size={22} color={muted ? "#EF4444" : colors.accent} />
            <Text style={styles.footBtnText}>{muted ? "Unmute" : "Mute"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={[styles.footBtn, { backgroundColor: "#EF4444" }]} testID="room-leave">
            <Ionicons name="exit" size={22} color="#fff" />
            <Text style={[styles.footBtnText, { color: "#fff" }]}>Leave</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(239,68,68,0.15)", borderColor: "#EF4444", borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  liveDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: "#EF4444" },
  liveText: { color: "#EF4444", fontFamily: "Manrope_700Bold", fontSize: 10, letterSpacing: 1 },
  header: { paddingHorizontal: 20, marginTop: 4, marginBottom: 8 },
  roomTitle: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 22 },
  roomMeta: { color: "rgba(255,255,255,0.6)", marginTop: 4, fontFamily: "Manrope_500Medium" },
  sectionLabel: { color: "rgba(255,255,255,0.75)", fontFamily: "Manrope_700Bold", fontSize: 12, letterSpacing: 1.5, marginBottom: 12 },
  speakers: { alignItems: "center", position: "relative" },
  speakerRing: { position: "absolute", width: 100, height: 100, borderRadius: 999, backgroundColor: "rgba(147,197,253,0.35)", top: 10 },
  speaker: { alignItems: "center" },
  speakerAvatar: { width: 100, height: 100, borderRadius: 999, borderWidth: 3, borderColor: "#3B82F6", ...shadow.strong },
  speakerName: { color: "#fff", fontFamily: "Outfit_700Bold", marginTop: 10 },
  hostChip: { marginTop: 4, backgroundColor: "rgba(245,158,11,0.2)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: "#F59E0B" },
  hostChipText: { color: "#F59E0B", fontFamily: "Manrope_700Bold", fontSize: 9, letterSpacing: 1 },
  listeners: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "flex-start" },
  listenerAvatar: { width: 60, height: 60, borderRadius: 999, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)" },
  listenerFallback: { backgroundColor: colors.primaryLight, alignItems: "center", justifyContent: "center" },
  listenerName: { color: "rgba(255,255,255,0.8)", marginTop: 6, fontSize: 12, fontFamily: "Manrope_500Medium" },
  footer: { flexDirection: "row", justifyContent: "space-between", gap: 10, padding: 20, paddingBottom: 20 },
  footBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14, borderRadius: radii.lg, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", gap: 4 },
  footBtnActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  footBtnText: { color: "rgba(255,255,255,0.9)", fontFamily: "Manrope_700Bold", fontSize: 12 },
});
