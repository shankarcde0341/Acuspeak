import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, PermissionsAndroid, Alert, Modal } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";

import { api, RoomParticipant } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { colors, gradients, radii, shadow, typography } from "@/src/theme";
import { Avatar, ScreenHeader } from "@/src/components/ui";

interface ParticipantVideoProps {
  streamId: string;
  isLocal: boolean;
  webStream?: any;
  zegoEngine?: any;
  size: number;
  fallbackAvatar?: { uri?: string; name: string };
}

function ParticipantVideoView({ streamId, isLocal, webStream, zegoEngine, size, fallbackAvatar }: ParticipantVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasLiveVideoTrack, setHasLiveVideoTrack] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web" && webStream) {
      const updateTrackState = () => {
        const vTracks = webStream.getVideoTracks ? webStream.getVideoTracks() : [];
        const active = vTracks.length > 0 && vTracks.some((t: any) => t.enabled && t.readyState === "live" && !t.muted);
        setHasLiveVideoTrack(active);
      };
      updateTrackState();
      if (webStream.getVideoTracks) {
        const tracks = webStream.getVideoTracks();
        tracks.forEach((t: any) => {
          t.onmute = updateTrackState;
          t.onunmute = updateTrackState;
          t.onended = updateTrackState;
        });
      }
      if (webStream.addEventListener) {
        webStream.addEventListener("addtrack", updateTrackState);
        webStream.addEventListener("removetrack", updateTrackState);
      }
      if (videoRef.current) {
        videoRef.current.srcObject = webStream;
        videoRef.current.play().catch((err: any) => console.warn("[Zego Web] Video play warning:", err));
      }
      return () => {
        if (webStream.removeEventListener) {
          webStream.removeEventListener("addtrack", updateTrackState);
          webStream.removeEventListener("removetrack", updateTrackState);
        }
      };
    } else {
      setHasLiveVideoTrack(false);
    }
  }, [webStream]);

  if (Platform.OS === "web") {
    if (!hasLiveVideoTrack) {
      return (
        <Avatar uri={fallbackAvatar?.uri} name={fallbackAvatar?.name || "User"} size={size} isPremium={false} />
      );
    }
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: "#000" }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </View>
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ZegoModule = require("zego-express-engine-reactnative");
    const { findNodeHandle } = require("react-native");
    const ZegoTextureView = ZegoModule.ZegoTextureView;
    if (!ZegoTextureView) return <Avatar uri={fallbackAvatar?.uri} name={fallbackAvatar?.name || "User"} size={size} isPremium={false} />;

    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: "#000" }}>
        <ZegoTextureView
          style={{ width: "100%", height: "100%" }}
          ref={(ref: any) => {
            if (ref && zegoEngine) {
              const tag = findNodeHandle(ref);
              if (tag) {
                if (isLocal) {
                  try { zegoEngine.startPreview({ reactTag: tag, viewMode: 1, backgroundColor: 0 }); } catch { }
                } else {
                  try { zegoEngine.startPlayingStream(streamId, { reactTag: tag, viewMode: 1, backgroundColor: 0 }); } catch { }
                }
              }
            }
          }}
        />
      </View>
    );
  } catch {
    return <Avatar uri={fallbackAvatar?.uri} name={fallbackAvatar?.name || "User"} size={size} isPremium={false} />;
  }
}

