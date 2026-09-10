import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Modal, TextInput, Alert } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";

import { api, Room } from "@/src/api/client";
import { colors, gradients, radii, shadow, typography } from "@/src/theme";
import { Avatar, GlassCard, SectionTitle, GradientButton } from "@/src/components/ui";

export default function Live() {
  const router = useRouter();
  const { removed } = useLocalSearchParams<{ removed?: string }>();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Join Room Modal state
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState("");

  useEffect(() => {
    if (removed === "true") {
      Alert.alert("", "You have been removed from the room !");
      router.setParams({ removed: undefined });
    }
  }, [removed, router]);

  const load = useCallback(async () => {
    try { const d = await api.rooms(); setRooms(d.rooms || []); } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const openJoinModal = (prefillRoomId = "") => {
    setJoinRoomId(prefillRoomId);
    setJoinPassword("");
    setJoinError("");
    setJoinModalVisible(true);
  };

  const handleJoinSubmit = async () => {
    const cleanId = joinRoomId.trim();
    if (!cleanId) {
      setJoinError("Please enter a Room ID");
      return;
    }
    setJoinBusy(true);
    setJoinError("");
    try {
      const res = await api.joinRoom(cleanId, joinPassword.trim());
      if (res && res.ok) {
        setJoinModalVisible(false);
        router.push({
          pathname: "/room/[id]",
          params: {
            id: res.room.room_id,
            title: res.room.title,
            topic: res.room.topic,
            host: res.room.host_name,
            avatar: res.room.host_avatar || "",
          },
        });
      } else {
        setJoinError("Invalid Room ID or Password");
      }
    } catch (e: any) {
      setJoinError(e.message || "Invalid Room ID or Password");
    } finally {
      setJoinBusy(false);
    }
  };

  const handleRoomCardClick = async (room: Room) => {
    if (room.is_private) {
      openJoinModal(room.room_id);
    } else {
      try {
        const res = await api.joinRoom(room.room_id);
        if (res && res.ok) {
          router.push({
            pathname: "/room/[id]",
            params: {
              id: room.room_id,
              title: room.title,
              topic: room.topic,
              host: room.host_name,
              avatar: room.host_avatar || "",
            },
          });
        } else {
          openJoinModal(room.room_id);
        }
      } catch {
        openJoinModal(room.room_id);
      }
    }
  };

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

          {/* Action Row: Host & Join */}
          <Animated.View entering={FadeInDown.duration(400)} style={{ marginTop: 18, gap: 12 }}>
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

            <TouchableOpacity onPress={() => openJoinModal("")} activeOpacity={0.9} testID="live-join-credentials-btn">
              <View style={styles.joinBanner}>
                <View style={styles.joinBannerIcon}>
                  <Ionicons name="key-outline" size={24} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.joinBannerTitle}>Join with Room ID & PIN</Text>
                  <Text style={styles.joinBannerSub}>Enter credentials from host to join private call</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          </Animated.View>

          <View style={{ marginTop: 22 }}>
            <SectionTitle title="Trending Now" />
            <View style={{ gap: 12 }}>
              {rooms.map((r, i) => (
                <Animated.View key={r.room_id} entering={FadeInDown.delay(60 + i * 40).duration(400)}>
                  <TouchableOpacity onPress={() => handleRoomCardClick(r)} activeOpacity={0.9} testID={`live-room-${r.room_id}`}>
                    <GlassCard>
                      <View style={{ flexDirection: "row" }}>
                        <Avatar uri={r.host_avatar} name={r.host_name} size={52} isPremium={false} />
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

      {/* Join Room Credentials Modal */}
      <Modal visible={joinModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent} testID="join-room-modal">
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Join Live Room</Text>
              <TouchableOpacity onPress={() => setJoinModalVisible(false)} testID="close-join-modal">
                <Ionicons name="close-circle" size={28} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>Enter the 6-digit Room ID and Password PIN provided by the host.</Text>

            {joinError ? (
              <View style={styles.errorBox} testID="join-room-error">
                <Ionicons name="alert-circle" size={18} color="#EF4444" />
                <Text style={styles.errorText}>{joinError}</Text>
              </View>
            ) : null}

            <Text style={styles.inputLabel}>ROOM ID (6 digits)</Text>
            <TextInput
              value={joinRoomId}
              onChangeText={setJoinRoomId}
              placeholder="e.g. 839201"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              style={styles.modalInput}
              testID="join-room-id-input"
            />

            <Text style={[styles.inputLabel, { marginTop: 14 }]}>PASSWORD / PIN (4 digits)</Text>
            <TextInput
              value={joinPassword}
              onChangeText={setJoinPassword}
              placeholder="e.g. 4589"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              secureTextEntry
              style={styles.modalInput}
              testID="join-room-pin-input"
            />

            <View style={{ width: "100%", marginTop: 22 }}>
              <GradientButton
                label={joinBusy ? "Verifying..." : "Join Room"}
                icon="enter-outline"
                onPress={handleJoinSubmit}
                disabled={joinBusy}
                testID="join-room-submit-btn"
              />
            </View>
          </View>
        </View>
      </Modal>
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

  joinBanner: { flexDirection: "row", alignItems: "center", gap: 14, padding: 16, borderRadius: radii.xl, backgroundColor: "#fff", borderWidth: 1.5, borderColor: colors.divider, ...shadow.soft },
  joinBannerIcon: { width: 44, height: 44, borderRadius: 999, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" },
  joinBannerTitle: { ...typography.h3, fontSize: 15, color: colors.textPrimary },
  joinBannerSub: { ...typography.small, color: colors.textSecondary, marginTop: 2 },

  liveDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: "#EF4444" },
  liveText: { color: "#EF4444", fontFamily: "Manrope_700Bold", fontSize: 10, letterSpacing: 1 },
  topicText: { ...typography.small, color: colors.textSecondary },
  privateBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(245,158,11,0.12)", borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, marginLeft: "auto" },
  privateText: { color: colors.gold, fontFamily: "Manrope_600SemiBold", fontSize: 10 },
  roomTitle: { ...typography.h3, fontSize: 16, marginTop: 6 },
  roomMeta: { ...typography.small, color: colors.textSecondary },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalContent: { width: "100%", backgroundColor: "#fff", borderRadius: radii.xl, padding: 24, ...shadow.strong },
  modalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { ...typography.h2, fontSize: 20, color: colors.textPrimary },
  modalSub: { ...typography.body, color: colors.textSecondary, marginTop: 4, marginBottom: 16, fontSize: 14 },
  inputLabel: { ...typography.small, color: colors.textSecondary, fontFamily: "Manrope_700Bold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 },
  modalInput: { padding: 14, borderRadius: radii.lg, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#E2E8F0", fontFamily: "Outfit_700Bold", fontSize: 16, color: colors.textPrimary },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: radii.md, backgroundColor: "#FEF2F2", borderWidth: 1, borderColor: "#FCA5A5", marginBottom: 14 },
  errorText: { fontFamily: "Manrope_600SemiBold", fontSize: 13, color: "#EF4444", flex: 1 },
});
