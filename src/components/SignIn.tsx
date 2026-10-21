"use client";

import { useEffect, useRef, useState } from "react";
import { signInWithGoogle, startEmail, verifyEmail } from "@/lib/account-client";
import { calendarConfigured, loadGis } from "@/lib/gcal";
import type { Account } from "@/lib/plans";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

export function SignIn({ onSignedIn }: { onSignedIn: (a: Account) => void }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!CLIENT_ID || !googleRef.current) return;
    const el = googleRef.current;
    loadGis()
      .then((google) => {
        google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: async ({ credential }) => {
            if (!credential) return;
            setBusy(true);
            setError(null);
            try {
              onSignedIn((await signInWithGoogle(credential)).account);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          },
        });
        google.accounts.id.renderButton(el, { theme: "outline", size: "large", shape: "pill", width: 320 });
      })
      .catch(() => {});
  }, [onSignedIn]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100dvh", padding: 16 }}>
      <div className="card stack" style={{ width: "100%", maxWidth: 380, padding: 24 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>🎙️</div>
          <h1 style={{ margin: "8px 0 4px", fontSize: 22 }}>Sign in to Notestaker</h1>
          <p className="muted small" style={{ margin: 0 }}>
            New accounts get 7 days of Pro free. No card needed.
          </p>
        </div>

        {error && <div className="error">{error}</div>}

        {calendarConfigured() && (
          <>
            <div ref={googleRef} style={{ display: "flex", justifyContent: "center", minHeight: 44 }} />
            <div className="row muted small" style={{ justifyContent: "center" }}>
              or use your email
            </div>
          </>
        )}

        {!sent ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await startEmail(email);
                setSent(true);
              });
            }}
          >
            <input
              className="field"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email"
              required
            />
            <button className="btn primary" disabled={busy || !email.trim()}>
              {busy ? <span className="spinner" /> : null} Email me a code
            </button>
          </form>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => onSignedIn((await verifyEmail(email, code)).account));
            }}
          >
            <p className="small" style={{ margin: 0 }}>
              We sent a 6-digit code to <strong>{email}</strong>.
            </p>
            <input
              className="field"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              aria-label="Sign-in code"
              style={{ letterSpacing: "0.3em", fontSize: 20, textAlign: "center" }}
              autoFocus
            />
            <button className="btn primary" disabled={busy || code.length !== 6}>
              {busy ? <span className="spinner" /> : null} Sign in
            </button>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => {
                setSent(false);
                setCode("");
              }}
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
