import { useState, useRef } from 'react';
import CameraCapture from './CameraCapture';
import { compressImage } from '../utils/image-compression';

interface BillUploadProps {
  onUpload: (file: File) => Promise<void>;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB - Textract sync API limit
const ALLOWED_FORMATS = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic'];

export default function BillUpload({ onUpload }: BillUploadProps) {
  const [showCamera, setShowCamera] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      return 'File size must be less than 5MB. Please compress or resize your image.';
    }

    // Check file format
    if (!ALLOWED_FORMATS.includes(file.type)) {
      return 'Please upload a JPEG, PNG, or HEIC image';
    }

    return null;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSelectedFile(file);
    
    // Create preview URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
  };

  const handleCameraCapture = async (imageBlob: Blob) => {
    // Convert blob to file
    const file = new File([imageBlob], 'receipt.jpg', { type: 'image/jpeg' });
    
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      setShowCamera(false);
      return;
    }

    setError(null);
    setSelectedFile(file);
    
    // Create preview URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setShowCamera(false);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    try {
      setIsUploading(true);
      setUploadProgress(0);
      setError(null);

      // Compress image before upload
      setUploadProgress(10);
      
      const compressedBlob = await compressImage(selectedFile, {
        maxWidth: 1920,
        maxHeight: 1920,
        quality: 0.85,
        maxSizeMB: 4.5, // Keep under 5MB with buffer for sync Textract
      });
      
      // Convert blob to file
      const compressedFile = new File([compressedBlob], selectedFile.name, { 
        type: compressedBlob.type || selectedFile.type 
      });

      setUploadProgress(30);

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev: number) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      await onUpload(compressedFile);
      
      clearInterval(progressInterval);
      setUploadProgress(100);
      
      // Don't reset here - let parent component handle navigation
      // The UploadPage will show a modal and then navigate
      setIsUploading(false);
    } catch (err) {
      console.error('❌ Upload error:', err);
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Check if device supports camera
  const isCameraSupported = 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;

  if (showCamera) {
    return (
      <CameraCapture
        onCapture={handleCameraCapture}
        onCancel={() => setShowCamera(false)}
      />
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        Upload Receipt
      </h2>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {!selectedFile ? (
        <div className="space-y-4">
          {/* Camera Button */}
          {isCameraSupported && (
            <button
              onClick={() => setShowCamera(true)}
              className="w-full px-6 py-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <span className="text-2xl">📸</span>
              <span>Take Photo</span>
            </button>
          )}

          {/* File Selection Button */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/heic"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="block w-full px-6 py-4 bg-white border-2 border-gray-300 text-gray-900 rounded-lg font-semibold hover:border-gray-400 transition-colors cursor-pointer text-center"
            >
              <span className="text-2xl mr-2">📁</span>
              <span>Choose from Gallery</span>
            </label>
          </div>

          <div className="text-center text-sm text-gray-500 mt-4">
            <p>Supported formats: JPEG, PNG, HEIC</p>
            <p>Maximum size: 5MB</p>
            <p className="text-xs mt-1">Images will be automatically compressed</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Image Preview */}
          <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
            <img
              src={previewUrl || ''}
              alt="Receipt preview"
              className="w-full h-auto"
            />
          </div>

          {/* File Info */}
          <div className="text-sm text-gray-600">
            <p className="font-medium">{selectedFile.name}</p>
            <p>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-2">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-sm text-gray-600 text-center">
                Uploading... {uploadProgress}%
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleReset}
              disabled={isUploading}
              className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Change Photo
            </button>
            <button
              onClick={handleUpload}
              disabled={isUploading}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? 'Uploading...' : 'Upload & Process'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
