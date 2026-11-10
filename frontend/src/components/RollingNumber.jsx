import { useEffect, useState } from "react";
import "../styles/rolling-number.css";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
// 至少等一帧，让起始数字先画出来，滚动才看得见。
const MIN_DELAY = 40;

// 数字变化时每一位沿纸条滚到新值；读屏只读真实数字，减少动态时直接换。
export function RollingNumber({ value, from = value, delay = 0, className = "" }) {
  const [shown, setShown] = useState(from);

  useEffect(() => {
    const timer = window.setTimeout(() => setShown(value), Math.max(delay, MIN_DELAY));
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  const text = String(shown);
  return <span className={`rolling-number${className ? ` ${className}` : ""}`}>
    <span className="sr-only">{value}</span>
    <span className="rolling-number-digits" aria-hidden="true">
      {Array.from(text, (char, index) => {
        // 位数按个位往左对齐，99 变 100 时原来的两位继续滚，只新添最高位。
        const place = text.length - index;
        if (!/\d/.test(char)) return <span key={`sign-${place}`} className="rolling-number-sign">{char}</span>;
        return <span key={place} className="rolling-digit" style={{ "--digit": Number(char), "--place": place }}>
          <span className="rolling-digit-ghost">{char}</span>
          <span className="rolling-digit-strip">{DIGITS.map((digit) => <span key={digit}>{digit}</span>)}</span>
        </span>;
      })}
    </span>
  </span>;
}
