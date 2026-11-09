import fs from 'fs';
import path from 'path';
import { v2 as cloudinary } from 'cloudinary';

const CLOUDINARY_PREFIX = 'cloudinary:';

function getCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const configured = [cloudName, apiKey, apiSecret].filter(Boolean).length;

  if (configured === 0) return null;
  if (configured !== 3) {
    throw new Error('Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET together');
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  return cloudinary;
}

export async function storePhoto(milestoneId: string, fileName: string, buffer: Buffer): Promise<string> {
  const client = getCloudinary();
  if (!client) {
    const dir = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, fileName), buffer);
    return `uploads/${fileName}`;
  }

  const publicId = await new Promise<string>((resolve, reject) => {
    const upload = client.uploader.upload_stream(
      {
        folder: 'kazi-proof',
        public_id: `${milestoneId}-${Date.now()}`,
        resource_type: 'image',
        type: 'private',
        overwrite: false,
        format: 'jpg',
      },
      (error, result) => {
        if (error) reject(error);
        else if (!result?.public_id) reject(new Error('Cloudinary upload returned no public ID'));
        else resolve(result.public_id);
      }
    );
    upload.end(buffer);
  });

  return `${CLOUDINARY_PREFIX}${publicId}`;
}

export async function loadCloudinaryPhoto(photoPath: string): Promise<Buffer | null> {
  if (!photoPath.startsWith(CLOUDINARY_PREFIX)) return null;
  const client = getCloudinary();
  if (!client) throw new Error('Cloudinary credentials are required to load this photo');

  const publicId = photoPath.slice(CLOUDINARY_PREFIX.length);
  if (!publicId) throw new Error('Cloudinary photo reference is empty');

  const url = client.utils.private_download_url(publicId, 'jpg', {
    resource_type: 'image',
    type: 'private',
    expires_at: Math.floor(Date.now() / 1000) + 60,
    attachment: false,
  });
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cloudinary photo download failed (HTTP ${response.status})`);
  const contentType = response.headers.get('content-type');
  if (!contentType?.startsWith('image/')) {
    throw new Error('Cloudinary photo download returned a non-image response');
  }
  return Buffer.from(await response.arrayBuffer());
}
