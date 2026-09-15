/** Longest side of an uploaded puzzle image after processing. */
export const MAX_IMAGE_DIMENSION = 2048;
/** Refuse to even decode files larger than this. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  contentType: string;
  extension: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file could not be decoded as an image."));
    img.src = src;
  });
}

/**
 * Downscale an image so its longest side is at most MAX_IMAGE_DIMENSION.
 * Every piece is drawn with `drawImage` from the full source each frame, so a
 * 6000px phone photo is both slow to render and wasteful to store.
 * PNGs stay PNG (to keep transparency); everything else becomes JPEG.
 */
export async function processImage(file: File): Promise<ProcessedImage> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const keepPng = file.type === "image/png";
    const contentType = keepPng ? "image/png" : "image/jpeg";
    const extension = keepPng ? "png" : "jpg";

    // Nothing to do: keep the original bytes.
    if (scale === 1 && (keepPng || file.type === "image/jpeg")) {
      return { blob: file, width, height, contentType: file.type, extension };
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get a canvas context.");
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, contentType, 0.92)
    );
    if (!blob) throw new Error("Could not encode the image.");

    return { blob, width, height, contentType, extension };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
