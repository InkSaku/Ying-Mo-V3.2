import { useTheme } from "../contexts/ThemeContext";

const modes = ["system", "light", "dark"];
const labels = { system: "跟随系统", light: "浅色", dark: "深色" };

export function ThemeControl() {
  const { mode, setMode } = useTheme();
  const next = modes[(modes.indexOf(mode) + 1) % modes.length];
  const label = `当前主题：${labels[mode]}，点击切换为${labels[next]}`;
  return (
    <button className="theme-toggle" type="button" onClick={(event) => {
      const box = event.currentTarget.getBoundingClientRect();
      setMode(next, { origin: { x: box.x + box.width / 2, y: box.y + box.height / 2 } });
    }} aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {mode === "light" ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5" /></> : null}
        {mode === "dark" ? <path d="M20.5 14A8.7 8.7 0 0 1 10 3.5 8.7 8.7 0 1 0 20.5 14Z" /> : null}
        {mode === "system" ? <><rect x="3" y="4" width="18" height="13" rx="1.5" /><path d="M8 21h8m-4-4v4" /><path d="M12 7a3.5 3.5 0 0 0 0 7Z" fill="currentColor" stroke="none" /><path d="M12 7a3.5 3.5 0 0 1 0 7" /></> : null}
      </svg>
    </button>
  );
}
