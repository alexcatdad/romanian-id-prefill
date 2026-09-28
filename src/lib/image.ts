export const MAX_FILE_BYTES = 15 * 1024 * 1024;

const MAX_SOURCE_PIXELS = 40_000_000;
const MAX_IMAGE_SIDE = 2600;
const OCR_TARGET_WIDTH = 1800;

type SupportedImageType = 'image/jpeg' | 'image/png' | 'image/webp';

function imageType(bytes: Uint8Array): SupportedImageType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((value, index) => bytes[index] === value)) {
    return 'image/png';
  }
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

function headerDimensions(bytes: Uint8Array, type: SupportedImageType): [number, number] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === 'image/png' && bytes.length >= 24) {
    if (bytes[12] === 0x49 && bytes[13] === 0x48 && bytes[14] === 0x44 && bytes[15] === 0x52) {
      return [view.getUint32(16), view.getUint32(20)];
    }
  }
  if (type === 'image/webp' && bytes.length >= 30) {
    if (bytes[12] !== 0x56 || bytes[13] !== 0x50 || bytes[14] !== 0x38) return null;
    if (bytes[15] === 0x58) {
      return [1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16), 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16)];
    }
    if (bytes[15] === 0x4c && bytes[20] === 0x2f) {
      return [1 + ((bytes[21]! | (bytes[22]! << 8)) & 0x3fff), 1 + (((bytes[22]! >> 6) | (bytes[23]! << 2) | (bytes[24]! << 10)) & 0x3fff)];
    }
    if (bytes[15] === 0x20 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
      return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
    }
  }
  if (type === 'image/jpeg') {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      while (bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset++];
      if (marker === undefined || marker === 0xda || marker === 0xd9) return null;
      if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return null;
      const length = view.getUint16(offset);
      if (length < 2) return null;
      const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isFrame && length >= 7 && offset + 7 <= bytes.length) {
        return [view.getUint16(offset + 5), view.getUint16(offset + 3)];
      }
      offset += length;
    }
  }
  return null;
}

function checkDimensions(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new Error('This image has invalid dimensions. Choose another image.');
  }
  if (width * height > MAX_SOURCE_PIXELS) {
    throw new Error('This image is larger than 40 megapixels. Choose a smaller JPEG, PNG or WebP image.');
  }
}

function drawBoundedImage(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  checkDimensions(width, height);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the image.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas;
  } catch (error) {
    clearCanvas(canvas);
    throw error;
  }
}

async function decodeWithImageElement(blob: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.decoding = 'async';
  try {
    if (typeof image.decode === 'function') {
      image.src = url;
      await image.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('This image could not be decoded.'));
        image.src = url;
      });
    }
    // Modern HTML image decoding applies EXIF orientation as well.
    return drawBoundedImage(image, image.naturalWidth, image.naturalHeight);
  } finally {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    URL.revokeObjectURL(url);
  }
}

/** Decode a supported local file into a bounded, memory-only canvas. */
export async function decodeImage(file: File): Promise<HTMLCanvasElement> {
  if (file.size === 0) throw new Error('This file is empty. Choose an image of your identity card.');
  if (file.size > MAX_FILE_BYTES) throw new Error('Choose an image smaller than 15 MB.');

  // Inspect bounded headers before allocating decoded pixels. A final decoded-size
  // check also covers unusual files with metadata beyond this first megabyte.
  const bytes = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer());
  const type = imageType(bytes);
  if (!type) {
    throw new Error('Use a JPEG, PNG or WebP image. HEIC, SVG and PDF files are not supported.');
  }
  const dimensions = headerDimensions(bytes, type);
  if (dimensions) checkDimensions(...dimensions);
  // Use the verified file signature instead of trusting its extension or MIME label.
  const blob = new Blob([file], { type });
  if (typeof createImageBitmap === 'function') {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      // Some browsers support the API but cannot decode every supported image.
      return decodeWithImageElement(blob);
    }
    try {
      return drawBoundedImage(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  }
  return decodeWithImageElement(blob);
}

/** Release pixel buffers and dimensions; callers also drop their references. */
export function clearCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

/** Keep MRZ strokes intact while normalizing grayscale and contrast for OCR. */
export function prepareMrzCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  checkDimensions(source.width, source.height);
  // The height limit and maximum 3× enlargement also bound accidental full-photo crops.
  const scale = Math.min(OCR_TARGET_WIDTH / source.width, MAX_IMAGE_SIDE / source.height, 3);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('This browser could not prepare the MRZ image.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const histogram = new Uint32Array(256);
    const data = pixels.data;
    for (let index = 0; index < data.length; index += 4) {
      const gray = Math.round(0.299 * data[index]! + 0.587 * data[index + 1]! + 0.114 * data[index + 2]!);
      histogram[gray] = histogram[gray]! + 1;
      data[index] = gray;
      data[index + 1] = gray;
      data[index + 2] = gray;
      data[index + 3] = 255;
    }

    const tail = Math.floor((data.length / 4) * 0.01);
    let low = 0;
    let high = 255;
    let count = 0;
    while (low < 255 && count + histogram[low]! <= tail) count += histogram[low++]!;
    count = 0;
    while (high > 0 && count + histogram[high]! <= tail) count += histogram[high--]!;
    if (high - low >= 16) {
      const contrast = 255 / (high - low);
      for (let index = 0; index < data.length; index += 4) {
        const gray = Math.max(0, Math.min(255, Math.round((data[index]! - low) * contrast)));
        data[index] = gray;
        data[index + 1] = gray;
        data[index + 2] = gray;
      }
    }
    context.putImageData(pixels, 0, 0);
    return canvas;
  } catch (error) {
    clearCanvas(canvas);
    throw error;
  }
}
