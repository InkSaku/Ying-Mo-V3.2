import { Link } from "react-router-dom";

function InkSparkRunner() {
  return <svg viewBox="0 0 156 142" fill="none" role="img" aria-label="小墨团举着一簇火花">
    <g className="home-spark-runner-lines" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 119c10-2 19-3 28-3m69 1c8 0 14 1 21 3" strokeWidth="1.2" opacity=".5" />
      <path d="M40 62c-4-17 4-33 17-42 12-8 29-10 43-3 18 8 29 29 24 51-2 12-10 23-21 30-13 8-30 10-44 4C47 97 40 83 40 62Z" strokeWidth="2.1" />
      <path d="M49 43c-3 8-4 15-3 22m43-48c-14-3-25 0-34 8" strokeWidth="1.1" opacity=".55" />
      <path d="m57 94-10 16m54-14 10 16m-56-4-12 4 2 5 15-1m47-7 13 5-2 5-17-3" strokeWidth="1.8" />
      <path d="M42 76c-10 5-17 2-23-6m100-2c10-2 16-10 17-19" strokeWidth="1.8" />
      <path d="M69 58v4m23-6v4m-21 15c7 6 17 5 23-2" strokeWidth="2.2" />
      <path d="M30 131h89m9 0h9" strokeWidth="1" opacity=".46" />
    </g>
    <g className="home-spark-runner-flame" stroke="var(--brand-link)" strokeLinecap="round" strokeLinejoin="round">
      <path d="M129 19c-1 10-11 15-8 26 3-2 5-5 6-8 7 8 7 17 2 22-6 6-17 5-21-2-5-8 0-16 4-22 0 4 2 7 5 9-2-11 4-17 12-25Z" strokeWidth="2" />
      <path d="M120 47c-3 4-4 7-1 10 4 2 8-1 7-5" strokeWidth="1.5" />
      <path d="m103 17-4-5m42 11 5-4m-6 46 5 4M123 5V1" strokeWidth="1.3" />
    </g>
    <path className="home-spark-runner-star" d="m29 28 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Zm113 55 1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5 1.5-3.5Z" stroke="var(--brand-link)" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>;
}

export function HomeSparkEntry() {
  return <Link className="home-spark-entry is-docked" to="/tools/spark" aria-label="进入续火花助手">
    <span className="home-spark-entry-art"><InkSparkRunner /></span>
    <span className="home-spark-entry-copy">
      <span className="home-spark-entry-kicker">映墨工具</span>
      <strong>续火花助手</strong>
      <span className="home-spark-entry-hint">设置抖音每日问候 <span aria-hidden="true">↗</span></span>
    </span>
  </Link>;
}
