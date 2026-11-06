// Layered version of designs/spark-entry-door/spark-door-states-v1.png.
// Filled, uneven contours keep the brush weight while the door and feet move independently.
export function SparkDoorArt() {
  return <span className="spark-door" aria-hidden="true">
    <svg className="spark-door-frame" viewBox="0 0 220 230" fill="currentColor" focusable="false">
      <path fillRule="evenodd" d="M87 215 86 39c-.6-12-1-17 6-20 21-7 76-7 102-1 7 1 9 6 8 15l1 181-5 2-1-179c1-10 0-12-7-13-28-5-69-5-92 0-6 1-7 5-6 13l1 177-6 1Z" />
      <path d="m87 47-1 58 2 16 1-62 1-17-3 5Zm5-25 24-5 54-1 22 4-27-2-47 1-26 5v-2Zm107 76 1 50-1 56 3-15-1-80-2-11Z" opacity=".65" />
      <path fill="var(--page)" d="m88 43 .7 29 1-10-.4-23-1.3 4Zm28-24 22-1 17 1-26 1-13-1Zm84 91 .5 34 1-16-.3-22-1.2 4Z" />
      <path d="m16 217 25-2 35 1 48-1 39 1 35-1 14 2-3 2-47 1-39-1-50 1-39-1-21 .5 3-2.5Z" />
    </svg>

    <svg className="spark-door-mascot" viewBox="0 0 220 230" fill="currentColor" focusable="false">
      <g className="spark-door-leg spark-door-leg-left">
        <path d="m47 183 7 2-6 23c-1 3-1 4 2 4l6 1 1 4-25 1c-4 0-5-2-2-5 3-3 7-4 11-3l6-27Z" />
      </g>
      <g className="spark-door-leg spark-door-leg-right">
        <path d="m76 184 6 1-2 25 13 1c5 1 7 6 2 7l-24 .3-2-3 3-9 4-22Z" />
      </g>
      <path d="M36 163c-8 4-13 12-12 20 0 3 2 6 3 6 3 1 3-2 2-4-2-7 3-12 9-16l-2-6Z" />
      <path d="M30 139c5-11 14-18 25-21 11-4 22-1 30 5 10 6 16 18 17 30 2 14-2 27-12 35-9 9-24 12-36 8-13-3-23-13-26-25-4-11-3-23 2-32Z" />
      <path d="m33 141 5-10 11-8-8 8-6 13-4 14 2-17Zm51-15 10 12 5 20-3-14-7-12-5-6Z" opacity=".65" />
      <path fill="var(--page)" d="m35 142 1-5 3-4-2 7-2 2Zm9-14 4-3 3-.5-4 2-3 1.5Zm-13 35 1 6 2 3-1-6-2-3Zm51 26 4-2 3-3-4 2-3 3Z" opacity=".55" />
      <g className="spark-door-face" fill="var(--page)">
        <path d="M53 142c2-1 3 1 3 3l1 5c0 3-3 4-4 1l-1-6c0-1 0-2 1-3Zm18-3c2-.6 3 1 3 3l1 5c0 3-3 4-4 1l-1-6c0-1 0-2 1-3Z" />
        <path d="M55 162c5 5 11 7 17 2l5-4c2-2 4 0 2 3-7 11-18 10-26 2-2-2 0-5 2-3Z" />
      </g>
    </svg>

    <span className="spark-door-leaf">
      <svg viewBox="0 0 90 184" fill="currentColor" preserveAspectRatio="none" focusable="false">
        <path fill="var(--page)" d="M3 4 87 3l1 178-86 .5L3 4Z" />
        <path fillRule="evenodd" d="M0 4c0-3 2-4 5-4l80 1c4 0 5 2 4 6l1 171c0 4-1 6-5 6l-81-.5c-4 0-4-2-4-6L0 4Zm5 2-.2 171 79 .8L84 6 5 6Z" />
        <path d="m2 13 1 23-1 42-1-34 1-31Zm10-12 37 1 27-1-25 3-39-1V1Zm74 97 1 55-1 18-1-50 1-23Z" opacity=".6" />
        <path fill="var(--page)" d="m2 24 1 17-1 15-.4-15.5.4-16.5Zm14-21 15-.5 14 1-20 .5-9-1Zm71 109 .6 28-.6 15-.5-23 .5-20Z" />
        <path d="m23 106 4-1-1 30c0 4-4 4-4 0l1-29Z" />
        <path fill="var(--brand-link)" d="M21 104c-2-3-1-8 2-10 3-2 7-1 8 3 1 4-1 9-5 10-2 1-4 0-5-3Z" />
      </svg>
    </span>

    <svg className="spark-door-arm" viewBox="0 0 220 230" fill="currentColor" focusable="false">
      <g className="spark-door-reach">
        <path d="M91 165c9-2 14-12 23-14 4-1 7-1 9 1l-1 4c-4-2-7-1-10 2-5 4-10 11-19 12l-2-5Z" />
      </g>
    </svg>
  </span>;
}
