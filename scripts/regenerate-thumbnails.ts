import sharp from 'sharp';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename } from 'path';

const CONFIG = {
  main: { portrait: 500, landscape: 1024, quality: 80 },
};

const uploadsDir = join(process.cwd(), 'uploads');
const thumbnailsDir = join(uploadsDir, 'thumbnails');

async function regenerateThumbnails() {
  if (!existsSync(thumbnailsDir)) {
    mkdirSync(thumbnailsDir, { recursive: true });
  }

  const files = readdirSync(uploadsDir).filter(f => f.endsWith('.png'));
  console.log(`Found ${files.length} PNG files to process`);

  for (const file of files) {
    const cardId = basename(file, '.png');
    const sourcePath = join(uploadsDir, file);
    const thumbPath = join(thumbnailsDir, `${cardId}.webp`);

    try {
      const imageBuffer = readFileSync(sourcePath);
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();

      const originalWidth = metadata.width || 500;
      const originalHeight = metadata.height || 500;
      const isLandscape = originalWidth > originalHeight;

      const targetWidth = isLandscape ? CONFIG.main.landscape : CONFIG.main.portrait;
      const width = targetWidth;
      const height = Math.round((originalHeight * targetWidth) / originalWidth);

      const thumbnailBuffer = await image
        .resize(width, height)
        .webp({ quality: CONFIG.main.quality })
        .toBuffer();

      writeFileSync(thumbPath, thumbnailBuffer);
      console.log(`✓ ${cardId}: ${metadata.width}x${metadata.height} -> ${width}x${height}`);
    } catch (error) {
      console.error(`✗ ${cardId}: ${error}`);
    }
  }

  console.log('\nDone!');
}

regenerateThumbnails();
