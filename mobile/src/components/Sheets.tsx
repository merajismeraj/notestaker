import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { PALETTE, uid, type Participant } from "@core/types";
import { ensureCalendarAccess, listDayEvents, type DeviceEvent } from "@/lib/calendar";
import { useTheme } from "@/lib/theme";
import { Avatar, Button, ErrorBanner, Muted, OptionRow, Sheet } from "./ui";

export type CaptureMode = "stream" | "live" | "record" | "upload" | "paste";

export const MODES: { id: CaptureMode; icon: string; label: string; hint: string }[] = [
  {
    id: "stream",
    icon: "🗣️",
    label: "Live · auto-detect speakers",
    hint: "Lines appear labelled by speaker as people talk. Needs a connection; brief drops are buffered.",
  },
  {
    id: "record",
    icon: "👥",
    label: "Record · speakers after",
    hint: "Works with a weak connection. Transcribed with speakers when you stop; best accuracy.",
  },
  {
    id: "live",
    icon: "🎙️",
    label: "Live · tap to tag speakers",
    hint: "On-device speech-to-text, works offline. Tap who's speaking to tag lines.",
  },
  {
    id: "upload",
    icon: "📁",
    label: "Import audio",
    hint: "Voice memo or call recording. Speakers detected automatically.",
  },
  {
    id: "paste",
    icon: "📋",
    label: "Paste transcript",
    hint: "From Zoom, Teams or Meet. “Name: text” lines keep their speakers.",
  },
];

export function ModeList({
  mode,
  unavailable,
  onPick,
}: {
  mode: CaptureMode;
  unavailable: Partial<Record<CaptureMode, string>>;
  onPick: (m: CaptureMode) => void;
}) {
  return (
    <>
      {MODES.map((m) => (
        <OptionRow
          key={m.id}
          icon={m.icon}
          title={m.label}
          detail={unavailable[m.id] ?? m.hint}
          selected={mode === m.id}
          disabled={Boolean(unavailable[m.id])}
          onPress={() => onPick(m.id)}
        />
      ))}
    </>
  );
}

export function SpeakersSheet({
  visible,
  participants,
  usedIds,
  suggestions,
  onSave,
  onClose,
}: {
  visible: boolean;
  participants: Participant[];
  usedIds: Set<string>;
  suggestions: string[];
  onSave: (p: Participant[]) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  // Mounted fresh each time it opens, so the draft starts from current speakers.
  const [list, setList] = useState(participants);
  const [focused, setFocused] = useState<string | null>(null);

  const set = (id: string, name: string) =>
    setList((l) => l.map((p) => (p.id === id ? { ...p, name } : p)));

  return (
    <Sheet
      visible={visible}
      title="Speakers"
      subtitle={
        suggestions.length
          ? "Rename a detected speaker to an invitee to merge their lines into that person."
          : "Rename speakers to real names. Every line and action item follows."
      }
      onClose={onClose}
      footer={
        <>
          <Button
            small
            label="＋ Add"
            onPress={() =>
              setList((l) => [
                ...l,
                { id: uid(), name: `Speaker ${l.length + 1}`, color: PALETTE[l.length % PALETTE.length] },
              ])
            }
          />
          <View style={{ flex: 1 }} />
          <Button small variant="ghost" label="Cancel" onPress={onClose} />
          <Button
            small
            variant="primary"
            label="Save"
            onPress={() => {
              onSave(list.map((p) => ({ ...p, name: p.name.trim() || "Unnamed" })));
              onClose();
            }}
          />
        </>
      }
    >
      {list.map((p) => (
        <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Avatar name={p.name} color={p.color} />
          <TextInput
            value={p.name}
            onChangeText={(v) => set(p.id, v)}
            onFocus={() => setFocused(p.id)}
            accessibilityLabel="Speaker name"
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 10,
              paddingHorizontal: 12,
              color: t.text,
              backgroundColor: t.surface2,
              borderWidth: 1,
              borderColor: focused === p.id ? t.accent : t.border,
            }}
          />
          <Pressable
            accessibilityLabel="Remove speaker"
            disabled={usedIds.has(p.id) || list.length <= 1}
            onPress={() => setList((l) => l.filter((x) => x.id !== p.id))}
            style={{ padding: 8, opacity: usedIds.has(p.id) || list.length <= 1 ? 0.3 : 1 }}
          >
            <Text style={{ color: t.muted, fontSize: 18 }}>✕</Text>
          </Pressable>
        </View>
      ))}
      {suggestions.length > 0 && (
        <>
          <Muted style={{ marginTop: 8 }}>
            {focused ? "Tap an invitee to use their name:" : "Select a speaker above, then tap an invitee:"}
          </Muted>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {suggestions.map((n) => (
              <Button key={n} small label={n} disabled={!focused} onPress={() => focused && set(focused, n)} />
            ))}
          </View>
        </>
      )}
    </Sheet>
  );
}

