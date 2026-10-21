"use client";

import { PLANS, type PlanId } from "@/lib/plans";
import { useAccount } from "./AuthGate";

const UPGRADE_URL = process.env.NEXT_PUBLIC_UPGRADE_URL;

function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div>
      <div className="row small" style={{ justifyContent: "space-between" }}>
        <span>{label}</span>
        <span className="muted">
          {used} / {limit}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuenow={used}
        aria-valuemax={limit}
        style={{ height: 8, borderRadius: 999, background: "var(--surface-2)", marginTop: 4, overflow: "hidden" }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: pct >= 100 ? "var(--danger)" : pct >= 80 ? "var(--warn)" : "var(--accent)",
          }}
        />
      </div>
    </div>
  );
}

export function AccountSheet({ onClose }: { onClose: () => void }) {
  const { account, signOut } = useAccount();
  const { usage, limits, plan } = account;
  const trialDays = account.trialEndsAt
    ? Math.max(1, Math.ceil((Date.parse(account.trialEndsAt) - Date.now()) / 86_400_000))
    : 0;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>Account</h2>
        <p className="muted small" style={{ marginTop: -6 }}>
          {account.user.email ?? account.user.name ?? "Signed in"}
        </p>

        <div className="card stack" style={{ boxShadow: "none" }}>
          <div className="row">
            <strong style={{ fontSize: 18 }}>{PLANS[plan].name}</strong>
            {trialDays > 0 && <span className="badge medium">trial · {trialDays} day{trialDays === 1 ? "" : "s"} left</span>}
          </div>
          <Meter label="AI minutes this month" used={usage.aiMinutes} limit={limits.aiMinutesPerMonth} />
          <Meter
            label="Speaker detection (minutes)"
            used={Math.round(usage.audioSeconds / 60)}
            limit={limits.cloudAudioMinutesPerMonth}
          />
          <p className="muted small" style={{ margin: 0 }}>
            On-device live transcripts are always unlimited. Meetings up to {limits.maxMeetingMinutes} min.
          </p>
        </div>

        <div className="section-title">Plans</div>
        <div className="stack">
          {(["free", "pro", "team"] as PlanId[]).map((id) => {
            const p = PLANS[id];
            const current = id === plan && !trialDays;
            return (
              <div key={id} className="card" style={{ boxShadow: "none", borderColor: id === plan ? "var(--accent)" : undefined }}>
                <div className="row">
                  <strong>{p.name}</strong>
                  <span className="spacer" />
                  {p.price.monthly ? (
                    <span>
                      <strong>${p.price.annualPerMonth}</strong>
                      <span className="muted small">/mo yearly · ${p.price.monthly} monthly{id === "team" ? " · per seat" : ""}</span>
                    </span>
                  ) : (
                    <strong>$0</strong>
                  )}
                </div>
                <ul className="plain-list small">
                  {p.pitch.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {id !== "free" && !current && UPGRADE_URL && (
                  <a
                    className="btn small primary"
                    style={{ marginTop: 8 }}
                    href={`${UPGRADE_URL}?plan=${id}&uid=${encodeURIComponent(account.user.id)}`}
                  >
                    Upgrade to {p.name}
                  </a>
                )}
              </div>
            );
          })}
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn ghost danger small" onClick={() => void signOut()}>
            Sign out
          </button>
          <span className="spacer" />
          <button className="btn small" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