export default function Room() {
  const { id, title, topic, host, avatar, password } = useLocalSearchParams<{ id: string; title: string; topic: string; host: string; avatar: string; password?: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [handUp, setHandUp] = useState(false);
  const [muted, setMuted] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [hostName, setHostName] = useState<string>(host || "Host");
  const [hostAvatar, setHostAvatar] = useState<string>(avatar || "");
  const [hostId, setHostId] = useState<string>("");
  const [isHost, setIsHost] = useState<boolean>(false);
  const [roomEnded, setRoomEnded] = useState<boolean>(false);
  const [removedByHost, setRemovedByHost] = useState<boolean>(false);

  const [remoteVideoStreams, setRemoteVideoStreams] = useState<{ [streamId: string]: boolean }>({});
  const [remoteMediaStreams, setRemoteMediaStreams] = useState<{ [streamId: string]: any }>({});

  const zegoRef = useRef<any>(null);
  const zegoWebLocalStreamRef = useRef<any>(null);
  const zegoInitStarted = useRef(false);
  const zegoTornDown = useRef(false);
  const zegoStreamId = useRef<string | null>(null);
  const zegoRoomId = useRef<string | null>(null);
  const hasCameraPermission = useRef<boolean>(false);

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

  // Request native Android audio recording permission
  const requestAndroidPermission = async () => {
    if (Platform.OS !== "android") return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: "Microphone Permission",
          message: "Acuspeak needs access to your microphone for voice live rooms.",
          buttonNeutral: "Ask Me Later",
          buttonNegative: "Cancel",
          buttonPositive: "OK",
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn("[Zego] Audio permission request error:", err);
      return false;
    }
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

  // Initial Join call
  useEffect(() => {
    (async () => {
      try {
        if (id) {
          const res = await api.joinRoom(String(id), password);
          if (res && res.room) {
            setHostName(res.room.host_name || host || "Host");
            setHostAvatar(res.room.host_avatar || avatar || "");
            if (res.room.host_id) setHostId(res.room.host_id);
            if (res.room.participants) setParticipants(res.room.participants);
            if (res.room.host_id && user && user.user_id === res.room.host_id) {
              setIsHost(true);
            }
          }
        }
      } catch { /* ignore */ }
    })();
  }, [id, password, host, avatar, user]);

  // Periodic room status & participants polling
  useEffect(() => {
    let timer: any = null;
    const checkRoom = async () => {
      if (!id) return;
      try {
        const res = await api.getRoom(String(id));
        if (res && res.room) {
          if (res.room.status === "inactive") {
            setRoomEnded(true);
            return;
          }
          if ((res.room as any).removed_users && user && (res.room as any).removed_users.includes(user.user_id)) {
            setRemovedByHost(true);
            return;
          }
          if (res.room.host_name) setHostName(res.room.host_name);
          if (res.room.host_avatar) setHostAvatar(res.room.host_avatar);
          if (res.room.host_id) {
            setHostId(res.room.host_id);
            if (user && user.user_id === res.room.host_id) setIsHost(true);
          }
          // If host is no longer in participants list and current user is a listener, end room
          if (res.room.host_id && res.room.participants) {
            const hasHostInParticipants = res.room.participants.some((p: any) => p.user_id === res.room.host_id);
            if (!hasHostInParticipants && res.room.host_id !== user?.user_id) {
              console.log("[Room] Host left participants list. Ending room for listeners.");
              setRoomEnded(true);
              return;
            }
          }
          if (res.room.participants) {
            setParticipants(res.room.participants);
          }
        } else {
          setRoomEnded(true);
        }
      } catch { /* ignore */ }
    };

    checkRoom();
    timer = setInterval(checkRoom, 1000);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [id, user]);

  // Cleanup on component unmount
  const isHostRef = useRef(isHost);
  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  useEffect(() => {
    return () => {
      if (id) {
        if (isHostRef.current) {
          api.endRoom(String(id)).catch(() => {});
        } else {
          api.leaveRoom(String(id)).catch(() => {});
        }
      }
    };
  }, [id]);

  // Handle browser tab close or unload for Host
  useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const handleUnload = () => {
        if (isHostRef.current && id) {
          try {
            const baseUrl = process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:8000";
            if (navigator.sendBeacon) {
              navigator.sendBeacon(`${baseUrl}/api/rooms/${id}/end`);
            }
          } catch { /* ignore */ }
        }
      };
      window.addEventListener("beforeunload", handleUnload);
      window.addEventListener("pagehide", handleUnload);
      return () => {
        window.removeEventListener("beforeunload", handleUnload);
        window.removeEventListener("pagehide", handleUnload);
      };
    }
  }, [id]);

  // Handle room ended notification for listeners
  useEffect(() => {
    if (roomEnded) {
      teardownZego().catch(() => { });
      Alert.alert("Room Ended", "The host has ended this live room.", [
        { text: "OK", onPress: () => router.replace("/(tabs)/live") },
      ]);
    }
  }, [roomEnded]);

  // Handle user removed by host notification: immediately terminate call and show pop-up message
  useEffect(() => {
    if (removedByHost) {
      teardownZego().catch(() => { });
      Alert.alert("", "You have been removed from the room !", [
        {
          text: "OK",
          onPress: () => router.replace("/(tabs)/live"),
        },
      ]);
    }
  }, [removedByHost]);

  // Initialize Zego RTC Voice/Video Engine
  useEffect(() => {
    if (zegoInitStarted.current) return;
    zegoInitStarted.current = true;
    let cancelled = false;

    (async () => {
      try {
        const hasAudioPermission = await requestAndroidPermission();
        if (!hasAudioPermission && Platform.OS === "android") {
          console.warn("[Zego] Microphone permission denied for live room.");
        }

        const rid = String(id || "");
        if (!rid) return;

        const tokenRes: any = await api.getZegoToken(rid);
        if (cancelled) return;

        const appId = Number(process.env.EXPO_PUBLIC_ZEGO_APP_ID || tokenRes?.app_id || 1166884706);
        const currentUserId = tokenRes.user_id || user?.user_id || `user_${Date.now()}`;
        const streamId = `${currentUserId}_stream`;
        zegoStreamId.current = streamId;
        zegoRoomId.current = tokenRes.room_id || rid;

        if (Platform.OS === "web") {
          console.log("[Zego Web] Initializing Zego WebRTC Express Engine for Room:", rid);
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const ZegoWebModule = require("zego-express-engine-webrtc");
          const ZegoExpressEngineWeb = ZegoWebModule.ZegoExpressEngine || ZegoWebModule.default || ZegoWebModule;
          const server = `wss://webim-${appId}-api.zego.im/ws`;

          const zgWeb = new ZegoExpressEngineWeb(appId, server);
          zegoRef.current = zgWeb;

          zgWeb.on("remoteCameraStateUpdate", (streamID: string, state: string) => {
            console.log("[Zego Web] remoteCameraStateUpdate:", streamID, state);
            const isOpen = state === "OPEN" || state === "ENABLE" || state === "0";
            setRemoteVideoStreams((prev) => ({ ...prev, [streamID]: isOpen }));
          });

          zgWeb.on("roomUserUpdate", (_roomID: string, updateType: string, userList: any[]) => {
            console.log("[Zego Web] roomUserUpdate:", updateType, userList);
            if (updateType === "DELETE" && hostId) {
              const hostLeft = userList.some((u: any) => u.userID === hostId || u.userID === String(hostId));
              if (hostLeft) {
                console.log("[Zego Web] Host left room. Ending room for all participants.");
                setRoomEnded(true);
              }
            }
          });

          zgWeb.on("roomStreamUpdate", async (_roomID: string, updateType: string, streamList: any[]) => {
            console.log("[Zego Web] roomStreamUpdate:", updateType, streamList);
            if (updateType === "ADD") {
              for (const streamItem of streamList) {
                try {
                  console.log("[Zego Web] Subscribing to stream:", streamItem.streamID);
                  const remoteStream = await zgWeb.startPlayingStream(streamItem.streamID);
                  setRemoteMediaStreams((prev) => ({ ...prev, [streamItem.streamID]: remoteStream }));

                  const checkVideoState = () => {
                    const vTracks = remoteStream.getVideoTracks ? remoteStream.getVideoTracks() : [];
                    const hasVideo = vTracks.length > 0 && vTracks.some((t: any) => t.enabled && t.readyState === "live" && !t.muted);
                    setRemoteVideoStreams((prev) => ({ ...prev, [streamItem.streamID]: Boolean(hasVideo) }));
                  };

                  checkVideoState();

                  if (remoteStream.getVideoTracks) {
                    remoteStream.getVideoTracks().forEach((track: any) => {
                      track.onmute = checkVideoState;
                      track.onunmute = checkVideoState;
                      track.onended = checkVideoState;
                    });
                  }
                  if (remoteStream.addEventListener) {
                    remoteStream.addEventListener("addtrack", checkVideoState);
                    remoteStream.addEventListener("removetrack", checkVideoState);
                  }

                  let el = document.getElementById(`zego-media-${streamItem.streamID}`) as HTMLMediaElement;
                  if (!el) {
                    el = document.createElement("video") as HTMLMediaElement;
                    el.id = `zego-media-${streamItem.streamID}`;
                    el.autoplay = true;
                    el.setAttribute("playsinline", "true");
                    el.setAttribute("webkit-playsinline", "true");
                    (el as any).playsInline = true;
                    el.volume = 1.0;
                    el.muted = false;
                    el.style.display = "none";
                    document.body.appendChild(el);
                  }
                  el.srcObject = remoteStream;
                  const playPromise = el.play();
                  if (playPromise !== undefined) {
                    playPromise.catch((err: any) => {
                      console.warn("[Zego Web] Remote audio/video play error:", err);
                    });
                  }
                } catch (err) {
                  console.warn("[Zego Web] startPlayingStream error:", err);
                }
              }
            } else if (updateType === "DELETE") {
              for (const streamItem of streamList) {
                try {
                  if (hostId && (streamItem.streamID === `${hostId}_stream` || (streamItem.user && streamItem.user.userID === hostId))) {
                    console.log("[Zego Web] Host stream deleted. Ending room session for all participants.");
                    setRoomEnded(true);
                  }
                  zgWeb.stopPlayingStream(streamItem.streamID);
                  setRemoteMediaStreams((prev) => {
                    const next = { ...prev };
                    delete next[streamItem.streamID];
                    return next;
                  });
                  setRemoteVideoStreams((prev) => {
                    const next = { ...prev };
                    delete next[streamItem.streamID];
                    return next;
                  });
                  const el = document.getElementById(`zego-media-${streamItem.streamID}`);
                  if (el) el.remove();
                } catch { /* ignore */ }
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

          console.log("[Zego Web] Creating local WebRTC media stream...");
          const localStream = await zgWeb.createStream({
            camera: { audio: true, video: videoEnabled },
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

          try {
            engine.off("roomStreamUpdate");
            engine.off("remoteCameraStateUpdate");
          } catch { /* ignore */ }

          engine.on("remoteCameraStateUpdate", (streamID: string, state: number) => {
            console.log("[Zego Native] remoteCameraStateUpdate", { streamID, state });
            setRemoteVideoStreams((prev) => ({ ...prev, [streamID]: state === 0 }));
          });

          engine.on("roomUserUpdate", (_rid: string, updateType: number, userList: any[]) => {
            if (updateType === ZegoUpdateType.Delete && hostId) {
              const hostLeft = userList.some((u: any) => u.userID === hostId || u.userID === String(hostId));
              if (hostLeft) {
                console.log("[Zego Native] Host left room. Ending room for all participants.");
                setRoomEnded(true);
              }
            }
          });

          engine.on("roomStreamUpdate", (_rid: string, updateType: number, streamList: any[]) => {
            console.log("[Zego Native] roomStreamUpdate", { updateType, streamList });
            streamList.forEach((s) => {
              if (updateType === ZegoUpdateType.Add) {
                console.log("[Zego Native] Subscribing to stream:", s.streamID);
                engine.startPlayingStream(s.streamID);
              } else {
                if (hostId && (s.streamID === `${hostId}_stream` || (s.user && s.user.userID === hostId))) {
                  console.log("[Zego Native] Host stream deleted. Ending room session for all participants.");
                  setRoomEnded(true);
                }
                console.log("[Zego Native] Stopping stream:", s.streamID);
                engine.stopPlayingStream(s.streamID);
                setRemoteVideoStreams((prev) => {
                  const next = { ...prev };
                  delete next[s.streamID];
                  return next;
                });
              }
            });
          });

          await engine.loginRoom(
            zegoRoomId.current,
            { userID: String(currentUserId), userName: String(user?.name || currentUserId) },
            { token: tokenRes.token, userUpdate: true }
          );

          if (cancelled) {
            await teardownZego();
            return;
          }

          await engine.startPublishingStream(streamId);

          if (cancelled) {
            await teardownZego();
            return;
          }

          engine.muteMicrophone(muted);
        }
      } catch (e: any) {
        console.warn("[Zego] Engine init error:", e?.message || e);
      }
    })();

    return () => {
      cancelled = true;
      teardownZego().catch(() => { });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const teardownZego = async () => {
    if (zegoTornDown.current) return;
    zegoTornDown.current = true;
    const engine = zegoRef.current;
    if (!engine) return;

    try {
      if (Platform.OS === "web") {
        console.log("[Zego Web] Tearing down WebRTC engine...");
        if (zegoStreamId.current) {
          try { engine.stopPublishingStream(zegoStreamId.current); } catch { }
        }
        if (zegoWebLocalStreamRef.current) {
          try { engine.destroyStream(zegoWebLocalStreamRef.current); } catch { }
          zegoWebLocalStreamRef.current = null;
        }
        if (zegoRoomId.current) {
          try { engine.logoutRoom(zegoRoomId.current); } catch { }
        }
      } else {
        try {
          engine.off("roomStreamUpdate");
        } catch { /* ignore */ }

        if (zegoStreamId.current) {
          await engine.stopPublishingStream();
        }
        if (zegoRoomId.current) {
          await engine.logoutRoom(zegoRoomId.current);
        }
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const ZegoModule = require("zego-express-engine-reactnative");
        const ZegoExpressEngine = ZegoModule.default || ZegoModule.ZegoExpressEngine || ZegoModule;
        await ZegoExpressEngine.destroyEngine();
      }
    } catch (e: any) {
      console.warn("[Zego] Teardown warning:", e?.message || e);
    } finally {
      zegoRef.current = null;
      zegoStreamId.current = null;
      zegoRoomId.current = null;
      setRemoteVideoStreams({});
      setRemoteMediaStreams({});
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

  const toggleVideo = async () => {
    resumeAllRemoteMedia();
    if (!videoEnabled) {
      if (!hasCameraPermission.current) {
        if (Platform.OS === "android") {
          try {
            const granted = await PermissionsAndroid.request(
              PermissionsAndroid.PERMISSIONS.CAMERA,
              {
                title: "Camera Permission",
                message: "Acuspeak needs camera access for video live rooms.",
                buttonPositive: "OK",
              }
            );
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
              setCameraError("Camera permission denied. Enable camera in device settings.");
              return;
            }
          } catch {
            setCameraError("Failed to request camera permission");
            return;
          }
        } else if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.mediaDevices) {
          try {
            await navigator.mediaDevices.getUserMedia({ video: true });
          } catch {
            setCameraError("Camera permission denied in browser.");
            return;
          }
        }
        hasCameraPermission.current = true;
      }
      setCameraError("");
      setVideoEnabled(true);
      if (Platform.OS === "web") {
        try {
          const localStream = zegoWebLocalStreamRef.current;
          if (localStream && zegoRef.current) {
            const vStream = await navigator.mediaDevices.getUserMedia({ video: true });
            const vTrack = vStream.getVideoTracks()[0];
            if (vTrack) {
              localStream.addTrack(vTrack);
              zegoRef.current.mutePublishStreamVideo(localStream, false);
              console.log("[Zego Web] Video track added to WebRTC stream");
            }
          }
        } catch (err: any) {
          console.warn("[Zego Web] Video enable error:", err);
          setCameraError("Camera permission denied in browser.");
        }
      } else {
        try {
          zegoRef.current?.enableCamera(true);
          zegoRef.current?.startPreview();
        } catch {
          /* ignore */
        }
      }
    } else {
      setVideoEnabled(false);
      if (Platform.OS === "web") {
        const localStream = zegoWebLocalStreamRef.current;
        if (localStream) {
          localStream.getVideoTracks().forEach((t: any) => {
            t.enabled = false;
            t.stop();
            localStream.removeTrack(t);
          });
          if (zegoRef.current) {
            try { zegoRef.current.mutePublishStreamVideo(localStream, true); } catch { }
          }
        }
      } else {
        try {
          zegoRef.current?.enableCamera(false);
          zegoRef.current?.stopPreview();
        } catch {
          /* ignore */
        }
      }
    }
  };

  const handleLeave = async () => {
    if (id) {
      try {
        if (isHost) {
          await api.endRoom(String(id));
        } else {
          await api.leaveRoom(String(id));
        }
      } catch {
        /* ignore */
      }
    }
    await teardownZego();
    router.replace("/(tabs)/live");
  };

  const handleRemoveListener = (listener: RoomParticipant) => {
    Alert.alert(
      "Remove Participant",
      `Are you sure you want to remove ${listener.name} from the room?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "OK",
          style: "destructive",
          onPress: async () => {
            try {
              if (id && listener.user_id) {
                await api.removeParticipant(String(id), listener.user_id);
                setParticipants((prev) => prev.filter((p) => p.user_id !== listener.user_id));
              }
            } catch (e: any) {
              Alert.alert("Error", e.message || "Failed to remove participant");
            }
          },
        },
      ]
    );
  };

  const pulse = useSharedValue(0);
  useEffect(() => { pulse.value = withRepeat(withTiming(1, { duration: 1400 }), -1, true); }, [pulse]);
  const speakerPulse = useAnimatedStyle(() => ({ opacity: 0.3 + pulse.value * 0.7, transform: [{ scale: 1 + pulse.value * 0.06 }] }));

  // Real listeners filter out host
  const listenersList = participants.filter((p) => p.user_id !== hostId);

  return (
    <View style={styles.root} testID="room-screen">
      <LinearGradient colors={gradients.premium} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
        <ScreenHeader title={String(topic || "Live Room")} showBack onBack={handleLeave} right={
          <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View>
        } />

        <View style={styles.header}>
          <Text style={styles.roomTitle}>{title}</Text>
          <Text style={styles.roomMeta}>Hosted by {hostName}</Text>
          {cameraError ? (
            <View style={styles.cameraErrorBox} testID="camera-error">
              <Ionicons name="warning" size={14} color="#EF4444" />
              <Text style={styles.cameraErrorText}>{cameraError}</Text>
            </View>
          ) : null}
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 20 }}>
          <Text style={styles.sectionLabel}>Speakers</Text>
          <View style={styles.speakers}>
            <Animated.View style={[styles.speakerRing, speakerPulse]} />
            {(() => {
              const hostStreamId = hostId ? `${hostId}_stream` : "";
              const isHostLocal = Boolean(user && user.user_id && hostId && user.user_id === hostId);
              const isHostVideoActive = isHostLocal ? videoEnabled : Boolean(hostStreamId && remoteVideoStreams[hostStreamId]);
              const hostWebStream = isHostLocal ? zegoWebLocalStreamRef.current : (hostStreamId ? remoteMediaStreams[hostStreamId] : null);

              return (
                <View style={styles.speaker}>
                  {isHostVideoActive ? (
                    <ParticipantVideoView
                      streamId={hostStreamId}
                      isLocal={isHostLocal}
                      webStream={hostWebStream}
                      zegoEngine={zegoRef.current}
                      size={100}
                      fallbackAvatar={{ uri: hostAvatar, name: hostName }}
                    />
                  ) : (
                    <Avatar uri={hostAvatar} name={hostName} size={100} isPremium={false} />
                  )}
                  <Text style={styles.speakerName}>{hostName}</Text>
                  <View style={styles.hostChip}><Text style={styles.hostChipText}>HOST</Text></View>
                </View>
              );
            })()}
          </View>

          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Listeners ({listenersList.length})</Text>
          <View style={styles.listeners}>
            {listenersList.map((l, i) => {
              const listenerStreamId = l.user_id ? `${l.user_id}_stream` : "";
              const isListenerLocal = Boolean(user && user.user_id && l.user_id && user.user_id === l.user_id);
              const isListenerVideoActive = isListenerLocal ? videoEnabled : Boolean(listenerStreamId && remoteVideoStreams[listenerStreamId]);
              const listenerWebStream = isListenerLocal ? zegoWebLocalStreamRef.current : (listenerStreamId ? remoteMediaStreams[listenerStreamId] : null);

              return (
                <Animated.View key={l.user_id || i} entering={FadeInDown.delay(60 + i * 40).duration(400)} style={{ alignItems: "center", width: "22%", position: "relative" }}>
                  {isHost ? (
                    <TouchableOpacity
                      onPress={() => handleRemoveListener(l)}
                      style={styles.removeBadge}
                      testID={`remove-listener-${l.user_id}`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="remove-circle" size={22} color="#EF4444" />
                    </TouchableOpacity>
                  ) : null}
                  {isListenerVideoActive ? (
                    <ParticipantVideoView
                      streamId={listenerStreamId}
                      isLocal={isListenerLocal}
                      webStream={listenerWebStream}
                      zegoEngine={zegoRef.current}
                      size={60}
                      fallbackAvatar={{ uri: l.avatar, name: l.name }}
                    />
                  ) : (
                    <Avatar uri={l.avatar} name={l.name} size={60} isPremium={false} />
                  )}
                  <Text style={styles.listenerName} numberOfLines={1}>{l.name}</Text>
                </Animated.View>
              );
            })}
            {listenersList.length === 0 ? (
              <Text style={styles.noListenersText}>No other listeners in the room yet.</Text>
            ) : null}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity onPress={() => setHandUp(!handUp)} style={[styles.footBtn, handUp && styles.footBtnActive]} testID="room-hand">
            <Ionicons name="hand-right" size={20} color={handUp ? "#fff" : colors.gold} />
            <Text style={[styles.footBtnText, handUp && { color: "#fff" }]}>{handUp ? "Hand raised" : "Raise hand"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleMute} style={[styles.footBtn, !muted && styles.footBtnActive]} testID="room-mute">
            <Ionicons name={muted ? "mic-off" : "mic"} size={20} color={muted ? "#EF4444" : "#fff"} />
            <Text style={[styles.footBtnText, !muted && { color: "#fff" }]}>{muted ? "Unmute" : "Mute"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={toggleVideo} style={[styles.footBtn, videoEnabled && styles.footBtnActive]} testID="room-video">
            <Ionicons name={videoEnabled ? "videocam" : "videocam-off"} size={20} color={videoEnabled ? "#fff" : colors.primaryLight} />
            <Text style={[styles.footBtnText, videoEnabled && { color: "#fff" }]}>{videoEnabled ? "Cam On" : "Cam Off"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLeave} style={[styles.footBtn, { backgroundColor: "#EF4444" }]} testID="room-leave">
            <Ionicons name="exit" size={20} color="#fff" />
            <Text style={[styles.footBtnText, { color: "#fff" }]}>{isHost ? "End Room" : "Leave"}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Removal Notification Modal */}
      <Modal visible={removedByHost} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.removedModalContent} testID="removed-from-room-modal">
            <View style={styles.removedHeaderIcon}>
              <Ionicons name="alert-circle" size={54} color="#EF4444" />
            </View>
            <Text style={styles.removedModalTitle}>You have been removed from the room !</Text>
            <TouchableOpacity
              style={styles.removedOkBtn}
              onPress={() => {
                teardownZego().catch(() => {});
                router.replace("/(tabs)/live");
              }}
              testID="removed-ok-btn"
            >
              <Text style={styles.removedOkBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  cameraErrorBox: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(239,68,68,0.15)", padding: 8, borderRadius: radii.sm, marginTop: 8 },
  cameraErrorText: { color: "#EF4444", fontFamily: "Manrope_600SemiBold", fontSize: 12 },
  sectionLabel: { color: "rgba(255,255,255,0.75)", fontFamily: "Manrope_700Bold", fontSize: 12, letterSpacing: 1.5, marginBottom: 12 },
  speakers: { alignItems: "center", position: "relative" },
  speakerRing: { position: "absolute", width: 100, height: 100, borderRadius: 999, backgroundColor: "rgba(147,197,253,0.35)", top: 10 },
  speaker: { alignItems: "center" },
  speakerName: { color: "#fff", fontFamily: "Outfit_700Bold", marginTop: 10 },
  hostChip: { marginTop: 4, backgroundColor: "rgba(245,158,11,0.2)", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, borderWidth: 1, borderColor: "#F59E0B" },
  hostChipText: { color: "#F59E0B", fontFamily: "Manrope_700Bold", fontSize: 9, letterSpacing: 1 },
  listeners: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "flex-start" },
  listenerName: { color: "rgba(255,255,255,0.8)", marginTop: 6, fontSize: 12, fontFamily: "Manrope_500Medium" },
  noListenersText: { color: "rgba(255,255,255,0.5)", fontFamily: "Manrope_500Medium", fontSize: 13, fontStyle: "italic" },
  footer: { flexDirection: "row", justifyContent: "space-between", gap: 8, padding: 16, paddingBottom: 20 },
  footBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: radii.lg, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)", gap: 4 },
  footBtnActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  footBtnText: { color: "rgba(255,255,255,0.9)", fontFamily: "Manrope_700Bold", fontSize: 11 },
  removeBadge: {
    position: "absolute",
    top: -4,
    right: 4,
    zIndex: 10,
    backgroundColor: "#fff",
    borderRadius: 999,
    ...shadow.soft,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", alignItems: "center", padding: 24 },
  removedModalContent: { width: "100%", backgroundColor: "#fff", borderRadius: radii.xl, padding: 24, alignItems: "center", ...shadow.strong },
  removedHeaderIcon: { marginBottom: 12 },
  removedModalTitle: { ...typography.h2, fontSize: 18, color: colors.textPrimary, textAlign: "center", marginVertical: 8 },
  removedOkBtn: { marginTop: 18, width: "100%", backgroundColor: colors.primary, paddingVertical: 14, borderRadius: radii.lg, alignItems: "center", justifyContent: "center" },
  removedOkBtnText: { color: "#fff", fontFamily: "Manrope_700Bold", fontSize: 15 },
});
