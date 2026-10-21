import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Account } from "@core/plans";
import { fetchAccount } from "./api";
import { onSessionChange, setToken } from "./session";

type Ctx = {
  /** undefined while loading, null when signed out. */
  account: Account | null | undefined;
  setAccount: (a: Account | null) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AccountContext = createContext<Ctx | null>(null);

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used inside <AccountProvider>.");
  return ctx;
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    try {
      setAccount(await fetchAccount());
    } catch {
      // Offline: keep whatever we had; signed-out only if we never loaded.
      setAccount((a) => (a === undefined ? null : a));
    }
  }, []);

  useEffect(() => {
    let live = true;
    fetchAccount().then(
      (a) => live && setAccount(a),
      () => live && setAccount(null),
    );
    const off = onSessionChange(() => void refresh());
    return () => {
      live = false;
      off();
    };
  }, [refresh]);

  return (
    <AccountContext.Provider value={{ account, setAccount, refresh, signOut: () => setToken(null) }}>
      {children}
    </AccountContext.Provider>
  );
}
