import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Platform,
  PermissionsAndroid,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, gradients, shadow } from "@/src/theme";

export default function Call() {
  const {
    name,
    avatar,
    gender,
    country,
    room_id: roomIdParam,
    target_user_id: targetUserIdParam,
  } = useLocalSearchParams<{
    name: string;
    avatar: string;
    gender: string;
    country: string;
    room_id?: string;
    target_user_id?: string;
  }>();

  const router = useRouter();
  const { refresh, updateUser, user } = useAuth();
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [reported, setReported] = useState(false);
  const [blocked, setBlocked] = useState(false);

  // Rating & Feedback Modal State
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const timer = useRef<any>(null);

  // ZEGOCLOUD refs
  const zegoRef = useRef<any>(null);
  const zegoWebLocalStreamRef = useRef<any>(null);
  const zegoRoomId = useRef<string | null>(null);
  const zegoStreamId = useRef<string | null>(null);
  const zegoRemoteStreams = useRef<Set<string>>(new Set());
  const zegoTornDown = useRef(false);
  const zegoInitStarted = useRef(false);
  const endingRef = useRef(false);

  // Helper to resume/play all remote audio & video media elements on user interaction
  const resumeAllRemoteMedia = () => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const mediaEls = document.querySelectorAll<HTMLMediaElement>('[id^="zego-media-"], [id^="zego-call-"]');
    mediaEls.forEach((el) => {
      if (el.srcObject) {
        el.muted = false;
        el.volume = 1.0;
        if (el.paused) {
          el.play().catch((err) => console.warn("[Zego Web] Autoplay resume error:", err));
        }
      }
    });
  };

  // Web user-gesture listener to unlock browser autoplay policy
  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const handleUserGesture = () => {
        resumeAllRemoteMedia();
      };
      window.addEventListener("click", handleUserGesture);
      window.addEventListener("touchstart", handleUserGesture);
      window.addEventListener("pointerdown", handleUserGesture);
      window.addEventListener("keydown", handleUserGesture);
      return () => {
        window.removeEventListener("click", handleUserGesture);
        window.removeEventListener("touchstart", handleUserGesture);
        window.removeEventListener("pointerdown", handleUserGesture);
        window.removeEventListener("keydown", handleUserGesture);
      };
    }
  }, []);

  const wave = useSharedValue(0);
  const modalScale = useSharedValue(0.8);
  const modalOpacity = useSharedValue(0);

  const animModalStyle = useAnimatedStyle(() => ({
    transform: [{ scale: modalScale.value }],
    opacity: modalOpacity.value,
  }));

  useEffect(() => {
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    wave.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [wave]);

  // Request native Android audio recording permission
  const requestAndroidPermission = async () => {
    if (Platform.OS !== "android") return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: "Microphone Permission",
          message: "Acuspeak needs access to your microphone for voice calling.",
          buttonNeutral: "Ask Me Later",
          buttonNegative: "Cancel",
          buttonPositive: "OK",
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn("[Zego] Permission request error:", err);
      return false;
    }
  };

  // ---------- Call Termination Handler ----------
  const handleCallTermination = async (isLocalHangup: boolean = false) => {
    if (endingRef.current) return;
    endingRef.current = true;

    if (timer.current) clearInterval(timer.current);

    const rid = roomIdParam ? String(roomIdParam) : "";
    if (isLocalHangup && rid) {
      try {
        await api.endCallSession(rid);
      } catch (err) {
        console.warn("[Call] endCallSession warning:", err);
      }
    }

    await teardownZego();

    // Trigger post-call feedback modal with entrance animation
    setShowFeedbackModal(true);
    modalScale.value = withTiming(1, { duration: 300 });
    modalOpacity.value = withTiming(1, { duration: 300 });
  };

  // ---------- Backend Dual-Side Status Polling ----------
  useEffect(() => {
    const rid = roomIdParam ? String(roomIdParam) : "";
    if (!rid) return;

    const statusInterval = setInterval(async () => {
      if (endingRef.current) return;
      try {
        const res = await api.getCallStatus(rid);
        if (res?.status === "ended") {
          console.log("[Call] Status check returned ended — terminating call locally");
          handleCallTermination(false).catch(() => { });
        }
      } catch {
        /* ignore status poll errors */
      }
    }, 2000);

    return () => clearInterval(statusInterval);
  }, [roomIdParam]);

  // ---------- ZEGOCLOUD lifecycle ----------
  useEffect(() => {
    if (zegoInitStarted.current) return;
    zegoInitStarted.current = true;
    let cancelled = false;

    (async () => {
      try {
        const hasPermission = await requestAndroidPermission();
        if (!hasPermission && Platform.OS === "android") {
          console.warn("[Zego] Audio permission denied");
        }

        const rid = roomIdParam ? String(roomIdParam) : "";
        if (!rid) {
          console.warn("[Zego] no room_id passed — aborting voice init.");
          return;
        }

        // 1. Fetch token and credentials from FastAPI backend
        const tokenRes: any = await api.getZegoToken(rid);
        if (cancelled) return;

        // Fallback to token response app_id if client env isn't defined
        const appId = Number(process.env.EXPO_PUBLIC_ZEGO_APP_ID || tokenRes?.app_id || 1166884706);
        if (!appId) {
          console.warn("[Zego] Missing App ID — cannot initialize engine.");
          return;
        }

        zegoRoomId.current = tokenRes.room_id || rid;
        const currentUserId = tokenRes.user_id || user?.user_id || `user_${Date.now()}`;
        const streamId = `${currentUserId}_audio`;
        zegoStreamId.current = streamId;

        if (Platform.OS === "web") {
          console.log("[Zego Web] Initializing Zego WebRTC Express Engine for 1-on-1 Call:", rid);
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const ZegoWebModule = require("zego-express-engine-webrtc");
          const ZegoExpressEngineWeb = ZegoWebModule.ZegoExpressEngine || ZegoWebModule.default || ZegoWebModule;
          const server = `wss://webim-${appId}-api.zego.im/ws`;

          const zgWeb = new ZegoExpressEngineWeb(appId, server);
          zegoRef.current = zgWeb;

          zgWeb.on("roomStateUpdate", (_rid: string, state: string, errorCode: number) => {
            console.log("[Zego Web] roomStateUpdate", { state, errorCode });
            if (state === "DISCONNECTED") {
              console.warn("[Zego Web] Room disconnected — terminating call");
              handleCallTermination(false).catch(() => { });
            }
          });

          zgWeb.on("roomUserUpdate", (_rid: string, updateType: string, userList: any[]) => {
            console.log("[Zego Web] roomUserUpdate", { updateType, userList });
            if (updateType === "DELETE") {
              console.log("[Zego Web] Remote user left room — ending call");
              handleCallTermination(false).catch(() => { });
            }
          });

          zgWeb.on("roomStreamUpdate", async (_rid: string, updateType: string, streamList: any[]) => {
            console.log("[Zego Web] roomStreamUpdate", { updateType, streamList });
            for (const s of streamList) {
              if (updateType === "ADD") {
                zegoRemoteStreams.current.add(s.streamID);
                try {
                  console.log("[Zego Web] Subscribing to 1-on-1 remote stream:", s.streamID);
                  const remoteStream = await zgWeb.startPlayingStream(s.streamID);
                  let el = document.getElementById(`zego-call-${s.streamID}`) as HTMLMediaElement;
                  if (!el) {
                    el = document.createElement("audio") as HTMLMediaElement;
                    el.id = `zego-call-${s.streamID}`;
                    el.autoplay = true;
                    el.setAttribute("playsinline", "true");
                    el.setAttribute("webkit-playsinline", "true");
                    (el as any).playsInline = true;
                    el.volume = 1.0;
                    el.muted = false;
                    document.body.appendChild(el);
                  }
                  el.srcObject = remoteStream;
                  const playPromise = el.play();
                  if (playPromise !== undefined) {
                    playPromise.catch((err: any) => {
                      console.warn("[Zego Web] Audio play error (click screen to unlock autoplay):", err);
                    });
                  }
                } catch (err) {
                  console.warn("[Zego Web] startPlayingStream error:", err);
                }
              } else {
                zegoRemoteStreams.current.delete(s.streamID);
                try {
                  zgWeb.stopPlayingStream(s.streamID);
                  const el = document.getElementById(`zego-call-${s.streamID}`);
                  if (el) el.remove();
                } catch { /* ignore */ }
                if (zegoRemoteStreams.current.size === 0) {
                  console.log("[Zego Web] Remote stream removed — ending call");
                  handleCallTermination(false).catch(() => { });
                }
              }
            }
          });

          console.log("[Zego Web] Logging into room with token...");
          await zgWeb.loginRoom(
            zegoRoomId.current,
            tokenRes.token,
            { userID: String(currentUserId), userName: String(user?.name || currentUserId) },
            { userUpdate: true }
          );

          if (cancelled) {
            await teardownZego();
            return;
          }

          console.log("[Zego Web] Creating local WebRTC audio stream...");
          const localStream = await zgWeb.createStream({
            camera: { audio: true, video: false },
          });
          zegoWebLocalStreamRef.current = localStream;

          console.log("[Zego Web] Starting WebRTC stream publishing:", streamId);
          const pubResult = zgWeb.startPublishingStream(streamId, localStream);
          console.log("[Zego Web] startPublishingStream result:", pubResult);

          if (muted) {
            localStream.getAudioTracks().forEach((t: any) => { t.enabled = false; });
            zgWeb.mutePublishStreamAudio(localStream, true);
          } else {
            localStream.getAudioTracks().forEach((t: any) => { t.enabled = true; });
            zgWeb.mutePublishStreamAudio(localStream, false);
          }
        } else {
          // Native (Android / iOS)
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const ZegoModule = require("zego-express-engine-reactnative");
          const ZegoExpressEngine = ZegoModule.default || ZegoModule.ZegoExpressEngine || ZegoModule;
          const ZegoScenario = ZegoModule.ZegoScenario || { Default: 0, StandardVoiceCall: 2 };
          const ZegoUpdateType = ZegoModule.ZegoUpdateType || { Add: 0, Delete: 1 };

          // Initialize engine for standard voice communication
          const scenario = ZegoScenario.StandardVoiceCall ?? ZegoScenario.Default;
          await ZegoExpressEngine.createEngineWithProfile({
            appID: appId,
            scenario,
          });

          if (cancelled) {
            await teardownZego();
            return;
          }

          const engine = ZegoExpressEngine.instance();
          zegoRef.current = engine;

          // Clear existing listeners
          try {
            engine.off("roomStateUpdate");
            engine.off("roomStreamUpdate");
            engine.off("roomUserUpdate");
            engine.off("publisherStateUpdate");
            engine.off("capturedSoundLevelUpdate");
          } catch {
            /* ignore */
          }

          // Attach event listeners
          engine.on("roomStateUpdate", (_rid: string, state: number, errorCode: number) => {
            console.log("[Zego] roomStateUpdate", { state, errorCode });
            if (state === 0 && errorCode !== 0) {
              console.warn("[Zego] Room disconnected — terminating call");
              handleCallTermination(false).catch(() => { });
            }
          });

          engine.on("roomUserUpdate", (_rid: string, updateType: number, userList: any[]) => {
            console.log("[Zego] roomUserUpdate", { updateType, userList });
            if (updateType === ZegoUpdateType.Delete) {
              console.log("[Zego] Remote user left room — ending call");
              handleCallTermination(false).catch(() => { });
            }
          });

          engine.on("roomStreamUpdate", (_rid: string, updateType: number, streamList: any[]) => {
            streamList.forEach((s) => {
              if (updateType === ZegoUpdateType.Add) {
                zegoRemoteStreams.current.add(s.streamID);
                engine.startPlayingStream(s.streamID);
              } else {
                zegoRemoteStreams.current.delete(s.streamID);
                engine.stopPlayingStream(s.streamID);
                if (zegoRemoteStreams.current.size === 0) {
                  console.log("[Zego] Remote stream removed — ending call");
                  handleCallTermination(false).catch(() => { });
                }
              }
            });
          });

          engine.on("publisherStateUpdate", (_sid: string, state: number, errorCode: number) => {
            console.log("[Zego] publisherStateUpdate", { state, errorCode });
          });

          // Login to the room with backend token
          await engine.loginRoom(
            zegoRoomId.current,
            { userID: String(currentUserId), userName: String(user?.name || currentUserId) },
            { token: tokenRes.token, userUpdate: true }
          );

          if (cancelled) {
            await teardownZego();
            return;
          }

          // Publish audio stream
          await engine.startPublishingStream(streamId);

          if (cancelled) {
            await teardownZego();
            return;
          }

          // Sync states
          engine.muteMicrophone(muted);
          engine.setAudioRouteToSpeaker(speaker);
        }
      } catch (e: any) {
        console.warn("[Zego] init failed:", e?.message || e);
      }
    })();

    return () => {
      cancelled = true;
      teardownZego().catch(() => { });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomIdParam]);

  const teardownZego = async () => {
    if (zegoTornDown.current) return;
    zegoTornDown.current = true;
    const engine = zegoRef.current;
    if (!engine) return;

    try {
      if (Platform.OS === "web") {
        console.log("[Zego Web] Tearing down 1-on-1 call WebRTC engine...");
        if (zegoStreamId.current) {
          try { engine.stopPublishingStream(zegoStreamId.current); } catch { }
        }
        if (zegoWebLocalStreamRef.current) {
          try { engine.destroyStream(zegoWebLocalStreamRef.current); } catch { }
          zegoWebLocalStreamRef.current = null;
        }
        zegoRemoteStreams.current.forEach((sid) => {
          try {
            engine.stopPlayingStream(sid);
            const el = document.getElementById(`zego-call-${sid}`);
            if (el) el.remove();
          } catch { /* ignore */ }
        });
        zegoRemoteStreams.current.clear();
        if (zegoRoomId.current) {
          try { engine.logoutRoom(zegoRoomId.current); } catch { }
        }
      } else {
        try {
          engine.off("roomStateUpdate");
          engine.off("roomStreamUpdate");
          engine.off("roomUserUpdate");
          engine.off("publisherStateUpdate");
        } catch {
          /* ignore */
        }

        if (zegoStreamId.current) {
          await engine.stopPublishingStream();
        }

        zegoRemoteStreams.current.forEach((sid) => {
          try {
            engine.stopPlayingStream(sid);
          } catch {
            /* ignore */
          }
        });
        zegoRemoteStreams.current.clear();

        if (zegoRoomId.current) {
          await engine.logoutRoom(zegoRoomId.current);
        }

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const ZegoModule = require("zego-express-engine-reactnative");
        const ZegoExpressEngine = ZegoModule.default || ZegoModule.ZegoExpressEngine || ZegoModule;
        await ZegoExpressEngine.destroyEngine();
      }
    } catch (e: any) {
      console.warn("[Zego] teardown warning:", e?.message || e);
    } finally {
      zegoRef.current = null;
      zegoStreamId.current = null;
      zegoRoomId.current = null;
    }
  };

  const toggleMute = () => {
    resumeAllRemoteMedia();
    const next = !muted;
    setMuted(next);
    if (Platform.OS === "web") {
      const localStream = zegoWebLocalStreamRef.current;
      if (localStream) {
        localStream.getAudioTracks().forEach((t: any) => { t.enabled = !next; });
        try {
          zegoRef.current?.mutePublishStreamAudio(localStream, next);
        } catch { /* ignore */ }
      }
    } else {
      try {
        zegoRef.current?.muteMicrophone(next);
      } catch {
        /* ignore */
      }
    }
  };

  const toggleSpeaker = () => {
    const next = !speaker;
    setSpeaker(next);
    try {
      zegoRef.current?.setAudioRouteToSpeaker(next);
    } catch {
      /* ignore */
    }
  };

  const endCall = () => {
    handleCallTermination(true);
  };

  const submitFeedback = async () => {
    if (rating === 0 || submittingFeedback) return;
    setSubmittingFeedback(true);

    const rid = roomIdParam ? String(roomIdParam) : "";
    const targetId = targetUserIdParam || String(name || "partner");

    try {
      if (rid) {
        await api.submitCallFeedback({
          room_id: rid,
          target_user_id: targetId,
          rating,
          comment: comment.trim() || undefined,
        });
      }
    } catch (err) {
      console.warn("[Call] submitCallFeedback warning:", err);
    }

    try {
      const res = await api.logCall({
        partner_name: String(name || ""),
        partner_avatar: String(avatar || ""),
        duration_seconds: seconds,
        partner_gender: String(gender || "any"),
      });
      if (res?.user) updateUser(res.user);
      await refresh();
    } catch {
      /* ignore */
    }

    router.replace("/(tabs)");
  };

  const skipFeedback = async () => {
    try {
      const res = await api.logCall({
        partner_name: String(name || ""),
        partner_avatar: String(avatar || ""),
        duration_seconds: seconds,
        partner_gender: String(gender || "any"),
      });
      if (res?.user) updateUser(res.user);
      await refresh();
    } catch {
      /* ignore */
    }

    router.replace("/(tabs)");
  };

  const report = async () => {
    if (reported) return;
    try {
      await api.report(String(name || ""), "inappropriate");
      setReported(true);
    } catch {
      /* ignore */
    }
  };

  const block = async () => {
    if (blocked) return;
    try {
      await api.block(String(name || ""));
      setBlocked(true);
    } catch {
      /* ignore */
    }
  };

  const addFriend = async () => {
    try {
      await api.sendFriendRequest(String(name || ""), String(avatar || ""));
    } catch {
      /* ignore */
    }
  };

  const bar1 = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.5 + Math.abs(Math.sin((wave.value + 0.0) * Math.PI * 2)) }],
  }));
  const bar2 = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.5 + Math.abs(Math.sin((wave.value + 0.15) * Math.PI * 2)) }],
  }));
  const bar3 = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.5 + Math.abs(Math.sin((wave.value + 0.3) * Math.PI * 2)) }],
  }));
  const bar4 = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.5 + Math.abs(Math.sin((wave.value + 0.45) * Math.PI * 2)) }],
  }));
  const bar5 = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.5 + Math.abs(Math.sin((wave.value + 0.6) * Math.PI * 2)) }],
  }));
  const bar6 = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.5 + Math.abs(Math.sin((wave.value + 0.75) * Math.PI * 2)) }],
  }));
  const bar7 = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.5 + Math.abs(Math.sin((wave.value + 0.9) * Math.PI * 2)) }],
  }));
  const bars = [bar1, bar2, bar3, bar4, bar5, bar6, bar7];

  const fmt = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
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
            <TouchableOpacity onPress={addFriend} style={styles.topBtn} testID="call-add-friend">
              <Ionicons name="person-add" size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={report} style={styles.topBtn} testID="call-report">
              <Ionicons name={reported ? "checkmark" : "flag"} size={16} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={block} style={styles.topBtn} testID="call-block">
              <Ionicons name={blocked ? "checkmark" : "ban"} size={16} color="#fff" />
            </TouchableOpacity>
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
          <TouchableOpacity
            onPress={toggleMute}
            style={[styles.ctrl, muted && styles.ctrlActive]}
            testID="call-mute"
          >
            <Ionicons
              name={muted ? "mic-off" : "mic"}
              size={22}
              color={muted ? colors.primary : "#fff"}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={endCall} style={styles.endBtn} testID="call-end">
            <Ionicons
              name="call"
              size={28}
              color="#fff"
              style={{ transform: [{ rotate: "135deg" }] }}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={toggleSpeaker}
            style={[styles.ctrl, !speaker && styles.ctrlActive]}
            testID="call-speaker"
          >
            <Ionicons
              name={speaker ? "volume-high" : "volume-mute"}
              size={22}
              color={!speaker ? colors.primary : "#fff"}
            />
          </TouchableOpacity>
        </View>

        {/* Post-Call Rating & Feedback Modal Overlay */}
        {showFeedbackModal && (
          <View style={StyleSheet.absoluteFill} testID="feedback-modal">
            <View style={styles.modalBackdrop} />
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.modalContainer}
            >
              <Animated.View style={[styles.modalCard, animModalStyle]}>
                <Text style={styles.feedbackTitle}>How was your call?</Text>
                <Text style={styles.feedbackSubtitle}>
                  Rate your practice conversation with {name}
                </Text>

                <View style={styles.feedbackAvatarRing}>
                  <Image source={{ uri: String(avatar || "") }} style={styles.feedbackAvatar} />
                </View>

                {/* 1-5 Star Rating */}
                <View style={styles.starRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity
                      key={star}
                      onPress={() => setRating(star)}
                      activeOpacity={0.7}
                      style={styles.starTouch}
                      testID={`star-rating-${star}`}
                    >
                      <Ionicons
                        name={star <= rating ? "star" : "star-outline"}
                        size={34}
                        color={star <= rating ? "#F59E0B" : "rgba(255,255,255,0.35)"}
                      />
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Feedback Textarea */}
                <TextInput
                  style={styles.feedbackInput}
                  placeholder="Share comments or feedback (optional)..."
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  multiline
                  numberOfLines={3}
                  value={comment}
                  onChangeText={setComment}
                  maxLength={300}
                  testID="feedback-input"
                />

                {/* Submit & Skip Actions */}
                <View style={styles.modalActionRow}>
                  <TouchableOpacity
                    onPress={skipFeedback}
                    style={styles.skipBtn}
                    disabled={submittingFeedback}
                    testID="feedback-skip-btn"
                  >
                    <Text style={styles.skipBtnText}>Skip</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={submitFeedback}
                    disabled={rating === 0 || submittingFeedback}
                    style={[
                      styles.submitBtn,
                      (rating === 0 || submittingFeedback) && styles.submitBtnDisabled,
                    ]}
                    testID="feedback-submit-btn"
                  >
                    {submittingFeedback ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.submitBtnText}>Submit Feedback</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </KeyboardAvoidingView>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 20 },
  status: { color: "#93C5FD", fontFamily: "Manrope_700Bold", fontSize: 12, letterSpacing: 1.5 },
  timerText: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 22, marginTop: 4 },
  topBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  avatarRing: { padding: 8, borderRadius: 999, borderWidth: 2, borderColor: "rgba(147,197,253,0.4)" },
  avatar: { width: 180, height: 180, borderRadius: 999, borderWidth: 3, borderColor: "#fff" },
  name: { color: "#fff", fontFamily: "Outfit_700Bold", fontSize: 30, marginTop: 22 },
  meta: { color: "rgba(255,255,255,0.7)", marginTop: 6, fontFamily: "Manrope_500Medium" },
  waves: { flexDirection: "row", alignItems: "center", gap: 5, height: 60, marginTop: 30 },
  wave: { width: 5, height: 40, borderRadius: 999, backgroundColor: "#3B82F6" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 30, paddingBottom: 30 },
  ctrl: {
    width: 60,
    height: 60,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  ctrlActive: { backgroundColor: "#fff" },
  endBtn: {
    width: 78,
    height: 78,
    borderRadius: 999,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
    ...shadow.strong,
  },
  // Modal Overlay Styles
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
  },
  modalContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#1E293B",
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    ...shadow.strong,
  },
  feedbackTitle: {
    color: "#fff",
    fontFamily: "Outfit_700Bold",
    fontSize: 24,
    textAlign: "center",
  },
  feedbackSubtitle: {
    color: "rgba(255, 255, 255, 0.7)",
    fontFamily: "Manrope_500Medium",
    fontSize: 14,
    marginTop: 6,
    textAlign: "center",
  },
  feedbackAvatarRing: {
    marginVertical: 16,
    padding: 4,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#3B82F6",
  },
  feedbackAvatar: {
    width: 76,
    height: 76,
    borderRadius: 999,
  },
  starRow: {
    flexDirection: "row",
    gap: 8,
    marginVertical: 12,
  },
  starTouch: {
    padding: 4,
  },
  feedbackInput: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.07)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    padding: 12,
    color: "#fff",
    fontFamily: "Manrope_400Regular",
    fontSize: 14,
    height: 80,
    textAlignVertical: "top",
    marginTop: 8,
    marginBottom: 20,
  },
  modalActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    gap: 12,
  },
  skipBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  skipBtnText: {
    color: "rgba(255, 255, 255, 0.8)",
    fontFamily: "Manrope_600SemiBold",
    fontSize: 15,
  },
  submitBtn: {
    flex: 2,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#3B82F6",
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: "#fff",
    fontFamily: "Manrope_700Bold",
    fontSize: 15,
  },
});
