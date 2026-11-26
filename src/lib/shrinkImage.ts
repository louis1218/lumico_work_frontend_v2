// Make a smaller copy of a photo for printing: at most `maxSide` pixels on its long side, saved as JPEG.
// Returns an object URL (revoke it when done). Needs the photo's server to allow cross-origin GET (CORS).
export async function shrinkImage(url: string, maxSide = 1000, quality = 0.72): Promise<string> {
  const res = await fetch(url, { mode: "cors", cache: "no-store" });
  if (!res.ok) throw new Error(`Photo download failed (${res.status})`);
  const bitmap = await createImageBitmap(await res.blob());
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", quality));
    if (!blob) throw new Error("Could not compress the photo");
    return URL.createObjectURL(blob);
  } finally {
    bitmap.close();
  }
}
