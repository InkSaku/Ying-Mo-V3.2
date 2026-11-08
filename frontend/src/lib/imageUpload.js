export const IMAGE_FORMAT_LABEL = "JPEG/JPG、PNG、WebP、HEIC/HEIF、GIF、BMP、TIFF、AVIF";

const acceptedMimeTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/pjpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/bmp",
  "image/x-bmp",
  "image/x-ms-bmp",
  "image/tiff",
  "image/x-tiff",
  "image/avif",
]);
const imageExtensions = [".jpg", ".jpeg", ".jpe", ".jfif", ".png", ".webp", ".heic", ".heif", ".gif", ".bmp", ".tif", ".tiff", ".avif"];
export const IMAGE_ACCEPT = [...acceptedMimeTypes, ...imageExtensions].join(",");
const acceptedExtensions = /\.(?:jpe?g|jpe|jfif|png|webp|heic|heif|gif|bmp|tiff?|avif)$/i;
const heicExtensions = /\.(?:heic|heif)$/i;

function imageMimeType(file) {
  return String(file?.type || "").split(";")[0].trim().toLowerCase();
}

export function isAcceptedImageFile(file) {
  return Boolean(file) && (acceptedMimeTypes.has(imageMimeType(file)) || acceptedExtensions.test(file.name || ""));
}

export function isHeicImage(file) {
  return Boolean(file) && (["image/heic", "image/heif"].includes(imageMimeType(file)) || heicExtensions.test(file.name || ""));
}

export function shouldOptimizeImage({ byteSize, width, height }, {
  maxBytes = 8 * 1024 * 1024,
  maxDimension = 4096,
} = {}) {
  return byteSize > maxBytes || width > maxDimension || height > maxDimension;
}

function optimizedFilename(name) {
  const base = String(name || "image").replace(/\.[^.]+$/, "") || "image";
  return `${base}-optimized.webp`;
}

function canvasBlob(canvas, type, quality, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    canvas.toBlob((blob) => {
      if (signal?.aborted) reject(new DOMException("Aborted", "AbortError"));
      else resolve(blob);
    }, type, quality);
  });
}

export async function prepareImageForUpload(file, {
  signal,
  onStage,
  maxBytes = 8 * 1024 * 1024,
  maxDimension = 4096,
  quality = 0.88,
} = {}) {
  if (!isAcceptedImageFile(file)) throw new TypeError(`图片格式暂不支持，请选择 ${IMAGE_FORMAT_LABEL} 图片。`);
  // Keep animated GIFs and multi-page TIFF originals intact for server decoding.
  const preserveOriginal = ["image/gif", "image/tiff", "image/x-tiff"].includes(imageMimeType(file))
    || /\.(?:gif|tiff?)$/i.test(file.name || "");
  if (isHeicImage(file) || preserveOriginal || typeof createImageBitmap !== "function") {
    return { file, optimized: false, originalBytes: file.size, uploadBytes: file.size };
  }

  onStage?.("正在检查图片");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return { file, optimized: false, originalBytes: file.size, uploadBytes: file.size };
    }
  }
  try {
    if (!shouldOptimizeImage({ byteSize: file.size, width: bitmap.width, height: bitmap.height }, { maxBytes, maxDimension })) {
      return { file, optimized: false, originalBytes: file.size, uploadBytes: file.size };
    }
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    onStage?.("正在优化大图");
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return { file, optimized: false, originalBytes: file.size, uploadBytes: file.size };
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvasBlob(canvas, "image/webp", quality, signal);
    if (!blob || blob.size >= file.size) {
      return { file, optimized: false, originalBytes: file.size, uploadBytes: file.size };
    }
    const optimized = new File([blob], optimizedFilename(file.name), {
      type: "image/webp",
      lastModified: file.lastModified,
    });
    // 浏览器重新编码会丢掉 EXIF；压缩前先从原图读出拍摄时间，供“发生时间”建议使用。
    const capturedAt = await readJpegCaptureTime(file).catch(() => null);
    return { file: optimized, optimized: true, originalBytes: file.size, uploadBytes: optimized.size, capturedAt };
  } finally {
    bitmap.close();
  }
}

export function uploadProgressLabel(state) {
  if (!state) return "";
  const position = state.totalFiles > 1 ? `${state.currentFile}/${state.totalFiles} · ` : "";
  const percent = Number.isInteger(state.percent) ? ` ${state.percent}%` : "";
  return `${position}${state.stage || "正在上传"}${percent}`;
}

// 照片拍摄时间统一成 datetime-local 使用的当地时间 "YYYY-MM-DDTHH:MM"；明显不合理的年份视为没有。
export function normalizeCaptureTime(value) {
  const match = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})/.exec(String(value || "").trim());
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  if (Number.isNaN(date.getTime()) || date.getMonth() !== Number(month) - 1 || Number(year) < 1990 || date.getTime() > Date.now() + 2 * 86400000) return null;
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

// 只读 JPEG 的 EXIF DateTimeOriginal（0x9003），用于浏览器压缩大图的情况；原样上传的照片由后端读取。
export async function readJpegCaptureTime(file) {
  if (!/jpe?g/i.test(file?.type || "") && !/\.jpe?g$/i.test(file?.name || "")) return null;
  const view = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
  try {
    if (view.getUint16(0) !== 0xffd8) return null;
    for (let offset = 2; offset + 10 < view.byteLength;) {
      const marker = view.getUint16(offset);
      if ((marker & 0xff00) !== 0xff00) return null;
      if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) {
        const start = offset + 10;
        const little = view.getUint16(start) === 0x4949;
        const u16 = (at) => view.getUint16(start + at, little);
        const u32 = (at) => view.getUint32(start + at, little);
        const entry = (ifd, tag) => {
          for (let index = 0, count = u16(ifd); index < count; index += 1) {
            if (u16(ifd + 2 + index * 12) === tag) return ifd + 2 + index * 12;
          }
          return -1;
        };
        const pointer = entry(u32(4), 0x8769);
        const original = pointer < 0 ? -1 : entry(u32(pointer + 8), 0x9003);
        if (original < 0) return null;
        const textAt = start + u32(original + 8);
        let text = "";
        for (let index = 0; index < 19; index += 1) text += String.fromCharCode(view.getUint8(textAt + index));
        return normalizeCaptureTime(text);
      }
      offset += 2 + view.getUint16(offset + 2);
    }
  } catch {
    return null;
  }
  return null;
}

// 一次上传多张时取最早的拍摄时间：一则随记的“发生时间”通常是这组照片的开始。
export function earliestCaptureTime(values) {
  return values.map(normalizeCaptureTime).filter(Boolean).sort()[0] || null;
}

