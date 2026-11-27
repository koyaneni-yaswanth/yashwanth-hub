/**
 * Client-side image attachment sanitizer & resizer for Multimodal AI routing.
 * Keeps uploads within serverless JSON limits (~1 MB max per image).
 */

export interface PreparedImageAttachment {
  name: string;
  mimeType: string;
  dataUrl: string;
}

const ALLOWED_IMAGE_MIME = /^image\/(png|jpeg|jpg|webp|gif)$/i;

export function parseDataUrlToBase64(dataUrl: string): { mimeType: string; base64: string } | null {
  const m = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return null;
  if (!ALLOWED_IMAGE_MIME.test(m[1])) return null;
  return { mimeType: m[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1].toLowerCase(), base64: m[2] };
}

export async function prepareImageFile(file: File, maxDimension = 1280): Promise<PreparedImageAttachment> {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Only image files (PNG, JPEG, WebP, GIF) are supported.');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error(`Image "${file.name}" exceeds 12 MB limit.`);
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Failed reading "${file.name}"`));
    reader.readAsDataURL(file);
  });

  // Skip canvas re-encoding for small PNG/WebP/GIF or non-browser tests
  if (typeof document === 'undefined' || (file.size <= 900 * 1024 && ALLOWED_IMAGE_MIME.test(file.type))) {
    return {
      name: file.name || 'image.png',
      mimeType: file.type === 'image/jpg' ? 'image/jpeg' : file.type,
      dataUrl: rawDataUrl,
    };
  }

  return await new Promise<PreparedImageAttachment>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDimension / Math.max(img.width || 1, img.height || 1));
      const w = Math.max(1, Math.round((img.width || maxDimension) * scale));
      const h = Math.max(1, Math.round((img.height || maxDimension) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ name: file.name, mimeType: 'image/jpeg', dataUrl: rawDataUrl });
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const encoded = canvas.toDataURL('image/jpeg', 0.84);
      resolve({
        name: file.name || 'image.jpg',
        mimeType: 'image/jpeg',
        dataUrl: encoded,
      });
    };
    img.onerror = () => resolve({ name: file.name, mimeType: file.type, dataUrl: rawDataUrl });
    img.src = rawDataUrl;
  });
}
