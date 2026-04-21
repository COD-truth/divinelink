// Utilities for image compression and storage estimation.

/** Compress an image file: resize to max 1024px width, JPEG quality 0.8.
 *  Non-image files are returned as raw base64. Returns a data URL string. */
export async function compressImage(file: File, maxWidth = 1024, quality = 0.8): Promise<string> {
  if (!file.type.startsWith("image/")) {
    // Non-image: return as base64 data URL
    return await fileToDataUrl(file);
  }
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxWidth / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Estimate IndexedDB / origin storage usage. Returns null if unsupported. */
export async function getStorageEstimate(): Promise<{ usage: number; quota: number; percent: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  const usage = e.usage ?? 0;
  const quota = e.quota ?? 0;
  const percent = quota > 0 ? (usage / quota) * 100 : 0;
  return { usage, quota, percent };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