export function LineSheet({
  visible,
  participants,
  current,
  text,
  onPick,
  onEditText,
  onDelete,
  onClose,
}: {
  visible: boolean;
  participants: Participant[];
  current?: string;
  text: string;
  onPick: (id: string) => void;
  onEditText: (text: string) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const [draft, setDraft] = useState(text);
  // Saves edits however the sheet is dismissed.
  const close = () => {
    if (draft.trim() && draft.trim() !== text) onEditText(draft.trim());
    onClose();
  };
  return (
    <Sheet visible={visible} title="Edit line" onClose={close}>
      <TextInput
        multiline
        value={draft}
        onChangeText={setDraft}
        accessibilityLabel="Line text"
        textAlignVertical="top"
        style={{
          minHeight: 80,
          borderRadius: 10,
          padding: 12,
          color: t.text,
          backgroundColor: t.surface2,
          borderWidth: 1,
          borderColor: t.border,
          fontSize: 15,
        }}
      />
      <Muted>Who said this?</Muted>
      {participants.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => {
            onPick(p.id);
            close();
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            padding: 10,
            borderRadius: 12,
            backgroundColor: p.id === current ? p.color + "22" : "transparent",
          }}
        >
          <Avatar name={p.name} color={p.color} />
          <Text style={{ color: t.text, fontSize: 16, fontWeight: "600" }}>{p.name}</Text>
        </Pressable>
      ))}
      <Button
        variant="danger"
        label="Delete this line"
        onPress={() => {
          onDelete();
          onClose();
        }}
      />
    </Sheet>
  );
}

export function PasteSheet({
  visible,
  onImport,
  onClose,
}: {
  visible: boolean;
  onImport: (text: string) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const [text, setText] = useState("");
  return (
    <Sheet
      visible={visible}
      title="Paste transcript"
      onClose={onClose}
      footer={
        <>
          <View style={{ flex: 1 }} />
          <Button small variant="ghost" label="Cancel" onPress={onClose} />
          <Button
            small
            variant="primary"
            label="Import"
            disabled={!text.trim()}
            onPress={() => {
              onImport(text);
              setText("");
              onClose();
            }}
          />
        </>
      }
    >
      <TextInput
        multiline
        value={text}
        onChangeText={setText}
        placeholder={"Priya: Let's lock the launch date.\nAlex: I can have the deck ready by Thursday."}
        placeholderTextColor={t.muted}
        textAlignVertical="top"
        style={{
          minHeight: 220,
          borderRadius: 10,
          padding: 12,
          color: t.text,
          backgroundColor: t.surface2,
          borderWidth: 1,
          borderColor: t.border,
        }}
      />
    </Sheet>
  );
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export function CalendarSheet({
  visible,
  linkedId,
  onPick,
  onClose,
}: {
  visible: boolean;
  linkedId?: string;
  onPick: (e: DeviceEvent) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const [offset, setOffset] = useState(0);
  const [events, setEvents] = useState<DeviceEvent[] | null>(null);
  const [loadedAt, setLoadedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        if (!(await ensureCalendarAccess())) {
          throw new Error("Calendar access is off. Enable it for Notestaker in Settings.");
        }
        const day = new Date();
        day.setDate(day.getDate() + offset);
        const list = await listDayEvents(day);
        if (!cancelled) {
          setEvents(list);
          setLoadedAt(Date.now());
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, offset]);

  const day = new Date();
  day.setDate(day.getDate() + offset);
  const label =
    offset === 0
      ? "Today"
      : offset === -1
        ? "Yesterday"
        : offset === 1
          ? "Tomorrow"
          : day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return (
    <Sheet
      visible={visible}
      title="Link a calendar event"
      subtitle="Invitees become named speakers, and the guest list helps Claude work out who said what."
      onClose={onClose}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Button small variant="ghost" label="‹" onPress={() => setOffset((o) => o - 1)} />
        <Text style={{ flex: 1, textAlign: "center", color: t.text, fontWeight: "700", fontSize: 16 }}>
          {label}
        </Text>
        <Button small variant="ghost" label="›" onPress={() => setOffset((o) => o + 1)} />
      </View>
      <ErrorBanner message={error} />
      {loading && <ActivityIndicator color={t.accent} />}
      {!loading && events?.length === 0 && <Muted>No meetings on this day.</Muted>}
      {!loading &&
        events?.map((e) => (
          <OptionRow
            key={e.id}
            icon={time(e.start)}
            title={e.title}
            detail={e.invitees.length ? e.invitees.map((i) => i.name).join(", ") : "No guests"}
            selected={e.id === linkedId}
            badge={Date.parse(e.start) <= loadedAt && loadedAt < Date.parse(e.end) ? "now" : undefined}
            onPress={() => {
              onPick(e);
              onClose();
            }}
          />
        ))}
      <Muted style={{ marginTop: 4 }}>
        Reads calendars on this phone (Google, Outlook, iCloud). Only guest names are sent when you
        generate minutes.
      </Muted>
    </Sheet>
  );
}
