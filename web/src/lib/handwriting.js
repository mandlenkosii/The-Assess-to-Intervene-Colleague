// Handwritten script photos (FEATURE_HANDWRITING): browser-side helpers.

// Whether the server has the feature on. Any failure means off, so the UI stays as it was.
export async function fetchFeatures() {
  try {
    const res = await fetch("/api/features");
    if (!res.ok) return { handwriting: false };
    const body = await res.json();
    return { handwriting: body?.handwriting === true };
  } catch {
    return { handwriting: false };
  }
}

export const stem = (name) => name.replace(/\.[^.]+$/, "");

const MAX_SIDE = 2000;
const MAX_BYTES = 3.5 * 1024 * 1024;

// Phone photos are large; shrink them before upload (Groq's vision API caps images at about 4 MB).
// PDFs and small images are sent as they are. The file name (the learner id) is kept.
export async function shrinkPhoto(file) {
  if (!/^image\/(jpeg|png)$/.test(file.type)) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= MAX_BYTES) { bitmap.close?.(); return file; }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
  return new File([blob], `${stem(file.name)}.jpg`, { type: "image/jpeg" });
}

export const countIllegible = (text) => (String(text).match(/\[illegible\]/gi) ?? []).length;
