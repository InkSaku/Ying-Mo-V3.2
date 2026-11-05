import { Link } from "react-router-dom";
import matchboxArt from "../assets/ink/spark-matchbox-v1.webp";

export function HomeSparkEntry() {
  return <Link className="home-spark-entry" to="/tools/spark" aria-label="续火花助手，设置抖音好友的每日问候">
    <span className="home-spark-entry-copy">
      <strong>续火花助手</strong>
      <span className="home-spark-entry-hint">抖音好友的每日问候</span>
    </span>
    <span className="home-spark-entry-art" aria-hidden="true">
      <img src={matchboxArt} alt="" width="480" height="360" loading="lazy" decoding="async" />
    </span>
    <span className="home-spark-entry-action" aria-hidden="true">
      去设置
      <svg viewBox="0 0 24 16" fill="none"><path d="M2 8h19m-6-5 6 5-6 5" /></svg>
    </span>
  </Link>;
}
