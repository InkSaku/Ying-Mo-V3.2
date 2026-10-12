// The approved bookroom cat: crooked ears, a curled tail and a blue bookmark.
// Every walk frame shares the same head and body so the small drawing stays steady.
const head = "M39 51c-4-8-5-18-3-26 9 3 15 9 19 15 9-4 16-4 24-1 5-8 12-13 20-14-1 11-4 20-9 26 6 6 9 13 8 22-2 14-14 24-29 23-16-1-28-10-29-23-1-8 1-15-1-22Z";
const face = "M49 67l1 3m21-4 1 3M55 78c3 3 7 4 10 0m-9-1 1-3M28 76l10-1m-11 10 12-3m49-4 13 1m-12 6 12 3";
const back = "M93 81c18-14 43-18 63-5 14 9 21 22 20 38";
const tail = "M173 90c18-7 25-21 27-37 2-13-5-22-14-22-7 0-10 6-7 12 2 5 8 7 13 6";
const ear = "M39 51c-3-7-4-16-3-24 7 3 14 9 18 15l-15 9Z";
const nose = "m53 74 5-1 2 3-4 2-3-4Z";
const bookmark = "M80 96l-1 16 6-4 5 4-1-19";
const poses = [
  {
    front: "M68 96c-2 12-10 18-18 28-13-1-17 5-9 8l19 1 20-19m5-20c1 10 10 16 13 27 1 6-5 9-10 11-11-1-15 5-7 8l17 1c10-3 17-19 12-30m1 0c11 5 25 6 40 2",
    rear: "M157 104c1 11 13 21 13 29-10-2-14 4-7 7l16 1c9-2 5-15 1-26m-56-7c-2 11 8 13 9 20-11-2-15 4-7 7l16 2 10-12",
  },
  {
    front: "M68 96c-4 11-13 15-25 23-12-1-16 5-8 8l17 2 28-15m5-20c-3 17-7 25-18 35-12-1-17 5-9 8l18 1c13-2 23-13 29-28m6 1c11 5 25 6 40 2",
    rear: "M157 104c7 11 19 17 26 27-10-1-13 4-6 7l18 2c5-3 3-9-5-15l-12-12m-54-5c2 12 10 17 12 25-10-1-13 4-6 7l16 1 5-12",
  },
  {
    front: "M68 96c1 14 8 20 16 28-11-1-15 4-8 7l17 1 3-11m-11-27c2 14 14 20 21 30-10-1-14 5-6 8l14 2c7-4 6-12-4-23m1 0c11 5 25 6 40 2",
    rear: "M157 104c-6 11-15 20-25 29-11-1-14 4-7 7l17 1 22-16m-40-17c-2 10-7 15-16 20-11-1-14 4-7 7l16 2 20-12m38-10c4 5 6 9 5 13",
  },
  {
    front: "M68 96c-3 12-10 24-21 35-11-1-15 4-7 7l17 1 23-25m5-20c2 10 9 15 13 23-10-1-14 4-7 7l16 2 3-15m1 0c11 5 25 6 40 2",
    rear: "M157 104c1 13 8 23 15 28-11-1-14 4-7 7l18 2c5-4 3-16-3-26m-56-7c6 10 17 14 24 20-11-1-14 4-7 7l17 2 12-12",
  },
];

export default function ArchiveCatDrawing() {
  return (
    <svg className="bookroom-cat" viewBox="0 0 240 150" aria-hidden="true" focusable="false">
      {poses.map((pose, index) => (
        <g key={index} className={`archive-cat-pose archive-cat-pose-${index}`}>
          <g className="archive-cat-outline">
            <path d={tail} />
            <path d={back} />
            <path d={pose.rear} />
            <path d={pose.front} />
            <path d={head} />
            <path d={face} />
          </g>
          <path className="archive-cat-ink" d={ear} />
          <path className="archive-cat-ink" d={nose} />
          <path className="archive-cat-accents" d={bookmark} />
          <path className="archive-cat-speed" d="M190 145l12-2m-171 1 12 1" />
        </g>
      ))}
      <g className="archive-cat-stretch">
        <g className="archive-cat-outline">
          <path d="M75 99c17-1 28-10 39-22 10-11 18-16 28-14 16 2 27 22 31 43m-8-20c21-5 26-22 23-37-2-10-9-13-14-8-4 4 1 13 8 12" />
          <path d="M164 96c1 13 14 27 11 36-10-2-14 4-7 7l15 1c8-2 8-12 2-24m-43-24c-3 12 0 21 10 30-10-2-14 4-7 7l17 2 8-10" />
          <path d="M57 121c-8 6-20 8-32 11-9 2-9 7 0 8l26-1 32-8m-12-10c-2 7-8 14-15 17-13-2-18 3-9 6l20 1c11-2 24-11 34-21m1-1c11-1 23-7 35-11" />
          <path d="M43 97l-7-17c9 1 15 6 19 12 8-2 15-1 23 3l17-8-7 22c1 13-9 20-23 18-14-2-23-9-24-19-1-4 0-8 2-11Z" />
          <path d="M48 107c4-3 7-3 10 0m12 1c4-3 7-2 9 1m-17 7c3 3 6 3 9 0M26 110l14 1m-12 8 13-3" />
        </g>
        <path className="archive-cat-ink" d="M43 97l-5-15 14 11-9 4Zm15 16 5-1 2 3-5 1-2-3Z" />
        <path className="archive-cat-accents" d="M77 124l3 15 5-5 5 1-3-14" />
      </g>
    </svg>
  );
}
