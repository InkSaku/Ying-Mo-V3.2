// 手绘插画约 9.5 KiB（gzip），从入口包移出：第一次用到时整组读取一次，应用空闲时也会提前取，之后同步渲染。
let library = null;
let loading = null;

export function inkSketchLibrary() {
  return library;
}

export function loadInkSketches() {
  if (library) return Promise.resolve(library);
  loading ||= import("./inkSketchLibrary")
    .then((module) => {
      library = module.inkSketches;
      return library;
    })
    .catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}

// 读取完成前按原图比例占位，插画出现时版面不跳动。
export const INK_SKETCH_RATIOS = {
  reader: "240 / 220",
  volumes: "320 / 180",
  wanderer: "360 / 170",
  letter: "240 / 180",
  welcome: "400 / 280",
  writer: "320 / 190",
  search: "270 / 190",
  archive: "280 / 185",
  memory: "280 / 190",
  camera: "280 / 190",
  garden: "280 / 190",
  steward: "300 / 190",
  place: "300 / 195",
  labels: "300 / 190",
  thread: "380 / 200",
  packed: "320 / 210",
  inbox: "320 / 210",
  keys: "320 / 210",
  pocket: "320 / 210",
  rewind: "320 / 210",
  pages: "320 / 210",
  pencil: "320 / 210",
  shelf: "320 / 210",
  bookmark: "320 / 210",
  replies: "320 / 210",
  detour: "320 / 190",
  spark: "246 / 164",
  sparkCalendar: "320 / 220",
  sparkGreeting: "320 / 220",
};
