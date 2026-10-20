import { Pressable, Text, View } from "react-native";
import { groupByOwner, itemKey } from "@core/markdown";
import type { Minutes } from "@core/schema";
import { PALETTE, type Participant } from "@core/types";
import { useTheme } from "@/lib/theme";
import { Avatar, Button, Card, Muted, SectionTitle } from "./ui";

export function MinutesView({
  minutes,
  participants,
  done,
  createdAt,
  onToggle,
  onApplyNames,
}: {
  minutes: Minutes;
  participants: Participant[];
  done: Set<string>;
  createdAt: number;
  onToggle: (key: string) => void;
  onApplyNames?: () => void;
}) {
  const t = useTheme();
  const colorFor = (name: string, i: number) =>
    participants.find((p) => p.name === name)?.color ??
    (name === "Unassigned" ? "#8a8fa3" : PALETTE[i % PALETTE.length]);
  const owners = groupByOwner(minutes.action_items);
  const open = minutes.action_items.filter((a) => !done.has(itemKey(a))).length;
  const priorityColor = { high: t.danger, medium: t.warn, low: t.ok } as const;
  const body = { color: t.text, fontSize: 15, lineHeight: 22 };

  return (
    <View>
      <Card>
        <Muted>
          {new Date(createdAt).toLocaleString(undefined, { dateStyle: "full", timeStyle: "short" })}
        </Muted>
        <Text style={{ color: t.text, fontSize: 22, fontWeight: "700", marginVertical: 8 }}>
          {minutes.title}
        </Text>
        <Text style={[body, { fontSize: 16, lineHeight: 24 }]}>{minutes.summary}</Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
          {[
            [minutes.attendees.length, "attendees"],
            [open, "open actions"],
            [minutes.decisions.length, "decisions"],
          ].map(([n, label]) => (
            <View
              key={label}
              style={{ flex: 1, backgroundColor: t.surface2, borderRadius: 12, padding: 10, alignItems: "center" }}
            >
              <Text style={{ color: t.text, fontSize: 22, fontWeight: "700" }}>{n}</Text>
              <Muted style={{ fontSize: 12 }}>{label}</Muted>
            </View>
          ))}
        </View>
      </Card>

      {onApplyNames && (
        <Card style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={[body, { flex: 1, fontSize: 14 }]}>Real names were detected in the conversation.</Text>
          <Button small variant="primary" label="Apply to speakers" onPress={onApplyNames} />
        </Card>
      )}

      <SectionTitle>Action items by person</SectionTitle>
      {owners.length === 0 && (
        <Card>
          <Muted>No action items were assigned.</Muted>
        </Card>
      )}
      <View style={{ gap: 12 }}>
        {owners.map(([owner, items], i) => {
          const c = colorFor(owner, i);
          return (
            <Card key={owner} style={{ borderLeftWidth: 4, borderLeftColor: c }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Avatar name={owner} color={c} />
                <Text style={{ color: t.text, fontWeight: "700", fontSize: 16 }}>{owner}</Text>
                <Muted>
                  · {items.length} item{items.length === 1 ? "" : "s"}
                </Muted>
              </View>
              {items.map((a) => {
                const key = itemKey(a);
                const isDone = done.has(key);
                return (
                  <Pressable
                    key={key}
                    onPress={() => onToggle(key)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isDone }}
                    style={{
                      flexDirection: "row",
                      gap: 12,
                      paddingVertical: 10,
                      borderTopWidth: 1,
                      borderTopColor: t.border,
                    }}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        borderWidth: 2,
                        borderColor: isDone ? t.ok : t.muted,
                        backgroundColor: isDone ? t.ok : "transparent",
                        alignItems: "center",
                        justifyContent: "center",
                        marginTop: 1,
                      }}
                    >
                      {isDone && <Text style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>✓</Text>}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          body,
                          isDone && { textDecorationLine: "line-through", color: t.muted },
                        ]}
                      >
                        {a.task}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                        <Text
                          style={{
                            color: priorityColor[a.priority],
                            backgroundColor: priorityColor[a.priority] + "22",
                            fontSize: 12,
                            fontWeight: "700",
                            paddingHorizontal: 8,
                            borderRadius: 8,
                            overflow: "hidden",
                          }}
                        >
                          {a.priority}
                        </Text>
                        {a.due && (
                          <Text
                            style={{
                              color: t.muted,
                              backgroundColor: t.surface2,
                              fontSize: 12,
                              fontWeight: "700",
                              paddingHorizontal: 8,
                              borderRadius: 8,
                              overflow: "hidden",
                            }}
                          >
                            due {a.due}
                          </Text>
                        )}
                      </View>
                      <Muted style={{ marginTop: 4, fontStyle: "italic" }}>“{a.evidence}”</Muted>
                    </View>
                  </Pressable>
                );
              })}
            </Card>
          );
        })}
      </View>

      {minutes.decisions.length > 0 && (
        <>
          <SectionTitle>Decisions</SectionTitle>
          <Card style={{ gap: 6 }}>
            {minutes.decisions.map((d, i) => (
              <Text key={i} style={body}>
                • {d.decision}
                {d.made_by ? <Text style={{ color: t.muted }}> — {d.made_by}</Text> : null}
              </Text>
            ))}
          </Card>
        </>
      )}

      {minutes.discussion_points.length > 0 && <SectionTitle>Discussion points</SectionTitle>}
      <View style={{ gap: 12 }}>
        {minutes.discussion_points.map((p, i) => (
          <Card key={i}>
            <Text style={{ color: t.text, fontWeight: "700", fontSize: 16 }}>{p.topic}</Text>
            {p.raised_by.length > 0 && <Muted>Raised by {p.raised_by.join(", ")}</Muted>}
            <Text style={[body, { marginTop: 8 }]}>{p.summary}</Text>
            {p.key_notes.map((n, j) => (
              <Text key={j} style={[body, { marginTop: 4 }]}>
                • {n}
              </Text>
            ))}
          </Card>
        ))}
      </View>

      <SectionTitle>Attendees</SectionTitle>
      <Card style={{ gap: 12 }}>
        {minutes.attendees.map((a, i) => (
          <View key={a.label} style={{ flexDirection: "row", gap: 10 }}>
            <Avatar name={a.name} color={colorFor(a.name, i)} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontWeight: "700" }}>
                {a.name}
                {a.name !== a.label ? <Text style={{ color: t.muted, fontWeight: "400" }}> ({a.label})</Text> : null}
              </Text>
              <Muted>{a.contribution}</Muted>
            </View>
          </View>
        ))}
      </Card>

      {minutes.open_questions.length > 0 && (
        <>
          <SectionTitle>Open questions</SectionTitle>
          <Card style={{ gap: 6 }}>
            {minutes.open_questions.map((q, i) => (
              <Text key={i} style={body}>
                • {q}
              </Text>
            ))}
          </Card>
        </>
      )}

      {minutes.next_meeting && (
        <>
          <SectionTitle>Next meeting</SectionTitle>
          <Card>
            <Text style={body}>{minutes.next_meeting}</Text>
          </Card>
        </>
      )}
    </View>
  );
}
