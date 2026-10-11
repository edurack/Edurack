import { createContext, useContext, useLayoutEffect, type ReactNode } from "react";

// The site is light-only, always. We deliberately ignore the visitor's OS
// dark-mode setting and any previously saved "edurackin-theme" value, because
// the whole product (landing page, PYQ practice, tests) is designed and
// checked in light. The `.dark` CSS tokens in styles.css stay in the file but
// are never switched on.
//
// The provider/hook API is kept so existing `useTheme()` callers don't break.
type ThemeProviderState = {
  theme: "light";
  resolvedTheme: "light";
};

const ThemeProviderContext = createContext<ThemeProviderState>({ theme: "light", resolvedTheme: "light" });

const STORAGE_KEY = "edurackin-theme";

function pinLight() {
  const root = document.documentElement;
  root.classList.remove("dark");
  root.style.colorScheme = "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    pinLight();
    try {
      // Drop any old saved choice (e.g. "dark" or "system") so it can never come back.
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // storage can be blocked; nothing to clean up then
    }
    // Belt and braces: if anything re-adds the `dark` class, strip it again.
    const observer = new MutationObserver(() => {
      if (document.documentElement.classList.contains("dark")) pinLight();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return <ThemeProviderContext.Provider value={{ theme: "light", resolvedTheme: "light" }}>{children}</ThemeProviderContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeProviderContext);
}
