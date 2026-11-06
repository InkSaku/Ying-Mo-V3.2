import greeting from "../assets/ink/spark-letter-matchbox-v1.webp";
import "../styles/spark-icons.css";

export function SparkGreetingArt({ className = "" }) {
  return <span className={`spark-art ${className}`} aria-hidden="true"><img src={greeting} width="768" height="512" alt="" draggable="false" /></span>;
}

export function SparkLetterArt({ className = "" }) {
  return <svg className={`spark-letter-art ${className}`} viewBox="0 0 88 80" fill="none" aria-hidden="true" focusable="false">
    <path d="m11 32 54-12 13 43-56 12L11 32Z" fill="currentColor" />
    <path d="m15 34 47-10 11 36-48 11-10-37Z" className="spark-art-paper" />
    <path d="m15 34 30 17 17-27-20 23-27-13Z" className="spark-art-accent" />
    <path d="m25 71 15-25 2 2-14 22-3 1Zm48-11L50 44l-2 2 22 16 3-2Z" fill="currentColor" />
  </svg>;
}

export function SparkNoticeArt() {
  return <svg className="spark-notice-art" viewBox="0 0 248 164" fill="none" aria-hidden="true" focusable="false">
    <path d="m42 68 90-31 61 35-89 32-62-36Z" fill="currentColor" />
    <path d="m48 69 84-28 52 30-81 28-55-30Z" className="spark-art-cutout" />
    <path d="m42 68 4 50 61 35-3-49-62-36Z" fill="currentColor" />
    <path d="m49 78 3 36 48 29-2-36-49-29Z" className="spark-art-cutout" />
    <path d="m104 104 89-32 3 48-89 33-3-49Z" fill="currentColor" />
    <path d="m110 108 77-28 2 35-78 29-1-36Z" className="spark-art-paper" />
    <path d="m119 105 62-23 1 8-62 23-1-8Z" className="spark-art-accent" />
    <path d="m126 121 50-18 1 3-51 18v-3Zm1 8 50-18 1 2-51 19v-3Z" fill="currentColor" />
    <path d="m80 70 59-20 26 15-59 21-26-16Z" fill="currentColor" />
    <path d="m88 69 49-16 18 11-49 18-18-13Z" className="spark-art-paper" />
    <path d="m99 68 7 4 31-11-7-4-31 11Zm12 7 7 4 30-11-6-4-31 11Z" fill="currentColor" />
    <path d="M172 19c-4-4-9-4-12 0-2 3-1 7 2 9 4 2 8 0 10-3 1-2 1-4 0-6Z" className="spark-art-accent" />
    <path d="m162 28-17 25 4 2 17-25-4-2Z" fill="currentColor" />
  </svg>;
}
