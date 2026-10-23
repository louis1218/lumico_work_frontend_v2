export interface InspectionOptions {
  blocks: number;
  trackers_per_block: number;
  defect_types: string[];
}

// Used if the options request fails, so the form still works.
export const FALLBACK_OPTIONS: InspectionOptions = {
  blocks: 25,
  trackers_per_block: 180,
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
