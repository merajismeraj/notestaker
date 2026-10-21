"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ACCOUNT_CHANGED, fetchAccount, signOut } from "@/lib/account-client";
import type { Account } from "@/lib/plans";
import { SignIn } from "./SignIn";

type Ctx = { account: Account; refresh: () => Promise<void>; signOut: () => Promise<void> };
const AccountContext = createContext<Ctx | null>(null);

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside <AuthGate>.");
  return ctx;
}

/** Shows sign-in until the server confirms a session, then renders the app. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setAccount(await fetchAccount());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(ACCOUNT_CHANGED, onChange);
    return () => window.removeEventListener(ACCOUNT_CHANGED, onChange);
  }, [refresh]);

  if (account === undefined) {
    return (
      <main className="empty">
        {error ? <div className="error">{error}</div> : <span className="spinner" aria-label="Loading" />}
      </main>
    );
  }
  if (account === null) return <SignIn onSignedIn={setAccount} />;

  return (
    <AccountContext.Provider
      value={{
        account,
        refresh,
        signOut: async () => {
          await signOut();
          setAccount(null);
        },
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}
