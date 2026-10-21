import { PLANS, TRIAL_DAYS, usagePeriod, type Account, type PlanId, type QuotaError, type Usage } from "@/lib/plans";
import { db } from "./db";
import { sha256Hex, type Identity } from "./identity";

type UserRow = {
  id: string;
  email: string | null;
  name: string | null;
  plan: PlanId;
  trial_ends_at: Date | string | null;
};

const newId = () => `u_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

/**
 * Finds the user for a verified identity, linking by verified email so the
 * same person signing in with Apple, Google or an email code gets one account.
 * New accounts start a Pro trial.
 */
export async function upsertUser(provider: "apple" | "google", id: Identity): Promise<string> {
  const d = await db();
  const col = provider === "apple" ? "apple_sub" : "google_sub";
  const [bySub] = await d.query<{ id: string }>(`select id from users where ${col} = $1`, [id.sub]);
  if (bySub) return bySub.id;

  if (id.email && id.emailVerified) {
    const [byEmail] = await d.query<{ id: string }>(`select id from users where email = $1`, [id.email]);
    if (byEmail) {
      await d.query(`update users set ${col} = $1, name = coalesce(name, $2) where id = $3`, [id.sub, id.name, byEmail.id]);
      return byEmail.id;
    }
  }
  const uid = newId();
  await d.query(
    `insert into users (id, email, ${col}, name, trial_ends_at) values ($1, $2, $3, $4, now() + ($5 || ' days')::interval)`,
    [uid, id.emailVerified ? id.email : null, id.sub, id.name, String(TRIAL_DAYS)],
  );
  return uid;
}

export async function upsertEmailUser(email: string): Promise<string> {
  const d = await db();
  const [hit] = await d.query<{ id: string }>(`select id from users where email = $1`, [email]);
  if (hit) return hit.id;
  const uid = newId();
  await d.query(
    `insert into users (id, email, trial_ends_at) values ($1, $2, now() + ($3 || ' days')::interval)`,
    [uid, email, String(TRIAL_DAYS)],
  );
  return uid;
}

// ---- Email one-time codes -------------------------------------------------

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const RESEND_AFTER_SEC = 45;

/** Returns the code to deliver, or null if one was sent too recently. */
export async function createEmailCode(email: string): Promise<string | null> {
  const d = await db();
  const [prev] = await d.query<{ recent: boolean }>(
    `select sent_at > now() - ($2 || ' seconds')::interval as recent from email_codes where email = $1`,
    [email, String(RESEND_AFTER_SEC)],
  );
  if (prev?.recent) return null;
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
  await d.query(
    `insert into email_codes (email, code_hash, expires_at, attempts, sent_at)
     values ($1, $2, now() + ($3 || ' minutes')::interval, 0, now())
     on conflict (email) do update set code_hash = excluded.code_hash, expires_at = excluded.expires_at,
       attempts = 0, sent_at = now()`,
    [email, await sha256Hex(`${email}:${code}`), String(CODE_TTL_MIN)],
  );
  return code;
}

export async function consumeEmailCode(email: string, code: string): Promise<boolean> {
  const d = await db();
  const [row] = await d.query<{ code_hash: string; expired: boolean; attempts: number }>(
    `update email_codes set attempts = attempts + 1 where email = $1
     returning code_hash, expires_at < now() as expired, attempts`,
    [email],
  );
  if (!row || row.expired || row.attempts > MAX_ATTEMPTS) return false;
  if (row.code_hash !== (await sha256Hex(`${email}:${code}`))) return false;
  await d.query(`delete from email_codes where email = $1`, [email]);
  return true;
}

// ---- Plans & usage --------------------------------------------------------

/** Comma-separated "email:plan" pairs, e.g. for beta testers before billing exists. */
function overrideFor(email: string | null): PlanId | null {
  if (!email) return null;
  for (const pair of (process.env.PLAN_OVERRIDES ?? "").split(",")) {
    const [e, p] = pair.split(":").map((s) => s.trim().toLowerCase());
    if (e === email && p in PLANS) return p as PlanId;
  }
  return null;
}

/** The plan in force and, when it comes from the sign-up trial, when that ends. */
function effectivePlan(u: UserRow): { plan: PlanId; trialEndsAt: Date | null } {
  const override = overrideFor(u.email);
  if (override) return { plan: override, trialEndsAt: null };
  const ends = u.trial_ends_at ? new Date(u.trial_ends_at) : null;
  return u.plan === "free" && ends && ends.getTime() > Date.now()
    ? { plan: "pro", trialEndsAt: ends }
    : { plan: u.plan, trialEndsAt: null };
}

async function getUser(userId: string): Promise<UserRow | null> {
  const [u] = await (await db()).query<UserRow>(
    `select id, email, name, plan, trial_ends_at from users where id = $1`,
    [userId],
  );
  return u ?? null;
}

async function getUsage(userId: string, period = usagePeriod()): Promise<Usage> {
  const [row] = await (await db()).query<{ ai_minutes: number; audio_seconds: number }>(
    `select ai_minutes, audio_seconds from usage where user_id = $1 and period = $2`,
    [userId, period],
  );
  return { aiMinutes: row?.ai_minutes ?? 0, audioSeconds: row?.audio_seconds ?? 0 };
}

export async function account(userId: string): Promise<Account | null> {
  const u = await getUser(userId);
  if (!u) return null;
  const { plan, trialEndsAt } = effectivePlan(u);
  return {
    user: { id: u.id, email: u.email, name: u.name },
    plan,
    trialEndsAt: trialEndsAt?.toISOString() ?? null,
    period: usagePeriod(),
    usage: await getUsage(userId),
    limits: PLANS[plan].limits,
  };
}

export async function recordUsage(userId: string, delta: Partial<Usage>) {
  await (await db()).query(
    `insert into usage (user_id, period, ai_minutes, audio_seconds) values ($1, $2, $3, $4)
     on conflict (user_id, period) do update set
       ai_minutes = usage.ai_minutes + excluded.ai_minutes,
       audio_seconds = usage.audio_seconds + excluded.audio_seconds`,
    [userId, usagePeriod(), delta.aiMinutes ?? 0, Math.round(delta.audioSeconds ?? 0)],
  );
}

const quota = (a: Account, limit: QuotaError["limit"], error: string): QuotaError => ({
  error,
  code: "quota",
  plan: a.plan,
  limit,
});

/** Null when the account may generate minutes for a meeting of this length. */
export function checkMinutes(a: Account, meetingSeconds: number): QuotaError | null {
  if (meetingSeconds > a.limits.maxMeetingMinutes * 60) {
    return quota(
      a,
      "maxMeetingMinutes",
      `${PLANS[a.plan].name} summarises meetings up to ${a.limits.maxMeetingMinutes} minutes.`,
    );
  }
  if (a.usage.aiMinutes >= a.limits.aiMinutesPerMonth) {
    return quota(
      a,
      "aiMinutesPerMonth",
      `You've used all ${a.limits.aiMinutesPerMonth} AI minutes on ${PLANS[a.plan].name} this month.`,
    );
  }
  return null;
}

/** Seconds of cloud audio left this month (0 = blocked). */
export const audioSecondsLeft = (a: Account) =>
  Math.max(0, a.limits.cloudAudioMinutesPerMonth * 60 - a.usage.audioSeconds);

export function checkAudio(a: Account): QuotaError | null {
  return audioSecondsLeft(a) > 0
    ? null
    : quota(
        a,
        "cloudAudioMinutesPerMonth",
        `You've used all ${a.limits.cloudAudioMinutesPerMonth} minutes of speaker detection on ${PLANS[a.plan].name} this month. On-device transcription still works.`,
      );
}
