import { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, Image, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { api } from "@/src/api/client";
import { colors, radii, shadow, typography } from "@/src/theme";
import { Avatar, ScreenHeader } from "@/src/components/ui";

export default function CallHistory() {
  const router = useRouter();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => { try { const d = await api.callHistory(); setRows(d.calls || []); } catch { /* ignore */ } setLoading(false); })();
  }, []);

  return (
    <View style={styles.root} testID="call-history-screen">
      <LinearGradient colors={["#EFF6FF", colors.bg]} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        <ScreenHeader title="Call History" showBack onBack={() => router.back()} />
        {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} /> :
          rows.length === 0 ? (
            <View style={styles.empty}><Ionicons name="call" size={44} color={colors.textMuted} /><Text style={styles.emptyText}>No calls yet. Start matching!</Text></View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(r) => r.call_id}
              contentContainerStyle={{ padding: 20, paddingBottom: 160 }}
              renderItem={({ item }) => (
                <View style={styles.row} testID={`call-row-${item.call_id}`}>
                  <Avatar uri={item.partner_avatar} name={item.partner_name} size={46} isPremium={Boolean(item.is_premium)} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.partner_name}</Text>
                    <Text style={styles.meta}>{new Date(item.created_at).toLocaleDateString()} · {Math.floor(item.duration_seconds / 60)}m {item.duration_seconds % 60}s</Text>
                  </View>
                  <Ionicons name="call" size={18} color={colors.accent} />
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
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { ...typography.body, color: colors.textSecondary },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: "#fff", borderRadius: radii.lg, marginBottom: 10, ...shadow.soft },
  avatar: { width: 46, height: 46, borderRadius: 999 },
  name: { ...typography.h3, fontSize: 15 },
  meta: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
});
