// 代码字体是读者在本设备上的偏好，只作用于代码块与行内代码，不改变正文字体。
// 字体栈定义在 index.css 的 --code-font-* 变量里，这里只负责选择与记忆。
const STORAGE_KEY = "yingmo-code-font";

export const DEFAULT_CODE_FONT = "jetbrains";

export const CODE_FONTS = [
  { id: "jetbrains", label: "JetBrains Mono" },
  { id: "fira", label: "Fira Code" },
  { id: "cascadia", label: "Cascadia Code" },
  { id: "source", label: "Source Code Pro" },
  { id: "system", label: "系统等宽" },
];

const knownFonts = new Set(CODE_FONTS.map((font) => font.id));

export function readCodeFont() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return knownFonts.has(saved) ? saved : DEFAULT_CODE_FONT;
  } catch {
    return DEFAULT_CODE_FONT;
  }
}

export function applyCodeFont(id) {
  const root = document.documentElement;
  if (id === DEFAULT_CODE_FONT || !knownFonts.has(id)) delete root.dataset.codeFont;
  else root.dataset.codeFont = id;
}

export function saveCodeFont(id) {
  if (!knownFonts.has(id)) return;
  applyCodeFont(id);
  try {
    if (id === DEFAULT_CODE_FONT) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, id);
  } catch { /* 无法写入存储时，本次浏览仍然生效。 */ }
}
