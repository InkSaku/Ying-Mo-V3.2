import reader from "../assets/ink/slow-reader.svg?raw";
import volumes from "../assets/ink/shared-volumes.svg?raw";
import wanderer from "../assets/ink/leaf-wanderer.svg?raw";
import letter from "../assets/ink/first-letter.svg?raw";
import welcome from "../assets/ink/welcome-door.svg?raw";
import writer from "../assets/ink/writing-desk.svg?raw";
import search from "../assets/ink/search-lens.svg?raw";
import archive from "../assets/ink/archive-keeper.svg?raw";
import memory from "../assets/ink/memory-calendar.svg?raw";
import camera from "../assets/ink/camera-keeper.svg?raw";
import garden from "../assets/ink/garden-care.svg?raw";
import steward from "../assets/ink/library-steward.svg?raw";
import place from "../assets/ink/place-page.svg?raw";
import labels from "../assets/ink/hang-word.svg?raw";
import thread from "../assets/ink/topic-thread.svg?raw";
import packed from "../assets/ink/packed-stories.svg?raw";
import inbox from "../assets/ink/inbox-bird.svg?raw";
import keys from "../assets/ink/door-key.svg?raw";
import pocket from "../assets/ink/pocket-library.svg?raw";
import rewind from "../assets/ink/page-rewind.svg?raw";
import pages from "../assets/ink/kept-pages.svg?raw";
import pencil from "../assets/ink/patient-pencil.svg?raw";
import shelf from "../assets/ink/story-shelf.svg?raw";
import bookmark from "../assets/ink/saved-bookmark.svg?raw";
import replies from "../assets/ink/tea-replies.svg?raw";
import detour from "../assets/ink/paper-detour.svg?raw";
import spark from "../assets/ink/spark-companion.svg?raw";
import sparkCalendar from "../assets/ink/spark-calendar.svg?raw";
import sparkGreeting from "../assets/ink/spark-greeting.svg?raw";
import "../styles/ink-sketches.css";

const sketches = { reader, volumes, wanderer, letter, welcome, writer, search, archive, memory, camera, garden, steward, place, labels, thread, packed, inbox, keys, pocket, rewind, pages, pencil, shelf, bookmark, replies, detour, spark, sparkCalendar, sparkGreeting };

export function InkSketch({ variant = "letter", className = "" }) {
  return <span
    className={`ink-sketch ink-sketch-${variant} ${className}`}
    aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: sketches[variant] || letter }}
  />;
}
