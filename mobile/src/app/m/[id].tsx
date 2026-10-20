import * as DocumentPicker from "expo-document-picker";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fromDiarized, mergeByName, parsePasted, pruneUnused, withInvitees } from "@core/importers";
import { fmtClock, uid, type Meeting, type Participant, type Segment } from "@core/types";
import { MinutesView } from "@/components/MinutesView";
import {
  CalendarSheet,
  MODES,
  ModeList,
  PasteSheet,
  LineSheet,
  SpeakersSheet,
  type CaptureMode,
} from "@/components/Sheets";
import { Avatar, Button, Card, ErrorBanner, Muted, OptionRow, SectionTitle, Sheet } from "@/components/ui";
import { diarizationEnabled, generateMinutes, transcribeFile } from "@/lib/api";
import type { DeviceEvent } from "@/lib/calendar";
import { shareMarkdownFile, sharePdf, shareText } from "@/lib/export";
import { deleteMeeting, getMeeting, saveMeeting, setAudioUri } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import { useLiveSpeech } from "@/lib/useLiveSpeech";
import { useMeetingRecorder } from "@/lib/useMeetingRecorder";

type SheetName = null | "speakers" | "mode" | "paste" | "calendar";
const KEEP_AWAKE = "live-transcript";

export default function MeetingScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [tab, setTab] = useState<"transcript" | "minutes">("transcript");
  const [mode, setMode] = useState<CaptureMode>("live");
  const [sheet, setSheet] = useState<SheetName>(null);
  const [lineFor, setLineFor] = useState<Segment | null>(null);
  const [activeId, setActiveId] = useState("");
  const [busy, setBusy] = useState<null | "transcribing" | "summarising">(null);
  const [error, setError] = useState<string | null>(null);
  const [diarize, setDiarize] = useState(false);
  const [now, setNow] = useState(0);
  /** Timer origin for the current capture session (refs mirror it for callbacks). */
  const [session, setSession] = useState<{ base: number; at: number } | null>(null);

  const scrollRef = useRef<ScrollViewInstance>(null);
  const startRef = useRef(0);
  const baseRef = useRef(0);
  const activeRef = useRef(activeId);
  useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);

  const update = useCallback((fn: (m: Meeting) => Meeting) => {
    setMeeting((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      void saveMeeting(next);
      return next;
    });
  }, []);

  // Keeps the tap-to-tag selection valid after speakers merge or disappear.
  const setPeople = (m: Meeting, participants: Participant[], segments = m.segments): Meeting => {
    const merged = mergeByName(participants, segments);
    if (!merged.participants.some((p) => p.id === activeRef.current)) {
      setActiveId(merged.participants[0]?.id ?? "");
    }
    return { ...m, participants: merged.participants, segments: merged.segments };
  };

  useEffect(() => {
    getMeeting(id).then((m) => {
      if (!m) return router.back();
      setMeeting(m);
      setActiveId(m.participants[0]?.id ?? "");
      if (m.minutes) setTab("minutes");
      diarizationEnabled().then((on) => {
        setDiarize(on);
        if (on && m.segments.length === 0) setMode("record");
      });
    });
  }, [id]);

  const elapsed = () => baseRef.current + (Date.now() - startRef.current) / 1000;

  const live = useLiveSpeech(meeting?.lang ?? "en-US", (text) => {
    const seg: Segment = { id: uid(), speakerId: activeRef.current, text, t: elapsed() };
    update((m) => ({ ...m, segments: [...m.segments, seg] }));
  });
  const recorder = useMeetingRecorder();
  const recording = live.listening || recorder.recording;

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [recording]);

  const unavailable = useMemo(() => {
    const u: Partial<Record<CaptureMode, string>> = {};
    if (!diarize) {
      u.record = "Needs DEEPGRAM_API_KEY on your Notestaker server.";
      u.upload = u.record;
    }
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        u.live = "Speech recognition isn't available on this device.";
      }
    } catch {
      u.live = "Speech recognition needs a development build (not Expo Go).";
    }
    return u;
  }, [diarize]);

  const transcribe = async (uri: string, mime: string, offset: number) => {
    if (!meeting) return;
    setBusy("transcribing");
    setError(null);
    try {
      const utterances = await transcribeFile(uri, mime, meeting.lang);
      if (!utterances.length) throw new Error("No speech was detected in the audio.");
      update((m) => {
        const r = fromDiarized(utterances, m.participants, offset);
        return setPeople(m, r.participants, [...m.segments, ...r.segments]);
      });
      setSheet("speakers");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const start = async () => {
    if (!meeting) return;
    setError(null);
    baseRef.current = meeting.durationSec;
    startRef.current = Date.now();
    setNow(startRef.current);
    setSession({ base: baseRef.current, at: startRef.current });
    try {
      if (mode === "live") {
        if (await live.start()) await activateKeepAwakeAsync(KEEP_AWAKE);
      } else if (mode === "record") {
        await recorder.start();
      } else if (mode === "upload") {
        const res = await DocumentPicker.getDocumentAsync({
          type: ["audio/*", "video/mp4"],
          copyToCacheDirectory: true,
        });
        const file = res.canceled ? undefined : res.assets[0];
        if (file) {
          await setAudioUri(meeting.id, file.uri);
          update((m) => ({ ...m, hasAudio: true }));
          await transcribe(file.uri, file.mimeType || "audio/mp4", meeting.durationSec);
        }
      } else {
        setSheet("paste");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const stop = async () => {
    if (!meeting || !recording) return;
    const dur = elapsed();
    const offset = baseRef.current;
    update((m) => ({ ...m, durationSec: dur }));
    if (live.listening) {
      live.stop();
      deactivateKeepAwake(KEEP_AWAKE);
      return;
    }
    try {
      const uri = await recorder.stop();
      await setAudioUri(meeting.id, uri);
      update((m) => ({ ...m, hasAudio: true }));
      await transcribe(uri, "audio/mp4", offset);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const generate = async () => {
    if (!meeting) return;
    if (recording) await stop();
    setBusy("summarising");
    setError(null);
    try {
      const minutes = await generateMinutes(meeting);
      update((m) => ({ ...m, minutes, minutesAt: Date.now(), done: [] }));
      setTab("minutes");
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const linkEvent = (e: DeviceEvent) =>
    update((m) =>
      setPeople(
        {
          ...m,
          title: e.title,
          calendar: { eventId: e.id, start: e.start, end: e.end, invitees: e.invitees },
        },
        withInvitees(m.participants, m.segments, e.invitees),
      ),
    );

  if (!meeting) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  const byId = new Map(meeting.participants.map((p) => [p.id, p]));
  const usedIds = new Set(meeting.segments.map((s) => s.speakerId));
  const activeSpeaker = byId.get(activeId);
  const shownTime = recording && session ? session.base + (now - session.at) / 1000 : meeting.durationSec;
  const modeInfo = MODES.find((m) => m.id === mode)!;
  const invitees = meeting.calendar?.invitees.map((i) => i.name) ?? [];
  const renamable =
    meeting.minutes?.attendees.filter(
      (a) => a.name !== a.label && meeting.participants.some((p) => p.name === a.label),
    ) ?? [];
  const clock = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              accessibilityLabel="Delete meeting"
              hitSlop={12}
              onPress={() =>
                Alert.alert("Delete meeting?", "This removes the transcript and minutes.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                      await deleteMeeting(meeting.id);
                      router.back();
                    },
                  },
                ])
              }
            >
              <Text style={{ fontSize: 18 }}>🗑</Text>
            </Pressable>
          ),
        }}
      />

      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 140 + insets.bottom }}
        onContentSizeChange={() => recording && tab === "transcript" && scrollRef.current?.scrollToEnd()}
      >
        <TextInput
          value={meeting.title}
          onChangeText={(title) => update((m) => ({ ...m, title }))}
          accessibilityLabel="Meeting title"
          style={{ color: t.text, fontSize: 22, fontWeight: "700", marginBottom: 12 }}
        />

        <View style={{ flexDirection: "row", backgroundColor: t.surface2, borderRadius: 999, padding: 4, marginBottom: 16 }}>
          {(["transcript", "minutes"] as const).map((k) => (
            <Pressable
              key={k}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === k }}
              onPress={() => setTab(k)}
              style={{
                flex: 1,
                minHeight: 38,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: tab === k ? t.surface : "transparent",
              }}
            >
              <Text style={{ color: tab === k ? t.text : t.muted, fontWeight: "600" }}>
                {k === "transcript" ? "Transcript" : `Minutes${meeting.minutes ? " ✓" : ""}`}
              </Text>
            </Pressable>
          ))}
        </View>

        <ErrorBanner message={error ?? live.error} />

        {tab === "transcript" && (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
              <Muted style={{ flex: 1 }}>{mode === "live" ? "Tap who's speaking" : "Speakers"}</Muted>
              <Button small variant="ghost" label="📅 Calendar" onPress={() => setSheet("calendar")} />
              <Button small variant="ghost" label="Edit names" onPress={() => setSheet("speakers")} />
            </View>
            {meeting.calendar && (
              <Pressable onPress={() => setSheet("calendar")}>
                <Muted style={{ marginBottom: 8 }}>
                  📅 {clock(meeting.calendar.start)} – {clock(meeting.calendar.end)} ·{" "}
                  {meeting.calendar.invitees.length} invited · change
                </Muted>
              </Pressable>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
              {meeting.participants.map((p) => {
                const on = p.id === activeId;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setActiveId(p.id)}
                    accessibilityState={{ selected: on }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      minHeight: 42,
                      paddingLeft: 6,
                      paddingRight: 14,
                      borderRadius: 999,
                      borderWidth: 2,
                      borderColor: on ? p.color : t.border,
                      backgroundColor: on ? p.color + "22" : t.surface,
                    }}
                  >
                    <Avatar name={p.name} color={p.color} />
                    <Text style={{ color: t.text, fontWeight: "600" }}>{p.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {meeting.segments.length === 0 && !live.interim ? (
              busy === "transcribing" ? (
                <Card style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <ActivityIndicator color={t.accent} />
                  <Text style={{ color: t.text }}>Transcribing and detecting speakers…</Text>
                </Card>
              ) : recording ? (
                <Card>
                  <Muted>
                    {mode === "live"
                      ? "Listening… start talking."
                      : "Recording. You can lock the screen; speakers appear when you stop."}
                  </Muted>
                </Card>
              ) : (
                <View style={{ gap: 10 }}>
                  {!meeting.calendar && (
                    <OptionRow
                      icon="📅"
                      title="Link a calendar event"
                      detail="Pull the title and attendee names so speakers and action items get real names."
                      onPress={() => setSheet("calendar")}
                    />
                  )}
                  <SectionTitle>Choose how to capture</SectionTitle>
                  <ModeList mode={mode} unavailable={unavailable} onPick={setMode} />
                </View>
              )
            ) : (
              <Card style={{ paddingVertical: 4 }}>
                {meeting.segments.map((s, i) => {
                  const p = byId.get(s.speakerId) ?? meeting.participants[0];
                  return (
                    <Pressable
                      key={s.id}
                      onPress={() => setLineFor(s)}
                      style={{
                        flexDirection: "row",
                        gap: 10,
                        paddingVertical: 10,
                        borderTopWidth: i ? 1 : 0,
                        borderTopColor: t.border,
                      }}
                    >
                      <Avatar name={p?.name ?? "?"} color={p?.color ?? t.muted} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13 }}>
                          <Text style={{ color: p?.color, fontWeight: "700" }}>{p?.name}</Text>
                          <Text style={{ color: t.muted }}>  {fmtClock(s.t)}</Text>
                        </Text>
                        <Text style={{ color: t.text, fontSize: 15, lineHeight: 22, marginTop: 2 }}>{s.text}</Text>
                      </View>
                    </Pressable>
                  );
                })}
                {live.interim ? (
                  <View style={{ flexDirection: "row", gap: 10, paddingVertical: 10 }}>
                    <Avatar name={activeSpeaker?.name ?? "?"} color={activeSpeaker?.color ?? t.muted} />
                    <Text style={{ flex: 1, color: t.muted, fontStyle: "italic", fontSize: 15 }}>{live.interim}…</Text>
                  </View>
                ) : null}
                {busy === "transcribing" && (
                  <View style={{ flexDirection: "row", gap: 10, paddingVertical: 10 }}>
                    <ActivityIndicator color={t.accent} />
                    <Muted>Transcribing and detecting speakers…</Muted>
                  </View>
                )}
              </Card>
            )}
          </>
        )}

        {tab === "minutes" &&
          (meeting.minutes ? (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                <Button small label="↗ Share" onPress={() => shareText(meeting)} />
                <Button small label="PDF" onPress={() => sharePdf(meeting).catch((e) => setError(String(e)))} />
                <Button small label=".md" onPress={() => shareMarkdownFile(meeting).catch((e) => setError(String(e)))} />
                <View style={{ flex: 1 }} />
                <Button small variant="ghost" label="↻ Regenerate" disabled={busy !== null} onPress={generate} />
              </View>
              <MinutesView
                minutes={meeting.minutes}
                participants={meeting.participants}
                done={new Set(meeting.done ?? [])}
                createdAt={meeting.createdAt}
                onToggle={(key) =>
                  update((m) => {
                    const d = new Set(m.done ?? []);
                    if (d.has(key)) d.delete(key);
                    else d.add(key);
                    return { ...m, done: [...d] };
                  })
                }
                onApplyNames={
                  renamable.length
                    ? () =>
                        update((m) => {
                          const map = new Map(renamable.map((a) => [a.label, a.name]));
                          return setPeople(
                            {
                              ...m,
                              minutes: m.minutes && {
                                ...m.minutes,
                                attendees: m.minutes.attendees.map((a) => ({ ...a, label: a.name })),
                              },
                            },
                            m.participants.map((p) => ({ ...p, name: map.get(p.name) ?? p.name })),
                          );
                        })
                    : undefined
                }
              />
            </>
          ) : (
            <Card style={{ alignItems: "center", paddingVertical: 32 }}>
              <Text style={{ fontSize: 40 }}>📝</Text>
              <Muted style={{ textAlign: "center", marginTop: 8 }}>
                {meeting.segments.length
                  ? "Generate minutes: summary, discussion points, decisions and action items per person."
                  : "Capture a conversation first, then generate minutes."}
              </Muted>
            </Card>
          ))}

        {busy === "summarising" && (
          <Card style={{ flexDirection: "row", gap: 10, alignItems: "center", marginTop: 12 }}>
            <ActivityIndicator color={t.accent} />
            <Text style={{ color: t.text }}>Writing minutes and assigning action items…</Text>
          </Card>
        )}
      </ScrollView>

      {/* Capture dock */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: insets.bottom + 12,
          backgroundColor: t.surface,
          borderTopWidth: 1,
          borderTopColor: t.border,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 20, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
            {fmtClock(shownTime)}
          </Text>
          <Pressable disabled={recording} onPress={() => setSheet("mode")} hitSlop={8}>
            <Text numberOfLines={1} style={{ color: t.muted, fontSize: 14 }}>
              {modeInfo.icon} {modeInfo.label.split(" ·")[0]} ▾
            </Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={recording ? "Stop" : "Start"}
          disabled={busy !== null || Boolean(unavailable[mode])}
          onPress={recording ? stop : start}
          style={({ pressed }) => ({
            width: 68,
            height: 68,
            borderRadius: 34,
            borderWidth: 4,
            borderColor: t.danger,
            alignItems: "center",
            justifyContent: "center",
            opacity: busy !== null || unavailable[mode] ? 0.4 : pressed ? 0.7 : 1,
          })}
        >
          <View
            style={{
              width: recording ? 24 : 28,
              height: recording ? 24 : 28,
              borderRadius: recording ? 6 : 14,
              backgroundColor: t.danger,
            }}
          />
        </Pressable>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Button
            variant="primary"
            label="✨ Minutes"
            loading={busy === "summarising"}
            disabled={meeting.segments.length === 0 || busy !== null}
            onPress={generate}
          />
        </View>
      </View>

      {sheet === "speakers" && (
        <SpeakersSheet
          visible
          participants={meeting.participants}
          usedIds={usedIds}
          suggestions={invitees}
          onSave={(participants) => update((m) => setPeople(m, participants))}
          onClose={() => setSheet(null)}
        />
      )}
      <Sheet visible={sheet === "mode"} title="How do you want to capture?" onClose={() => setSheet(null)}>
        <ModeList
          mode={mode}
          unavailable={unavailable}
          onPick={(m) => {
            setMode(m);
            setSheet(null);
          }}
        />
      </Sheet>
      <PasteSheet
        visible={sheet === "paste"}
        onClose={() => setSheet(null)}
        onImport={(text) =>
          update((m) => {
            const r = parsePasted(text, m.participants, m.durationSec);
            const last = r.segments.at(-1)?.t ?? m.durationSec;
            const segments = [...m.segments, ...r.segments];
            return setPeople(
              { ...m, durationSec: Math.max(m.durationSec, last) },
              pruneUnused(r.participants, segments),
              segments,
            );
          })
        }
      />
      <CalendarSheet
        visible={sheet === "calendar"}
        linkedId={meeting.calendar?.eventId}
        onPick={linkEvent}
        onClose={() => setSheet(null)}
      />
      {lineFor && (
        <LineSheet
          key={lineFor.id}
          visible
          participants={meeting.participants}
          current={lineFor.speakerId}
          text={lineFor.text}
          onPick={(speakerId) =>
            lineFor &&
            update((m) => ({
              ...m,
              segments: m.segments.map((s) => (s.id === lineFor.id ? { ...s, speakerId } : s)),
            }))
          }
          onEditText={(text) =>
            lineFor &&
            update((m) => ({
              ...m,
              segments: m.segments.map((s) => (s.id === lineFor.id ? { ...s, text } : s)),
            }))
          }
          onDelete={() =>
            lineFor && update((m) => ({ ...m, segments: m.segments.filter((s) => s.id !== lineFor.id) }))
          }
          onClose={() => setLineFor(null)}
        />
      )}
    </View>
  );
}
