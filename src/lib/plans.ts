// Plan catalogue shared by the server (enforcement) and both clients
// (paywall copy, usage meters). Prices are display values; billing providers
// (Stripe on web, App Store / Play via RevenueCat on mobile) are the source of
// truth for what a customer is charged.

export type PlanId = "free" | "pro" | "team";

export type Plan = {
  id: PlanId;
  name: string;
  /** USD per month, billed monthly / billed annually (per month). */
  price: { monthly: number; annualPerMonth: number };
  limits: {
    /** AI minutes generations (Claude) per calendar month. */
    aiMinutesPerMonth: number;
    /** Cloud transcription with speaker detection (Deepgram), minutes per month. */
    cloudAudioMinutesPerMonth: number;
    /** Longest meeting that can be summarised, in minutes. */
    maxMeetingMinutes: number;
  };
  pitch: string[];
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    price: { monthly: 0, annualPerMonth: 0 },
    limits: { aiMinutesPerMonth: 4, cloudAudioMinutesPerMonth: 120, maxMeetingMinutes: 45 },
    pitch: [
      "Unlimited on-device live transcripts",
      "4 AI minutes per month",
      "2 hours of auto speaker detection",
      "Calendar names, share & export",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: { monthly: 16, annualPerMonth: 12 },
    limits: { aiMinutesPerMonth: 150, cloudAudioMinutesPerMonth: 900, maxMeetingMinutes: 240 },
    pitch: [
      "Everything in Free",
      "150 AI minutes per month",
      "15 hours of live speaker labels",
      "Meetings up to 4 hours",
    ],
  },
  team: {
    id: "team",
    name: "Team",
    price: { monthly: 24, annualPerMonth: 20 },
    limits: { aiMinutesPerMonth: 300, cloudAudioMinutesPerMonth: 1500, maxMeetingMinutes: 240 },
    pitch: [
      "Everything in Pro, per seat",
      "300 AI minutes & 25 hours of speaker detection per seat",
      "Shared meetings & action items (coming soon)",
      "One invoice for the whole team (coming soon)",
    ],
  },
};

/** New accounts get Pro for this many days before falling back to Free. */
export const TRIAL_DAYS = 7;

/** "2026-10" — usage resets on the 1st of each month (UTC). */
export const usagePeriod = (d = new Date()) => d.toISOString().slice(0, 7);

export type Usage = { aiMinutes: number; audioSeconds: number };

/** What a signed-in client needs to render plan, trial and meters. */
export type Account = {
  user: { id: string; email: string | null; name: string | null };
  plan: PlanId;
  trialEndsAt: string | null;
  period: string;
  usage: Usage;
  limits: Plan["limits"];
};

export type QuotaError = {
  error: string;
  code: "quota";
  plan: PlanId;
  limit: "aiMinutesPerMonth" | "cloudAudioMinutesPerMonth" | "maxMeetingMinutes";
};
