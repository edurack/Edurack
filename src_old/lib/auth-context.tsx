import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./firebase";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    // Defer Firebase's auth-state check (and the iframe request it kicks
    // off) until the browser is idle, so it doesn't compete with
    // render-critical resources (hero image, fonts, CSS) on first load.
    // Falls back to a short timeout on browsers without
    // requestIdleCallback (Safari).
    const schedule =
      window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
    const cancel =
      window.cancelIdleCallback ?? ((id: number) => window.clearTimeout(id));

    const handle = schedule(() => {
      unsubscribe = onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
      });
    });

    return () => {
      cancel(handle as number);
      unsubscribe?.();
    };
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}