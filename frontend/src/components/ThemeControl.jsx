import { CustomSelect } from "./CustomSelect";
import { useTheme } from "../contexts/ThemeContext";

export function ThemeControl() {
  const { mode, setMode } = useTheme();
  return (
    <label className="theme-control">
      <span>主题</span>
      <CustomSelect value={mode} onChange={(event) => setMode(event.target.value)} aria-label="主题模式">
        <option value="system">跟随系统</option>
        <option value="light">浅色</option>
        <option value="dark">深色</option>
      </CustomSelect>
    </label>
  );
}
