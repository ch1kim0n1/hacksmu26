export const ACCEPTED_FORMATS = [".wav", ".mp3", ".flac"] as const;
export const ACCEPTED_MIME_TYPES = [
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/flac",
  "audio/x-flac",
] as const;

/** Maximum file size: 500 MB */
export const MAX_FILE_SIZE = 500 * 1024 * 1024;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate an audio file for upload.
 * Checks file extension and file size.
 */
export function validateAudioFile(file: File): ValidationResult {
  // Check file extension
  const fileName = file.name.toLowerCase();
  const hasValidExtension = ACCEPTED_FORMATS.some((ext) =>
    fileName.endsWith(ext)
  );

  if (!hasValidExtension) {
    return {
      valid: false,
      error: `Invalid file format. Accepted formats: ${ACCEPTED_FORMATS.join(", ")}`,
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = Math.round(file.size / (1024 * 1024));
    return {
      valid: false,
      error: `File too large (${sizeMB} MB). Maximum size is 500 MB.`,
    };
  }

  // Check for empty file
  if (file.size === 0) {
    return {
      valid: false,
      error: "File is empty.",
    };
  }

  return { valid: true };
}
