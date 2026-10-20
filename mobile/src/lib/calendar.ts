import * as Calendar from "expo-calendar";

export type DeviceEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  invitees: { name: string; email: string }[];
};

/** "priya.sharma@acme.com" → "Priya Sharma" when the calendar has no display name. */
export function nameFromEmail(email: string) {
  return email
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export async function ensureCalendarAccess() {
  const current = await Calendar.getCalendarPermissions();
  if (current.granted) return true;
  return (await Calendar.requestCalendarPermissions()).granted;
}

/**
 * Timed events on the given local day across every calendar on the device
 * (Google, Outlook/Exchange, iCloud): no OAuth, one permission prompt.
 */
export async function listDayEvents(day: Date): Promise<DeviceEvent[]> {
  const from = new Date(day);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);

  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  if (!calendars.length) return [];
  const events = await Calendar.listEvents(calendars, from, to);

  const timed = events
    .filter((e) => !e.allDay)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  return Promise.all(
    timed.map(async (e) => {
      const attendees = await e.getAttendees().catch(() => []);
      const invitees = attendees
        .filter(
          (a) =>
            a.status !== Calendar.AttendeeStatus.DECLINED &&
            a.type !== Calendar.AttendeeType.ROOM &&
            a.type !== Calendar.AttendeeType.RESOURCE,
        )
        .map((a) => {
          // iOS often exposes the address only as a mailto: URL.
          const email = a.email || a.url?.replace(/^mailto:/i, "") || "";
          const raw = a.name?.trim() || email;
          return { name: raw.includes("@") ? nameFromEmail(raw) : raw, email };
        })
        .filter((a) => a.name);
      return {
        id: e.id,
        title: e.title?.trim() || "(No title)",
        start: new Date(e.startDate).toISOString(),
        end: new Date(e.endDate).toISOString(),
        invitees,
      };
    }),
  );
}
