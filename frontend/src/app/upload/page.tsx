"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  uploadFiles,
  getRecordings,
  processRecording,
  downloadRecording,
  type Recording,
} from "@/lib/audio-api";
import { AnalysisLabelsBadge } from "@/components/research/AnalysisLabels";

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; dot?: string }> = {
    pending: {
      bg: "bg-ev-warm-gray/20",
      text: "text-ev-warm-gray",
    },
    processing: {
      bg: "bg-warning/20",
      text: "text-warning",
      dot: "animate-pulse",
    },
    complete: { bg: "bg-success/20", text: "text-success" },
    failed: { bg: "bg-danger/20", text: "text-danger" },
  };

  const c = config[status] || config.pending;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}
    >
      {c.dot && <span className={`w-1.5 h-1.5 rounded-full bg-current ${c.dot}`} />}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [enhanceWithAI, setEnhanceWithAI] = useState(true);

  const fetchRecordings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getRecordings({ limit: 50 });
      setRecordings(data.recordings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recordings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  const validateFile = (file: File): string | null => {
    const validTypes = [
      "audio/wav",
      "audio/x-wav",
      "audio/mpeg",
      "audio/mp3",
    ];
    const validExtensions = [".wav", ".mp3"];
    const maxSize = 500 * 1024 * 1024; // 500MB

    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
    if (!validTypes.includes(file.type) && !validExtensions.includes(ext)) {
      return `Invalid file type: ${file.name}. Only .wav and .mp3 files are accepted.`;
    }
    if (file.size > maxSize) {
      return `File too large: ${file.name} (${formatFileSize(file.size)}). Maximum size is 500 MB.`;
    }
    return null;
  };

  const handleUpload = async (files: File[]) => {
    setUploadError(null);
    setUploadSuccess(null);

    for (const file of files) {
      const validationError = validateFile(file);
      if (validationError) {
        setUploadError(validationError);
        return;
      }
    }

    setUploading(true);
    setUploadProgress(0);

    // Simulate progress since fetch doesn't support progress natively
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 15;
      });
    }, 300);

    try {
      const result = await uploadFiles(files);
      setUploadProgress(100);
      setUploadSuccess(result.message || `Uploaded ${files.length} file(s) successfully`);
      await fetchRecordings();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      clearInterval(progressInterval);
      setUploading(false);
      setTimeout(() => setUploadProgress(0), 2000);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleUpload(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) handleUpload(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleProcess = async (id: string) => {
    setProcessingIds((prev) => new Set(prev).add(id));
    try {
      await processRecording(id, {
        method: enhanceWithAI ? "hybrid" : "spectral",
      });
      await fetchRecordings();
      router.push(`/processing/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Processing failed");
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDownload = async (id: string) => {
    try {
      await downloadRecording(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  };

  return (
    <div className="min-h-screen bg-ev-ivory">
      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-ev-warm-gray hover:text-ev-elephant transition-colors mb-4"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Home
          </Link>
          <h1 className="text-4xl font-bold text-ev-charcoal">
            Upload Recordings
          </h1>
          <p className="text-ev-elephant mt-2">
            Upload elephant field recordings for AI-powered noise removal and
            vocalization analysis.
          </p>
        </div>

        {/* Upload Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer mb-12 ${
            isDragging
              ? "border-accent-savanna bg-accent-savanna/5 scale-[1.01]"
              : "border-ev-sand hover:border-ev-warm-gray bg-ev-cream"
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".wav,.mp3,audio/wav,audio/mpeg"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />

          <div className="flex flex-col items-center gap-4">
            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${
                isDragging ? "bg-accent-savanna/20" : "bg-background-elevated"
              }`}
            >
              <svg
                className={`w-8 h-8 transition-colors ${
                  isDragging ? "text-accent-savanna" : "text-ev-warm-gray"
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
                />
              </svg>
            </div>

            <div>
              <p className="text-lg font-semibold text-ev-charcoal">
                {isDragging ? "Drop files here" : "Drop .wav or .mp3 here"}
              </p>
              <p className="text-sm text-ev-warm-gray mt-1">
                or click to browse &middot; Max 500 MB per file
              </p>
            </div>

            <button
              type="button"
              className="px-6 py-2.5 bg-accent-savanna/10 text-accent-savanna font-medium rounded-lg hover:bg-accent-savanna/20 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              Browse Files
            </button>
          </div>

          {/* Upload Progress */}
          {uploading && (
            <div className="mt-8">
              <div className="w-full max-w-md mx-auto">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-ev-elephant">Uploading...</span>
                  <span className="text-accent-savanna">{Math.round(uploadProgress)}%</span>
                </div>
                <div className="h-2 bg-background-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-savanna rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Status Messages */}
        {uploadError && (
          <div className="mb-6 p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm flex items-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {uploadError}
          </div>
        )}
        {uploadSuccess && (
          <div className="mb-6 p-4 rounded-xl bg-success/10 border border-success/20 text-success text-sm flex items-center gap-3">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {uploadSuccess}
          </div>
        )}

        {/* Recordings List */}
        <div>
          <h2 className="text-2xl font-bold text-ev-charcoal mb-6">
            Your Recordings
          </h2>
          <div className="mb-4 inline-flex items-center gap-3 rounded-lg border border-ev-sand bg-ev-cream px-4 py-2">
            <span className="text-sm text-ev-elephant">Enhance with AI</span>
            <button
              type="button"
              onClick={() => setEnhanceWithAI((prev) => !prev)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                enhanceWithAI ? "bg-success" : "bg-ev-warm-gray/40"
              }`}
              aria-pressed={enhanceWithAI}
              aria-label="Toggle AI enhancement"
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  enhanceWithAI ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className="text-xs text-ev-warm-gray">
              {enhanceWithAI ? "Hybrid (spectral + AI)" : "Spectral only"}
            </span>
          </div>

          {loading ? (
            <div className="grid gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="p-6 rounded-xl bg-ev-cream border border-ev-sand animate-pulse"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-background-elevated" />
                    <div className="flex-1">
                      <div className="h-4 w-48 bg-background-elevated rounded mb-2" />
                      <div className="h-3 w-32 bg-background-elevated rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-8 rounded-xl bg-ev-cream border border-ev-sand text-center">
              <p className="text-danger mb-4">{error}</p>
              <button
                onClick={fetchRecordings}
                className="px-4 py-2 bg-background-elevated text-ev-elephant rounded-lg hover:text-ev-charcoal transition-colors"
              >
                Retry
              </button>
            </div>
          ) : recordings.length === 0 ? (
            <div className="p-12 rounded-xl bg-ev-cream border border-ev-sand text-center">
              <svg
                className="w-12 h-12 text-ev-warm-gray mx-auto mb-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
              <p className="text-ev-elephant mb-1">No recordings yet</p>
              <p className="text-ev-warm-gray text-sm">
                Upload your first field recording to get started.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {recordings.map((rec) => (
                <div
                  key={rec.id}
                  onClick={() => {
                    if (rec.status === "complete" || rec.status === "processing") {
                      router.push(`/processing/${rec.id}`);
                    }
                  }}
                  className={`p-6 rounded-xl bg-ev-cream border border-ev-sand hover:border-ev-warm-gray/30 transition-all ${
                    rec.status === "complete" || rec.status === "processing"
                      ? "cursor-pointer"
                      : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-background-elevated flex items-center justify-center flex-shrink-0">
                        <svg
                          className="w-5 h-5 text-accent-savanna"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z"
                          />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-ev-charcoal truncate">
                            {rec.filename}
                          </p>
                          <AnalysisLabelsBadge recording={rec} />
                        </div>
                        <div className="flex items-center gap-3 text-sm text-ev-warm-gray mt-0.5">
                          <span>{formatDuration(rec.duration)}</span>
                          <span>&middot;</span>
                          <span>{formatFileSize(rec.file_size)}</span>
                          {rec.sample_rate && (
                            <>
                              <span>&middot;</span>
                              <span>{(rec.sample_rate / 1000).toFixed(1)} kHz</span>
                            </>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                          {rec.metadata?.animal_id && (
                            <span className="px-2 py-0.5 rounded-md bg-background-elevated text-ev-elephant">
                              Animal: {rec.metadata.animal_id}
                            </span>
                          )}
                          {rec.metadata?.noise_type_ref && (
                            <span className="px-2 py-0.5 rounded-md bg-accent-savanna/10 text-accent-savanna">
                              Noise: {rec.metadata.noise_type_ref}
                            </span>
                          )}
                          {rec.metadata?.call_id && (
                            <span className="px-2 py-0.5 rounded-md bg-ev-warm-gray/15 text-ev-elephant">
                              Call: {rec.metadata.call_id}
                            </span>
                          )}
                          {(rec.metadata?.start_sec !== undefined ||
                            rec.metadata?.end_sec !== undefined) && (
                            <span className="px-2 py-0.5 rounded-md bg-ev-warm-gray/10 text-ev-warm-gray">
                              Window: {rec.metadata?.start_sec?.toFixed(2) ?? "0.00"}s - {rec.metadata?.end_sec?.toFixed(2) ?? "--"}s
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <StatusBadge status={rec.status} />

                      {rec.status === "pending" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleProcess(rec.id);
                          }}
                          disabled={processingIds.has(rec.id)}
                          className="px-4 py-2 bg-success/10 text-success text-sm font-medium rounded-lg hover:bg-success/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {processingIds.has(rec.id) ? "Starting..." : "Process"}
                        </button>
                      )}

                      {rec.status === "complete" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(rec.id);
                          }}
                          className="px-4 py-2 bg-accent-savanna/10 text-accent-savanna text-sm font-medium rounded-lg hover:bg-accent-savanna/20 transition-colors"
                        >
                          Download
                        </button>
                      )}

                      {rec.status === "failed" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleProcess(rec.id);
                          }}
                          className="px-4 py-2 bg-danger/10 text-danger text-sm font-medium rounded-lg hover:bg-danger/20 transition-colors"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
