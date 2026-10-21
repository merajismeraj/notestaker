import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtClock, PALETTE, uid, type Meeting } from "@core/types";
import { PLANS } from "@core/plans";
import { AccountSheet } from "@/components/AccountSheet";
import { Button, Card, Muted } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { listMeetings, saveMeeting } from "@/lib/store";
import { useTheme } from "@/lib/theme";

export default function Home() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [showAccount, setShowAccount] = useState(false);
  const { account, refresh } = useAccount();

  useFocusEffect(
    useCallback(() => {
      listMeetings().then(setMeetings);
      void refresh(); // usage may have changed in a meeting
    }, [refresh]),
  );

  const create = async () => {
    const now = new Date();
    const m: Meeting = {
      id: uid(),
      title: `Meeting ${now.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`,
      createdAt: now.getTime(),
      durationSec: 0,
      lang: Intl.DateTimeFormat().resolvedOptions().locale || "en-US",
      participants: [
        { id: uid(), name: "Speaker 1", color: PALETTE[0] },
        { id: uid(), name: "Speaker 2", color: PALETTE[1] },
      ],
      segments: [],
    };
    await saveMeeting(m);
    router.push({ pathname: "/m/[id]", params: { id: m.id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          headerRight: () =>
            account ? (
              <Pressable
                onPress={() => setShowAccount(true)}
                accessibilityRole="button"
                accessibilityLabel="Account"
                hitSlop={8}
              >
                <Text style={{ color: t.accent, fontWeight: "700" }}>
                  {PLANS[account.plan].name}
                  {account.trialEndsAt ? " trial" : ""}
                </Text>
              </Pressable>
            ) : null,
        }}
      />
      <AccountSheet visible={showAccount} onClose={() => setShowAccount(false)} />
      <FlatList
        data={meetings ?? []}
        keyExtractor={(m) => m.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 + insets.bottom }}
        ListEmptyComponent={
          meetings ? (
            <View style={{ alignItems: "center", paddingVertical: 48, paddingHorizontal: 16 }}>
              <Text style={{ fontSize: 48 }}>🎙️</Text>
              <Text style={{ color: t.text, fontSize: 20, fontWeight: "700", marginVertical: 8 }}>
                Record your first meeting
              </Text>
              <Muted style={{ textAlign: "center" }}>
                Transcript with speakers, then AI minutes with action items for each person.
              </Muted>
            </View>
          ) : undefined
        }
        renderItem={({ item: m }) => {
          const items = m.minutes?.action_items.length ?? 0;
          const open = items - (m.done?.length ?? 0);
          return (
            <Pressable onPress={() => router.push({ pathname: "/m/[id]", params: { id: m.id } })}>
              <Card>
                <Text style={{ color: t.text, fontSize: 16, fontWeight: "700" }}>{m.minutes?.title || m.title}</Text>
                <Muted style={{ marginTop: 2 }}>
                  {new Date(m.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  {" · "}
                  {fmtClock(m.durationSec)} · {m.participants.length} speakers
                </Muted>
                <Text style={{ color: m.minutes ? t.text : t.muted, fontSize: 14, marginTop: 6 }}>
                  {m.minutes
                    ? `✅ Minutes ready · ${open > 0 ? `${open} open action items` : "all actions done"}`
                    : `${m.segments.length} transcript lines · no minutes yet`}
                </Text>
              </Card>
            </Pressable>
          );
        }}
      />
      <View
        style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 20, alignItems: "center" }}
        pointerEvents="box-none"
      >
        <Button variant="primary" label="＋  New meeting" onPress={create} style={{ minHeight: 56, paddingHorizontal: 28 }} />
      </View>
    </View>
  );
}
