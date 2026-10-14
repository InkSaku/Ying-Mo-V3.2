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
    return { file: optimized, optimized: true, originalBytes: file.size, uploadBytes: optimized.size };
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
