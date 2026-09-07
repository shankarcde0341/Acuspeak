import { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Image, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api/client";
import { colors, radii, shadow, typography } from "@/src/theme";
import { Avatar, ScreenHeader } from "@/src/components/ui";

export default function Friends() {
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => { try { const d = await api.friendRequests(); setRows(d.requests || []); } catch { /* ignore */ } setLoading(false); })();
  }, []);

  return (
    <View style={styles.root} testID="friends-screen">
      <LinearGradient colors={["#EFF6FF", colors.bg]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader title="Friend Requests" showBack onBack={() => router.back()} />
        {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> :
          rows.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="person-add" size={44} color={colors.textMuted} />
              <Text style={styles.emptyText}>No friend requests yet</Text>
              <Text style={styles.emptySub}>Start a match, tap the + on partners you enjoy talking to!</Text>
            </View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(r) => r.request_id}
              contentContainerStyle={{ padding: 20, paddingBottom: 160 }}
              renderItem={({ item }) => (
                <View style={styles.row} testID={`friend-req-${item.request_id}`}>
                  <Avatar uri={item.to_avatar} name={item.to_name} size={46} isPremium={Boolean(item.is_premium)} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.to_name}</Text>
                    <Text style={styles.meta}>Request sent · {new Date(item.created_at).toLocaleDateString()}</Text>
                  </View>
                  <View style={styles.statusBadge}><Text style={styles.statusText}>Sent</Text></View>
                </View>
              )}
            />
          )
        }
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 30 },
  emptyText: { ...typography.h3, marginTop: 8 },
  emptySub: { ...typography.body, color: colors.textSecondary, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: "#fff", borderRadius: radii.lg, marginBottom: 10, ...shadow.soft },
  avatar: { width: 46, height: 46, borderRadius: 999 },
  name: { ...typography.h3, fontSize: 15 },
  meta: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#DBEAFE" },
  statusText: { color: colors.primary, fontFamily: "Manrope_700Bold", fontSize: 11 },
});
