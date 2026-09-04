export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

const acceptedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const acceptedExtensions = /\.(?:jpe?g|png|webp|heic|heif)$/i;
const heicExtensions = /\.(?:heic|heif)$/i;

export function isAcceptedImageFile(file) {
  return Boolean(file) && (acceptedMimeTypes.has(file.type) || acceptedExtensions.test(file.name || ""));
}

export function isHeicImage(file) {
  return Boolean(file) && (["image/heic", "image/heif"].includes(file.type) || heicExtensions.test(file.name || ""));
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
  if (!isAcceptedImageFile(file)) throw new TypeError("unsupported_image");
  if (isHeicImage(file) || typeof createImageBitmap !== "function") {
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
