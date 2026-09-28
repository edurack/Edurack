// src/lib/use-force-light-theme.ts
//
// Pins the page to the light theme while a component is mounted, no matter
// what the visitor's saved theme or OS setting says.
//
// Why this exists: the site-wide ThemeProvider toggles the `dark` class on
// <html>, which flips every CSS variable (and the ".dark" safety-net rules in
// styles.css) for the whole document. The admin dashboard is a light-only
// surface, so on mount we strip that class, and a MutationObserver keeps it
// stripped if the ThemeProvider re-applies it (e.g. the OS flips to dark mode
// while the dashboard is open). On unmount the previous state is restored, so
// leaving the admin area puts the public site back exactly as the visitor had it.
import { useLayoutEffect } from "react";

export function useForceLightTheme() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    const prevColorScheme = root.style.colorScheme;

    function enforce() {
      if (root.classList.contains("dark")) root.classList.remove("dark");
      if (root.style.colorScheme !== "light") root.style.colorScheme = "light";
    }

    enforce();

    const observer = new MutationObserver(enforce);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "style"] });

    return () => {
      observer.disconnect();
      if (hadDark) root.classList.add("dark");
      root.style.colorScheme = prevColorScheme;
    };
  }, []);
}
