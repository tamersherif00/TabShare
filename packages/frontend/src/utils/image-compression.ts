/**
 * Image compression utility for optimizing receipt images before upload
 */

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxSizeMB?: number;
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.85,
  maxSizeMB: 5,
};

/**
 * Compress an image file to reduce upload size
 * @param file - The image file to compress
 * @param options - Compression options
 * @returns Compressed image as a Blob
 */
export async function compressImage(
  file: File | Blob,
  options: CompressionOptions = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Check if file is already small enough
  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB <= opts.maxSizeMB) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        // Calculate new dimensions while maintaining aspect ratio
        let { width, height } = img;
        
        if (width > opts.maxWidth || height > opts.maxHeight) {
          const aspectRatio = width / height;
          
          if (width > height) {
            width = opts.maxWidth;
            height = width / aspectRatio;
          } else {
            height = opts.maxHeight;
            width = height * aspectRatio;
          }
        }

        // Create canvas and draw resized image
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to blob with compression
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to compress image'));
              return;
            }

            // If compressed image is still too large, reduce quality further
            const compressedSizeMB = blob.size / (1024 * 1024);
            if (compressedSizeMB > opts.maxSizeMB && opts.quality > 0.5) {
              // Recursively compress with lower quality
              compressImage(blob, { ...opts, quality: opts.quality - 0.1 })
                .then(resolve)
                .catch(reject);
            } else {
              resolve(blob);
            }
          },
          'image/jpeg',
          opts.quality
        );
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Get image dimensions without loading the full image
 * @param file - The image file
 * @returns Promise with width and height
 */
export async function getImageDimensions(
  file: File | Blob
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}
