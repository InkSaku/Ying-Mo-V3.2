import "../styles/spark-seal.css";

// 当天续上的小印：靛蓝印泥、纸色阴文，边缘留几处没吃透的纸白。
export function SparkSeal({ pressing = false, className = "" }) {
  return <svg className={`spark-seal${pressing ? " is-pressing" : ""}${className ? ` ${className}` : ""}`} viewBox="0 0 28 42" aria-hidden="true" focusable="false">
    <path className="spark-seal-ink" d="M2.1 1.8 9.6 1l8.1.4 8.4-.5.9 8.8-.5 9.7.6 10.4-.4 11.1-8.3.4-7.9-.6-8.6.5-.8-10.2.4-10.6-.6-9.9Z" />
    <path className="spark-seal-frame" d="M4.6 4.2 13.8 3.8l9.6.3.4 16.5-.3 17.2-9.6.3-9.5-.2-.2-17.5Z" />
    <text x="14" y="18.6">已</text>
    <text x="14" y="35.4">续</text>
    <path className="spark-seal-speck" d="M6.2 10.1 7.6 9.8l.2 1-1.3.2Zm15.6 19.7.9-.5.4.9-.9.4Zm-4.1 8.4 2.6-.1v.7l-2.6.1ZM3.3 24.6l.6-.1.1 2.1-.6.1Z" />
  </svg>;
}
