import * as Linking from "expo-linking";
import { useState } from "react";
import { Text, View } from "react-native";
import { PLANS, type PlanId } from "@core/plans";
import { useAccount } from "@/lib/account";
import { useTheme } from "@/lib/theme";
import { Button, Card, Muted, SectionTitle, Sheet } from "./ui";

const UPGRADE_URL = process.env.EXPO_PUBLIC_UPGRADE_URL;

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const t = useTheme();
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ now: used, min: 0, max: limit }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: t.text, fontSize: 14 }}>{label}</Text>
        <Muted>
          {used} / {limit}
        </Muted>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surface2, marginTop: 4, overflow: "hidden" }}>
        <View
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: pct >= 100 ? t.danger : pct >= 80 ? t.warn : t.accent,
          }}
        />
      </View>
    </View>
  );
}

export function AccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const { account, signOut } = useAccount();
  const [now] = useState(() => Date.now());
  if (!account) return null;
  const { usage, limits, plan } = account;
  const trialDays = account.trialEndsAt
    ? Math.max(1, Math.ceil((Date.parse(account.trialEndsAt) - now) / 86_400_000))
    : 0;

  return (
    <Sheet
      visible={visible}
      title="Account"
      subtitle={account.user.email ?? account.user.name ?? "Signed in"}
      onClose={onClose}
      footer={
        <>
          <Button
            small
            variant="danger"
            label="Sign out"
            onPress={() => {
              onClose();
              void signOut();
            }}
          />
          <View style={{ flex: 1 }} />
          <Button small label="Done" onPress={onClose} />
        </>
      }
    >
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: t.text, fontSize: 18, fontWeight: "700" }}>{PLANS[plan].name}</Text>
          {trialDays > 0 && (
            <Text style={{ color: t.warn, fontWeight: "700", fontSize: 12 }}>
              TRIAL · {trialDays} DAY{trialDays === 1 ? "" : "S"} LEFT
            </Text>
          )}
        </View>
        <Meter label="AI minutes this month" used={usage.aiMinutes} limit={limits.aiMinutesPerMonth} />
        <Meter
          label="Speaker detection (minutes)"
          used={Math.round(usage.audioSeconds / 60)}
          limit={limits.cloudAudioMinutesPerMonth}
        />
        <Muted>On-device live transcripts are always unlimited. Meetings up to {limits.maxMeetingMinutes} min.</Muted>
      </Card>

      <SectionTitle>Plans</SectionTitle>
      {(["free", "pro", "team"] as PlanId[]).map((id) => {
        const p = PLANS[id];
        return (
          <Card key={id} style={{ borderColor: id === plan ? t.accent : t.border, borderWidth: id === plan ? 2 : 1 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <Text style={{ color: t.text, fontWeight: "700", fontSize: 16, flex: 1 }}>{p.name}</Text>
              <Text style={{ color: t.text, fontWeight: "700" }}>
                {p.price.monthly ? `$${p.price.annualPerMonth}` : "$0"}
              </Text>
              {p.price.monthly > 0 && <Muted>/mo yearly</Muted>}
            </View>
            {p.price.monthly > 0 && (
              <Muted>
                ${p.price.monthly} billed monthly{id === "team" ? " · per seat" : ""}
              </Muted>
            )}
            {p.pitch.map((line) => (
              <Text key={line} style={{ color: t.text, fontSize: 14, marginTop: 4 }}>
                • {line}
              </Text>
            ))}
            {id !== "free" && id !== plan && UPGRADE_URL && (
              <Button
                small
                variant="primary"
                label={`Upgrade to ${p.name}`}
                style={{ marginTop: 10, alignSelf: "flex-start" }}
                onPress={() => Linking.openURL(`${UPGRADE_URL}?plan=${id}&uid=${encodeURIComponent(account.user.id)}`)}
              />
            )}
          </Card>
        );
      })}
    </Sheet>
  );
}
