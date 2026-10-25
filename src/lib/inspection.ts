export interface InspectionOptions {
  blocks: number;
  trackers_per_block: number;
  panels_per_tracker: number;
  defect_types: string[];
}

// Used if the options request fails, so the form still works.
export const FALLBACK_OPTIONS: InspectionOptions = {
  blocks: 25,
  trackers_per_block: 180,
  panels_per_tracker: 90,
  defect_types: [
    "Cracked glass",
    "Shattered glass",
    "Hotspot or burn mark",
    "Delamination or discolouration",
    "Damaged frame",
    "Loose or misaligned",
    "Cable or connector damage",
    "Heavy soiling",
    "Shading",
    "Other",
  ],
};

export const PHOTO_BASE = "https://solar-farm-uploads.s3.ap-southeast-2.amazonaws.com";

/** Today as YYYY-MM-DD in the phone's own timezone. */
export const localDate = (d: Date = new Date()) => d.toLocaleDateString("en-CA");

export function fullName(first?: string | null, last?: string | null, username = ""): string {
  return `${first ?? ""} ${last ?? ""}`.trim() || username;
}

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** e.g. "23 Oct, 11:16 AM" */
export function dateTimeOf(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${timeOf(iso)}`;
}

export function longDate(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function shiftDay(day: string, by: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + by);
  return localDate(d);
}

const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Shrink a phone photo before upload: long edge 1600px, JPEG 80%.
 * A 6 MB photo becomes roughly 300 KB, which matters on patchy signal.
 */
export async function compressImage(file: File, maxEdge = 1600, quality = 0.8): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", quality));
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } catch {
    return file; // the browser could not decode it (e.g. HEIC); upload the original
  }
}

/**
 * Stamp the location on a photo (bottom bar, white text on dark) so it stays identifiable
 * once it leaves the app, e.g. in a client report. Throws if the browser cannot read the photo.
 */
export async function watermarkImage(file: File, lines: string[]): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("A photo could not be read. Remove it and take it again.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot add the location to photos.");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const size = Math.max(18, Math.round(canvas.width * 0.034));
  const pad = Math.round(size * 0.55);
  const lineH = Math.round(size * 1.3);
  const barH = pad * 2 + lineH * lines.length;
  ctx.fillStyle = "rgba(0, 0, 0, 0.66)";
  ctx.fillRect(0, canvas.height - barH, canvas.width, barH);
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(0, canvas.height - barH, Math.round(size * 0.28), barH); // amber edge
  ctx.textBaseline = "top";
  lines.forEach((text, i) => {
    ctx.font = `${i === 0 ? 700 : 500} ${i === 0 ? size : Math.round(size * 0.8)}px "Barlow", system-ui, sans-serif`;
    ctx.fillStyle = i === 0 ? "#ffffff" : "rgba(255, 255, 255, 0.8)";
    ctx.fillText(text, pad + Math.round(size * 0.3), canvas.height - barH + pad + i * lineH + (i === 0 ? 0 : 3), canvas.width - pad * 2);
  });

  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
  if (!blob) throw new Error("A photo could not be prepared. Try again.");
  const name = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
}
