import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Image, TouchableOpacity, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from "react-native-reanimated";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, gradients, radii, shadow, typography } from "@/src/theme";

export default function Call() {
  const { name, avatar, gender, country, room_id: roomIdParam } = useLocalSearchParams<{ name: string; avatar: string; gender: string; country: string; room_id?: string }>();
  const router = useRouter();
  const { refresh, updateUser } = useAuth();
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [reported, setReported] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const timer = useRef<any>(null);

  // ZEGOCLOUD refs — kept out of React state to avoid re-renders while a call is live.
  const zegoRef = useRef<any>(null);              // ZegoExpressEngine.instance()
  const zegoRoomId = useRef<string | null>(null);
  const zegoStreamId = useRef<string | null>(null);
  const zegoRemoteStreams = useRef<Set<string>>(new Set());
  const zegoTornDown = useRef(false);
  const zegoInitStarted = useRef(false);          // StrictMode / remount double-init guard
  const endingRef = useRef(false);                // double-tap guard on End Call

  const wave = useSharedValue(0);

  useEffect(() => {
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    wave.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => clearInterval(timer.current);
  }, [wave]);

  // ---------- ZEGOCLOUD lifecycle ----------
  // Native-only. Web / Expo Go bundling stays safe because we require() dynamically.
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (zegoInitStarted.current) return;    // StrictMode / remount guard
    zegoInitStarted.current = true;
    let cancelled = false;

    (async () => {
      try {
        // 1) Dynamic import so Metro doesn't try to resolve the native module on web
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const ZegoModule = require("zego-express-engine-reactnative");
        const ZegoExpressEngine = ZegoModule.default || ZegoModule.ZegoExpressEngine || ZegoModule;
        const ZegoScenario = ZegoModule.ZegoScenario || { Default: 0 };
        const ZegoUpdateType = ZegoModule.ZegoUpdateType || { Add: 0, Delete: 1 };

        // 2) Read public App ID (safe to expose). Bail early if not configured.
        const appIdRaw = process.env.EXPO_PUBLIC_ZEGO_APP_ID;
        const appId = appIdRaw ? Number(appIdRaw) : 0;
        if (!appId) {
          console.warn("[Zego] EXPO_PUBLIC_ZEGO_APP_ID missing — voice engine not started.");
          return;
        }

        // 3) Room ID must come from /api/match — never generated on the client
        //    so both matched users always end up in the same ZEGOCLOUD room.
        const rid = roomIdParam ? String(roomIdParam) : "";
        if (!rid) {
          console.warn("[Zego] no room_id passed by /api/match — aborting voice init.");
          return;
        }
        const tokenRes = await api.getZegoToken(rid);
        if (cancelled) return;

        // 4) Init engine (audio-only scenario, no video track ever created)
        await ZegoExpressEngine.createEngineWithProfile({
          appID: appId,
          scenario: ZegoScenario.Default,
        });
        if (cancelled) { await teardownZego(); return; }
        const engine = ZegoExpressEngine.instance();
        zegoRef.current = engine;
        zegoRoomId.current = tokenRes.room_id;

        // 5) Event listeners — clear any stale ones first (Zego .on() APPENDS, not replaces)
        try { engine.off("roomStateUpdate"); engine.off("roomStreamUpdate"); engine.off("publisherStateUpdate"); } catch { /* ignore */ }

        engine.on("roomStateUpdate", (_rid: string, state: number, errorCode: number) => {
          console.log("[Zego] roomStateUpdate", { state, errorCode });
          // Hard disconnect (state === 0 DISCONNECTED with non-zero error after SDK retries):
          // fall back to the same End Call path so the user isn't stuck on a dead room.
          if (state === 0 && errorCode !== 0) {
            console.warn("[Zego] room disconnected with error — ending call");
            endCall().catch(() => {});
          }
        });
        engine.on("roomStreamUpdate", (_rid: string, updateType: number, streamList: any[]) => {
          streamList.forEach((s) => {
            if (updateType === ZegoUpdateType.Add) {
              zegoRemoteStreams.current.add(s.streamID);
              engine.startPlayingStream(s.streamID);   // remote AUDIO only (no view)
            } else {
              zegoRemoteStreams.current.delete(s.streamID);
              engine.stopPlayingStream(s.streamID);
            }
          });
        });
        engine.on("publisherStateUpdate", (_sid: string, state: number, errorCode: number) => {
          console.log("[Zego] publisherStateUpdate", { state, errorCode });
        });

        // 6) Login to the room using the server-issued token
        await engine.loginRoom(
          tokenRes.room_id,
          { userID: tokenRes.user_id, userName: tokenRes.user_id },
          { token: tokenRes.token, userUpdate: true },
        );
        if (cancelled) { await teardownZego(); return; }

        // 7) Publish local AUDIO only (no camera / no video track)
        const streamId = `${tokenRes.user_id}_audio`;
        zegoStreamId.current = streamId;
        await engine.startPublishingStream(streamId);
        if (cancelled) { await teardownZego(); return; }

        // 8) Apply current UI state to the engine
        engine.muteMicrophone(muted);
        engine.setAudioRouteToSpeaker(speaker);
      } catch (e: any) {
        console.warn("[Zego] init failed:", e?.message || e);
      }
    })();

    return () => {
      cancelled = true;
      teardownZego().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const teardownZego = async () => {
    if (zegoTornDown.current) return;
    zegoTornDown.current = true;
    const engine = zegoRef.current;
    if (!engine) return;
    try {
      // Deregister listeners FIRST so late callbacks after logout can't fire into a torn-down UI.
      try { engine.off("roomStateUpdate"); engine.off("roomStreamUpdate"); engine.off("publisherStateUpdate"); } catch { /* ignore */ }
      if (zegoStreamId.current) {
        await engine.stopPublishingStream();
      }
      zegoRemoteStreams.current.forEach((sid) => {
        try { engine.stopPlayingStream(sid); } catch { /* ignore */ }
      });
      zegoRemoteStreams.current.clear();
      if (zegoRoomId.current) {
        await engine.logoutRoom(zegoRoomId.current);
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ZegoModule = require("zego-express-engine-reactnative");
      const ZegoExpressEngine = ZegoModule.default || ZegoModule.ZegoExpressEngine || ZegoModule;
      await ZegoExpressEngine.destroyEngine();
    } catch (e: any) {
      console.warn("[Zego] teardown warning:", e?.message || e);
    } finally {
      zegoRef.current = null;
      zegoStreamId.current = null;
      zegoRoomId.current = null;
    }
  };

  // ---------- Wire the existing controls to Zego ----------
  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    try { zegoRef.current?.muteMicrophone(next); } catch { /* ignore */ }
  };

  const toggleSpeaker = () => {
    const next = !speaker;
    setSpeaker(next);
    try { zegoRef.current?.setAudioRouteToSpeaker(next); } catch { /* ignore */ }
  };

  const bar1 = useAnimatedStyle(() => ({ transform: [{ scaleY: 0.5 + Math.abs(Math.sin((wave.value + 0.0) * Math.PI * 2)) }] }));
  const bar2 = useAnimatedStyle(() => ({ transform: [{ scaleY: 0.5 + Math.abs(Math.sin((wave.value + 0.15) * Math.PI * 2)) }] }));
  const bar3 = useAnimatedStyle(() => ({ transform: [{ scaleY: 0.5 + Math.abs(Math.sin((wave.value + 0.3) * Math.PI * 2)) }] }));
  const bar4 = useAnimatedStyle(() => ({ transform: [{ scaleY: 0.5 + Math.abs(Math.sin((wave.value + 0.45) * Math.PI * 2)) }] }));
  const bar5 = useAnimatedStyle(() => ({ transform: [{ scaleY: 0.5 + Math.abs(Math.sin((wave.value + 0.6) * Math.PI * 2)) }] }));
  const bar6 = useAnimatedStyle(() => ({ transform: [{ scaleY: 0.5 + Math.abs(Math.sin((wave.value + 0.75) * Math.PI * 2)) }] }));
  const bar7 = useAnimatedStyle(() => ({ transform: [{ scaleY: 0.5 + Math.abs(Math.sin((wave.value + 0.9) * Math.PI * 2)) }] }));
  const bars = [bar1, bar2, bar3, bar4, bar5, bar6, bar7];

  const fmt = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const endCall = async () => {
    if (endingRef.current) return;   // double-tap / auto-hangup guard
    endingRef.current = true;
    if (timer.current) clearInterval(timer.current);
    await teardownZego();
    try {
      const res = await api.logCall({ partner_name: String(name || ""), partner_avatar: String(avatar || ""), duration_seconds: seconds, partner_gender: String(gender || "any") });
      if (res?.user) updateUser(res.user);
      await refresh();
    } catch { /* ignore */ }
    router.replace("/(tabs)");
  };

  const report = async () => {
    if (reported) return;
    try { await api.report(String(name || ""), "inappropriate"); setReported(true); } catch { /* ignore */ }
  };
  const block = async () => {
    if (blocked) return;
    try { await api.block(String(name || "")); setBlocked(true); } catch { /* ignore */ }
  };
  const addFriend = async () => {
    try { await api.sendFriendRequest(String(name || ""), String(avatar || "")); } catch { /* ignore */ }
  };

  return (
    <View style={styles.root} testID="call-screen">
      <LinearGradient colors={gradients.premium} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <View style={styles.topRow}>
          <View>
            <Text style={styles.status}>In Call</Text>
            <Text style={styles.timerText}>{fmt(seconds)}</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity onPress={addFriend} style={styles.topBtn} testID="call-add-friend"><Ionicons name="person-add" size={16} color="#fff" /></TouchableOpacity>
            <TouchableOpacity onPress={report} style={styles.topBtn} testID="call-report"><Ionicons name={reported ? "checkmark" : "flag"} size={16} color="#fff" /></TouchableOpacity>
            <TouchableOpacity onPress={block} style={styles.topBtn} testID="call-block"><Ionicons name={blocked ? "checkmark" : "ban"} size={16} color="#fff" /></TouchableOpacity>
          </View>
        </View>

        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <View style={styles.avatarRing}>
            <Image source={{ uri: String(avatar || "") }} style={styles.avatar} />
          </View>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.meta}>{country}</Text>

          <View style={styles.waves}>
            {bars.map((b, i) => (
              <Animated.View key={i} style={[styles.wave, b]} />
            ))}
          </View>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity onPress={toggleMute} style={[styles.ctrl, muted && styles.ctrlActive]} testID="call-mute">
            <Ionicons name={muted ? "mic-off" : "mic"} size={22} color={muted ? colors.primary : "#fff"} />
          </TouchableOpacity>
          <TouchableOpacity onPress={endCall} style={styles.endBtn} testID="call-end">
            <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleSpeaker} style={[styles.ctrl, !speaker && styles.ctrlActive]} testID="call-speaker">
            <Ionicons name={speaker ? "volume-high" : "volume-mute"} size={22} color={!speaker ? colors.primary : "#fff"} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20 },
  status: { color: "#93C5FD", fontFamily: "Manrope_700Bold", fontSize: 12, letterSpacing: 1.5 },
  timerText: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 22, marginTop: 4 },
  topBtn: { width: 36, height: 36, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  avatarRing: { padding: 8, borderRadius: 999, borderWidth: 2, borderColor: "rgba(147,197,253,0.4)" },
  avatar: { width: 180, height: 180, borderRadius: 999, borderWidth: 3, borderColor: "#fff" },
  name: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 30, marginTop: 22 },
  meta: { color: "rgba(255,255,255,0.7)", marginTop: 6, fontFamily: "Manrope_500Medium" },
  waves: { flexDirection: "row", alignItems: "center", gap: 5, height: 60, marginTop: 30 },
  wave: { width: 5, height: 40, borderRadius: 999, backgroundColor: "#3B82F6" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 30, paddingBottom: 30 },
  ctrl: { width: 60, height: 60, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.15)", borderWidth: 1, borderColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  ctrlActive: { backgroundColor: "#fff" },
  endBtn: { width: 78, height: 78, borderRadius: 999, backgroundColor: "#EF4444", alignItems: "center", justifyContent: "center", ...shadow.strong },
});
