export const MAX_IMAGE_DATA_URL_LENGTH = 48000;
const TARGET_IMAGE_DATA_URL_LENGTH = 44000;

export function formatMoney(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function validateImageDataUrl(dataUrl: string | null): string | null {
  if (!dataUrl) return null;
  if (!dataUrl.startsWith('data:image/')) {
    return 'Invalid image format. Please choose a valid image file.';
  }
  if (dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH) {
    return 'Compressed image is still too large for Google Sheets. Please choose a smaller photo.';
  }
  return null;
}

function renderScaledJpeg(
  img: HTMLImageElement,
  maxDimension: number,
  quality: number
): string | null {
  let { width, height } = img;
  if (width <= 0 || height <= 0) return null;

  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.max(1, Math.round((height * maxDimension) / width));
      width = maxDimension;
    } else {
      width = Math.max(1, Math.round((width * maxDimension) / height));
      height = maxDimension;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Fill white background so transparent PNGs compress cleanly to JPEG
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  return canvas.toDataURL('image/jpeg', quality);
}

export function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        reject(new Error('Empty image data.'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        const attempts: Array<{ maxDim: number; quality: number }> = [
          { maxDim: 400, quality: 0.78 },
          { maxDim: 400, quality: 0.62 },
          { maxDim: 340, quality: 0.55 },
          { maxDim: 280, quality: 0.48 },
          { maxDim: 220, quality: 0.42 },
        ];

        let best: string | null = null;
        for (const attempt of attempts) {
          const encoded = renderScaledJpeg(img, attempt.maxDim, attempt.quality);
          if (!encoded) continue;
          best = encoded;
          if (encoded.length <= TARGET_IMAGE_DATA_URL_LENGTH) {
            resolve(encoded);
            return;
          }
        }

        if (best && best.length <= MAX_IMAGE_DATA_URL_LENGTH) {
          resolve(best);
          return;
        }

        if (result.length <= MAX_IMAGE_DATA_URL_LENGTH) {
          resolve(result);
          return;
        }

        reject(
          new Error(
            'Image is too large even after compression. Please select a smaller image.'
          )
        );
      };

      img.onerror = () => {
        if (result.length <= MAX_IMAGE_DATA_URL_LENGTH) {
          resolve(result);
        } else {
          reject(new Error('Could not process the selected image.'));
        }
      };

      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}
