import paperBallImage from "../assets/paper/crumpled-paper-ink.png";

// 只预读站点自己的静态插画；删除成功时不再等待图片首次解码。
const image = new Image();
image.src = paperBallImage;
export const paperBallReady = image.decode().then(() => true, () => false);

// 从插画 alpha 外缘采样，保留翘起的纸角。收拢路径与最终插画共用这一圈点。
export const PAPER_BALL_EDGE = [
  [18.24,18.24],[19.16,10.24],[23.28,5.05],[36.95,16.87],[42.66,18.14],[47.8,19.78],[51.28,16.17],[55.34,12.73],
  [60,11.09],[64.66,12.73],[69.21,13.72],[73.2,16.49],[77.64,17.41],[82.39,18.11],[87.17,19.34],[91.22,21.95],
  [94.25,25.75],[96.84,29.77],[100.92,32.66],[105.34,35.77],[104.03,41.76],[104.71,46.44],[107.2,50.61],[109.76,55.1],
  [111.41,60],[113.18,65.24],[110.72,70.09],[109.49,75.01],[108.21,79.97],[105.2,84.16],[103.65,89.17],[105.29,97.17],
  [101.43,101.43],[96.87,104.93],[90.9,106.25],[84.9,106.58],[81.11,110.96],[76.96,115.92],[71.07,115.63],[65.57,116.6],
  [60,116.41],[54.43,116.6],[48.54,117.62],[43.58,114.13],[37.58,114.13],[31.13,114.02],[25.8,111.19],[21.64,106.74],
  [18.57,101.43],[12.89,98.66],[9.72,93.59],[8.05,87.77],[8.03,81.53],[7.82,75.83],[7.13,70.52],[9,65.02],
  [10.31,60],[9.62,55.04],[12.49,50.55],[16.19,46.71],[22.18,44.33],[21.55,39.45],[20.89,33.87],[18.45,25.9],
];

let illustrationId = 0;

export function createPaperBallArt() {
  const id = `ym-crumpled-paper-${++illustrationId}`;
  // alpha 保留纸团外缘，亮度保留原画的枯笔。纸面和墨迹分别用站点语义色绘制。
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" class="paper-ball-art" viewBox="0 0 120 120" width="120" height="120" aria-hidden="true" focusable="false">
    <defs>
      <filter id="${id}-ink" color-interpolation-filters="sRGB">
        <feComponentTransfer>
          <feFuncR type="table" tableValues="1 1 .9 .62 .32 .08 0 0 0"/>
          <feFuncG type="table" tableValues="1 1 .9 .62 .32 .08 0 0 0"/>
          <feFuncB type="table" tableValues="1 1 .9 .62 .32 .08 0 0 0"/>
        </feComponentTransfer>
      </filter>
      <mask id="${id}-paper" x="0" y="0" width="120" height="120" maskUnits="userSpaceOnUse" mask-type="alpha">
        <image href="${paperBallImage}" width="120" height="120"/>
      </mask>
      <mask id="${id}-marks" x="0" y="0" width="120" height="120" maskUnits="userSpaceOnUse" mask-type="luminance">
        <image href="${paperBallImage}" width="120" height="120" filter="url(#${id}-ink)"/>
      </mask>
    </defs>
    <rect class="paper-ball-paper" width="120" height="120" fill="var(--crumple-paper, var(--page))" mask="url(#${id}-paper)"/>
    <rect width="120" height="120" fill="currentColor" mask="url(#${id}-marks)"/>
  </svg>`;
  return new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
}
