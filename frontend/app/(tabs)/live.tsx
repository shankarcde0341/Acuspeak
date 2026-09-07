import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, RefreshControl } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";

import { api } from "@/src/api/client";
import { colors, gradients, radii, shadow, typography } from "@/src/theme";
import { Avatar, GlassCard, SectionTitle } from "@/src/components/ui";

export default function Live() {
  const router = useRouter();
  const [rooms, setRooms] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { const d = await api.rooms(); setRooms(d.rooms || []); } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <View style={styles.root} testID="live-screen">
      <LinearGradient colors={["#EFF6FF", colors.bg]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: 160, paddingHorizontal: 20, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Live Rooms</Text>
          <Text style={styles.sub}>Join topic-based voice conversations happening now.</Text>

          <Animated.View entering={FadeInDown.duration(400)} style={{ marginTop: 18 }}>
            <TouchableOpacity onPress={() => router.push("/host-room")} activeOpacity={0.9} testID="live-host-room">
              <LinearGradient colors={gradients.primary} style={styles.hostBanner}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.hostTag}>HOST</Text>
                  <Text style={styles.hostTitle}>Start your own room</Text>
                  <Text style={styles.hostSub}>Public or private · voice-only</Text>
                </View>
                <View style={styles.hostIcon}><Ionicons name="add" size={32} color="#fff" /></View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          <View style={{ marginTop: 22 }}>
            <SectionTitle title="Trending Now" />
            <View style={{ gap: 12 }}>
              {rooms.map((r, i) => (
                <Animated.View key={r.room_id} entering={FadeInDown.delay(60 + i * 40).duration(400)}>
                  <TouchableOpacity onPress={() => router.push({ pathname: "/room/[id]", params: { id: r.room_id, title: r.title, topic: r.topic, host: r.host_name, avatar: r.host_avatar } })} activeOpacity={0.9} testID={`live-room-${r.room_id}`}>
                    <GlassCard>
                      <View style={{ flexDirection: "row" }}>
                        <Avatar uri={r.host_avatar} name={r.host_name} size={52} isPremium={Boolean(r.is_premium)} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <View style={styles.liveDot} />
                            <Text style={styles.liveText}>LIVE</Text>
                            <Text style={styles.topicText}>· {r.topic}</Text>
                            {r.is_private ? (
                              <View style={styles.privateBadge}><Ionicons name="lock-closed" size={10} color={colors.gold} /><Text style={styles.privateText}>Private</Text></View>
                            ) : null}
                          </View>
                          <Text style={styles.roomTitle} numberOfLines={2}>{r.title}</Text>
                          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 12 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Ionicons name="people" size={14} color={colors.textSecondary} />
                              <Text style={styles.roomMeta}>{r.participant_count} listening</Text>
                            </View>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                              <Ionicons name="mic" size={14} color={colors.textSecondary} />
                              <Text style={styles.roomMeta}>Host: {r.host_name}</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    </GlassCard>
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { ...typography.h1, fontSize: 30, marginTop: 6 },
  sub: { ...typography.body, color: colors.textSecondary, marginTop: 4 },
  hostBanner: { flexDirection: "row", alignItems: "center", padding: 20, borderRadius: radii.xl, ...shadow.strong },
  hostTag: { color: "rgba(255,255,255,0.75)", fontFamily: "Manrope_700Bold", fontSize: 10, letterSpacing: 1.4 },
  hostTitle: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 20, marginTop: 4 },
  hostSub: { color: "rgba(255,255,255,0.75)", fontFamily: "Manrope_500Medium", fontSize: 12, marginTop: 3 },
  hostIcon: { width: 54, height: 54, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" },
  hostAvatar: { width: 52, height: 52, borderRadius: 999 },
  liveDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: "#EF4444" },
  liveText: { color: "#EF4444", fontFamily: "Manrope_700Bold", fontSize: 10, letterSpacing: 1 },
  topicText: { ...typography.small, color: colors.textSecondary },
  privateBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(245,158,11,0.12)", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, marginLeft: "auto" },
  privateText: { color: colors.gold, fontFamily: "Manrope_600SemiBold", fontSize: 10 },
  roomTitle: { ...typography.h3, fontSize: 16, marginTop: 6 },
  roomMeta: { ...typography.small, color: colors.textSecondary },
});
