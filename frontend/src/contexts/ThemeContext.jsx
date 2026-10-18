import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { cancelThemeInk, playThemeInk } from "../lib/themeInk";

const ThemeContext = createContext(null);
const STORAGE_KEY = "yingmo_theme";

function resolveTheme(mode) {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(next) {
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.setAttribute("content", next === "dark" ? "#20231f" : "#f8f7f3");
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return ["system", "light", "dark"].includes(saved) ? saved : "system";
  });
  const [resolved, setResolved] = useState(() => resolveTheme(mode));
  const modeRef = useRef(mode);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const next = resolveTheme(modeRef.current);
      setResolved(next);
      applyTheme(next);
    };
    const systemChanged = () => {
      if (modeRef.current !== "system") return;
      cancelThemeInk();
      apply();
    };
    apply();
    media.addEventListener?.("change", systemChanged);
    return () => { media.removeEventListener?.("change", systemChanged); cancelThemeInk(); };
  }, []);

  const changeMode = useCallback((next, { origin, animate = true } = {}) => {
    if (!["system", "light", "dark"].includes(next)) return;
    const nextTheme = resolveTheme(next);
    modeRef.current = next;
    const update = () => {
      flushSync(() => { setMode(next); setResolved(nextTheme); applyTheme(nextTheme); });
      localStorage.setItem(STORAGE_KEY, next);
    };
    if (!animate || nextTheme === document.documentElement.dataset.theme) {
      cancelThemeInk();
      update();
    } else playThemeInk(update, { origin, theme: nextTheme });
  }, []);

  const value = useMemo(() => ({ mode, resolved, setMode: changeMode }), [mode, resolved, changeMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme 必须在 ThemeProvider 中使用");
  return value;
}
