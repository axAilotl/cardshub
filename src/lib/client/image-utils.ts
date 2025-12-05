const MAX_THUMBNAIL_SIZE = 300;
const THUMBNAIL_QUALITY = 0.85;

export async function generateThumbnail(
  imageBuffer: Uint8Array,
  maxSize: number = MAX_THUMBNAIL_SIZE
): Promise<{ buffer: Uint8Array; width: number; height: number } | null> {
  try {
    const copy = new ArrayBuffer(imageBuffer.byteLength);
    new Uint8Array(copy).set(imageBuffer);
    const blob = new Blob([copy], { type: 'image/png' });
    const imageBitmap = await createImageBitmap(blob);

    const { width, height } = imageBitmap;

    let newWidth = width;
    let newHeight = height;

    if (width > height) {
      if (width > maxSize) {
        newHeight = Math.round((height * maxSize) / width);
        newWidth = maxSize;
      }
    } else {
      if (height > maxSize) {
        newWidth = Math.round((width * maxSize) / height);
        newHeight = maxSize;
      }
    }

    if (newWidth === width && newHeight === height && width <= maxSize && height <= maxSize) {
      return null;
    }

    const canvas = new OffscreenCanvas(newWidth, newHeight);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.warn('Could not get canvas context for thumbnail generation');
      return null;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imageBitmap, 0, 0, newWidth, newHeight);

    const thumbnailBlob = await canvas.convertToBlob({
      type: 'image/webp',
      quality: THUMBNAIL_QUALITY,
    });

    const arrayBuffer = await thumbnailBlob.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    imageBitmap.close();

    return {
      buffer,
      width: newWidth,
      height: newHeight,
    };
  } catch (error) {
    console.warn('Failed to generate thumbnail:', error);
    return null;
  }
}

export async function getImageDimensions(
  imageBuffer: Uint8Array
): Promise<{ width: number; height: number } | null> {
  try {
    const copy = new ArrayBuffer(imageBuffer.byteLength);
    new Uint8Array(copy).set(imageBuffer);
    const blob = new Blob([copy], { type: 'image/png' });
    const imageBitmap = await createImageBitmap(blob);
    const { width, height } = imageBitmap;
    imageBitmap.close();
    return { width, height };
  } catch (error) {
    console.warn('Failed to get image dimensions:', error);
    return null;
  }
}

export async function convertToWebP(
  imageBuffer: Uint8Array,
  quality: number = 0.9
): Promise<Uint8Array | null> {
  try {
    const copy = new ArrayBuffer(imageBuffer.byteLength);
    new Uint8Array(copy).set(imageBuffer);
    const blob = new Blob([copy], { type: 'image/png' });
    const imageBitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return null;
    }

    ctx.drawImage(imageBitmap, 0, 0);

    const webpBlob = await canvas.convertToBlob({
      type: 'image/webp',
      quality,
    });

    const arrayBuffer = await webpBlob.arrayBuffer();
    imageBitmap.close();

    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.warn('Failed to convert to WebP:', error);
    return null;
  }
}
