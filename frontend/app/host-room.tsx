import { useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Modal, Share } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";

import { api, CreateRoomResponse } from "@/src/api/client";
import { colors, radii, shadow, typography } from "@/src/theme";
import { ScreenHeader, GradientButton } from "@/src/components/ui";

const TOPICS = ["Daily English", "Business", "Interview", "Travel", "Public Speaking", "Grammar", "Other"];

export default function HostRoom() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState("");
  const [topic, setTopic] = useState(TOPICS[0]);
  const [customTopic, setCustomTopic] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [createdRoom, setCreatedRoom] = useState<CreateRoomResponse | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (val.trim()) {
      setTitleError("");
    }
  };

  const create = async () => {
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setTitleError("Room title is required");
      return;
    }
    setTitleError("");
    const finalTopic = topic === "Other" ? (customTopic.trim() || "Other") : topic;
    setBusy(true);
    try {
      const room = await api.createRoom({ title: cleanTitle, topic: finalTopic, is_private: isPrivate });
      setCreatedRoom(room);
      setModalVisible(true);
    } catch (e: any) {
      Alert.alert("Error", e.message || "Failed to create room");
    } finally { setBusy(false); }
  };

  const copyCredentials = async () => {
    if (!createdRoom) return;
    const textToCopy = `Room ID: ${createdRoom.room_id}\nPassword/PIN: ${createdRoom.password}`;
    await Clipboard.setStringAsync(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareDetails = async () => {
    if (!createdRoom) return;
    try {
      await Share.share({
        message: createdRoom.share_text || `Join my Acuspeak Live Room!\nRoom ID: ${createdRoom.room_id}\nPIN: ${createdRoom.password}`,
        title: `Acuspeak Room: ${createdRoom.title}`,
      });
    } catch (e: any) {
      Alert.alert("Error", "Could not open share menu");
    }
  };

  const proceedToRoom = () => {
    if (!createdRoom) return;
    setModalVisible(false);
    router.replace({
      pathname: "/room/[id]",
      params: {
        id: createdRoom.room_id,
        title: createdRoom.title,
        topic: createdRoom.topic,
        host: createdRoom.host_name,
        avatar: createdRoom.host_avatar || "",
        password: createdRoom.password,
      },
    });
  };

  const isFormValid = title.trim().length > 0;

  return (
    <View style={styles.root} testID="host-room-screen">
      <LinearGradient colors={["#EFF6FF", colors.bg]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScreenHeader title="Host a Room" showBack onBack={() => router.back()} />
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <Text style={styles.label}>Room title</Text>
          <TextInput
            value={title}
            onChangeText={handleTitleChange}
            placeholder="e.g. Practice Business Presentations"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, titleError ? styles.inputError : null]}
            testID="host-room-title"
          />
          {titleError ? <Text style={styles.errorText} testID="host-title-error">{titleError}</Text> : null}

          <Text style={[styles.label, { marginTop: 20 }]}>Topic</Text>
          <View style={styles.chipsRow}>
            {TOPICS.map((t) => (
              <TouchableOpacity key={t} onPress={() => setTopic(t)} style={[styles.chip, topic === t && styles.chipActive]} testID={`host-topic-${t}`}>
                <Text style={[styles.chipText, topic === t && styles.chipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {topic === "Other" ? (
            <TextInput
              value={customTopic}
              onChangeText={setCustomTopic}
              placeholder="e.g. Tech & AI Conversations"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { marginTop: 10 }]}
              testID="host-custom-topic-input"
            />
          ) : null}

          <Text style={[styles.label, { marginTop: 20 }]}>Privacy</Text>
          <View style={{ gap: 10 }}>
            <TouchableOpacity onPress={() => setIsPrivate(false)} style={[styles.privRow, !isPrivate && styles.privRowActive]} testID="host-privacy-public">
              <Ionicons name="globe" size={22} color={!isPrivate ? colors.primary : colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.privTitle}>Public</Text>
                <Text style={styles.privSub}>Anyone can join and listen</Text>
              </View>
              {!isPrivate ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsPrivate(true)} style={[styles.privRow, isPrivate && styles.privRowActive]} testID="host-privacy-private">
              <Ionicons name="lock-closed" size={22} color={isPrivate ? colors.primary : colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.privTitle}>Private</Text>
                <Text style={styles.privSub}>Only invited users with PIN can join</Text>
              </View>
              {isPrivate ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
            </TouchableOpacity>
          </View>

          <View style={{ marginTop: 26 }}>
            <GradientButton label={busy ? "Creating..." : "Create room"} icon="radio" onPress={create} disabled={busy || !isFormValid} testID="host-create-btn" />
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Room Credentials Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent} testID="room-credentials-modal">
            <View style={styles.modalHeaderIcon}>
              <Ionicons name="checkmark-circle" size={48} color="#10B981" />
            </View>
            <Text style={styles.modalTitle}>Room Created!</Text>
            <Text style={styles.modalSub}>Share credentials with your participants to invite them.</Text>

            <View style={styles.credCard}>
              <View style={styles.credRow}>
                <Text style={styles.credLabel}>ROOM ID</Text>
                <Text style={styles.credValue} testID="created-room-id">{createdRoom?.room_id}</Text>
              </View>
              <View style={styles.credDivider} />
              <View style={styles.credRow}>
                <Text style={styles.credLabel}>PASSWORD / PIN</Text>
                <Text style={styles.credValue} testID="created-room-pin">{createdRoom?.password}</Text>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.copyBtn} onPress={copyCredentials} testID="copy-credentials-btn">
                <Ionicons name={copied ? "checkmark" : "copy-outline"} size={18} color={colors.primary} />
                <Text style={styles.copyBtnText}>{copied ? "Copied!" : "Copy Credentials"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareBtn} onPress={shareDetails} testID="share-credentials-btn">
                <Ionicons name="share-social-outline" size={18} color="#fff" />
                <Text style={styles.shareBtnText}>Share Room Details</Text>
              </TouchableOpacity>
            </View>

            <View style={{ width: "100%", marginTop: 14 }}>
              <GradientButton label="Continue to room" icon="arrow-forward" onPress={proceedToRoom} testID="enter-room-btn" />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  label: { ...typography.small, color: colors.textSecondary, fontFamily: "Manrope_700Bold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 },
  input: { padding: 16, borderRadius: radii.lg, backgroundColor: "#fff", ...shadow.soft, fontFamily: "Manrope_500Medium", fontSize: 15 },
  inputError: { borderWidth: 1.5, borderColor: "#EF4444" },
  errorText: { color: "#EF4444", fontFamily: "Manrope_600SemiBold", fontSize: 12, marginTop: 6 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.divider },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.small, fontFamily: "Manrope_600SemiBold", color: colors.textPrimary },
  chipTextActive: { color: "#fff" },
  privRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radii.lg, backgroundColor: "#fff", borderWidth: 1.5, borderColor: colors.divider },
  privRowActive: { borderColor: colors.primary, backgroundColor: "#EFF6FF" },
  privTitle: { ...typography.h3, fontSize: 15 },
  privSub: { ...typography.small, color: colors.textSecondary },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalContent: { width: "100%", backgroundColor: "#fff", borderRadius: radii.xl, padding: 24, alignItems: "center", ...shadow.strong },
  modalHeaderIcon: { marginBottom: 8 },
  modalTitle: { ...typography.h2, fontSize: 22, color: colors.textPrimary },
  modalSub: { ...typography.body, color: colors.textSecondary, textAlign: "center", marginTop: 4, marginBottom: 18 },
  credCard: { width: "100%", backgroundColor: "#F8FAFC", borderRadius: radii.lg, padding: 16, borderWidth: 1, borderColor: "#E2E8F0", marginBottom: 16 },
  credRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  credLabel: { fontFamily: "Manrope_700Bold", fontSize: 12, color: colors.textMuted, letterSpacing: 1 },
  credValue: { fontFamily: "Outfit_700Bold", fontSize: 20, color: colors.primary, letterSpacing: 2 },
  credDivider: { height: 1, backgroundColor: "#E2E8F0", marginVertical: 12 },
  modalActions: { flexDirection: "row", gap: 10, width: "100%" },
  copyBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: radii.lg, backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: colors.primaryLight },
  copyBtnText: { fontFamily: "Manrope_700Bold", fontSize: 13, color: colors.primary },
  shareBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: radii.lg, backgroundColor: colors.primary },
  shareBtnText: { fontFamily: "Manrope_700Bold", fontSize: 13, color: "#fff" },
});
