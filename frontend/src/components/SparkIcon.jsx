import "../styles/spark-icons.css";

const paths = {
  scan: <><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3" /><path d="M8 8h3v3H8zm5 0h3v3h-3zm-5 5h3v3H8zm5 0h3v3h-3z" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  verified: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  refresh: <><path d="M20 8a8.5 8.5 0 0 0-14-3L3 8m0-5v5h5m-4 8a8.5 8.5 0 0 0 14 3l3-3m-5 0h5v5" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  send: <><path d="m21 3-6.5 18-4-7.5L3 9.5 21 3Zm0 0L10.5 13.5" /></>,
  play: <path d="m8 5 11 7-11 7V5Z" />,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  external: <path d="M6 18 18 6M6 6h12v12" />,
  expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
  collapse: <path d="M3 8h5V3m8 0v5h5M8 21v-5H3m13 5v-5h5" />,
  alert: <><path d="m10.4 4.9-8 14a1.8 1.8 0 0 0 1.6 2.6h16a1.8 1.8 0 0 0 1.6-2.6l-8-14a1.8 1.8 0 0 0-3.2 0Z" /><path d="M12 10v4m0 3v.1" /></>,
  server: <><rect x="4" y="4" width="16" height="7" rx="2" /><rect x="4" y="14" width="16" height="7" rx="2" /><path d="M8 7.5h.1M8 17.5h.1m7-10h2m-2 10h2" /></>,
  flame: <path d="M13 3c1 5-4 6-4 10 2-1 3-3 3-4 4 3 6 5 6 8a6 6 0 0 1-12 0c0-4 4-6 4-10 1 1 2 2 2 3 2-3 2-5 1-7Z" />,
  stopped: <rect x="6" y="6" width="12" height="12" rx="1" />,
};

export function SparkIcon({ name, className = "" }) {
  return <svg className={`spark-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name] || paths.alert}</svg>;
}
