/**
 * Calculate SHA-256 checksum for file integrity validation
 */
export async function calculateSHA256(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  
  // Use SubtleCrypto for SHA-256
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  
  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

/**
 * Calculate SHA-256 and convert to base64 for AWS
 */
export async function calculateSHA256Base64(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  
  // Convert to base64
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const base64 = btoa(String.fromCharCode(...hashArray));
  
  return base64;
}

/**
 * Get file size
 */
export function getFileSize(file: File | Blob): number {
  return file.size;
}
