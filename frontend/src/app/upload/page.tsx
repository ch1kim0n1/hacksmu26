"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CloudUpload,
  Music,
  CheckCircle2,
  Clock,
  Activity,
  Download,
  ChevronRight,
  AlertCircle,
  RotateCw,
  Sparkles,
  Loader2,
  Layers,
} from "lucide-react";
import {
  uploadFiles,
  getRecordings,
  processRecording,
  downloadRecording,
  type Recording,
} from "@/lib/audio-api";
import RealtimeFilterLab from "@/components/audio/RealtimeFilterLab";
import RealtimeMicTest from "@/components/audio/RealtimeMicTest";
import { AnalysisLabelsBadge } from "@/components/research/AnalysisLabels";
import {
  staggerContainer,
  fadeUp,
  SoundWave,
} from "@/components/ui/motion-primitives";

/* ── Status Badge ── */

function StatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { bg: string; text: string; icon: React.ReactNode }
  > = {
    pending: {
      bg: "bg-ev-warm-gray/10 border-ev-warm-gray/15",
      text: "text-ev-warm-gray",
      icon: <Clock className="w-3 h-3" />,
    },
    processing: {
      bg: "bg-accent-savanna/10 border-accent-savanna/15",
      text: "text-accent-savanna",
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    complete: {
      bg: "bg-success/10 border-success/15",
      text: "text-success",
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    failed: {
      bg: "bg-danger/10 border-danger/15",
      text: "text-danger",
      icon: <AlertCircle className="w-3 h-3" />,
    },
  };
  const c = config[status] || config.pending;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${c.bg} ${c.text}`}
    >
      {c.icon}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

/* ── Helpers ── */

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

/* ── Stat Card ── */

function StatCard({
  label,
  value,
  icon,
  delay = 0,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: "easeOut" }}
      className="glass rounded-2xl p-4 border border-ev-sand/30 card-hover"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-accent-savanna/12 to-accent-gold/5 flex items-center justify-center text-accent-savanna">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold text-ev-charcoal leading-tight tabular-nums truncate">
            {value}
          </p>
          <p className="text-[11px] text-ev-warm-gray font-medium truncate">{label}</p>
        </div>
      </div>
    </motion.div>
  );
}

/* ── Page ── */

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

  /* ── Data ── */

  const fetchRecordings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getRecordings({ limit: 50 });
      setRecordings(data.recordings);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load recordings",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  /* ── Upload handlers ── */

  const validateFile = (file: File): string | null => {
    const validTypes = [
      "audio/wav",
      "audio/x-wav",
      "audio/mpeg",
      "audio/mp3",
    ];
    const validExtensions = [".wav", ".mp3"];
    const maxSize = 500 * 1024 * 1024;
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
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => (prev >= 90 ? prev : prev + Math.random() * 15));
    }, 300);
    try {
      const result = await uploadFiles(files);
      setUploadProgress(100);
      setUploadSuccess(
        result.message || `Uploaded ${files.length} file(s) successfully`,
      );
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

  const completedCount = recordings.filter(
    (r) => r.status === "complete",
  ).length;
  const pendingCount = recordings.filter((r) => r.status === "pending").length;
  const processingCount = recordings.filter(
    (r) => r.status === "processing",
  ).length;

  /* ── Render ── */

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-8">
      {/* Page Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-end justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-ev-charcoal">
            Upload Recordings
          </h1>
          <p className="text-sm text-ev-warm-gray mt-1">
            Upload elephant field recordings for AI-powered noise removal and
            vocalization analysis.
          </p>
        </div>
        <SoundWave
          bars={6}
          className="h-6 hidden sm:flex"
          color="bg-accent-savanna/25"
        />
      </motion.div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" style={{ minHeight: 76 }}>
        <StatCard
          label="Total Recordings"
          value={recordings.length}
          icon={<Layers className="w-5 h-5" />}
          delay={0}
        />
        <StatCard
          label="Completed"
          value={completedCount}
          icon={<CheckCircle2 className="w-5 h-5" />}
          delay={0.07}
        />
        <StatCard
          label="Pending"
          value={pendingCount}
          icon={<Clock className="w-5 h-5" />}
          delay={0.14}
        />
        <StatCard
          label="Processing"
          value={processingCount}
          icon={<Activity className="w-5 h-5" />}
          delay={0.21}
        />
      </div>

      {/* Upload + Live Mic Test */}
      <div className="grid items-start gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, duration: 0.4 }}
        >
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative rounded-2xl p-10 text-center cursor-pointer group transition-all duration-300 overflow-hidden upload-zone-glow ${
              isDragging
                ? "active bg-accent-savanna/5 shadow-glow"
                : "bg-white/40 hover:bg-white/60 border border-dashed border-ev-sand/60 hover:border-accent-savanna/30"
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

            {/* Sound wave decoration */}
            <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-[3px] h-8 overflow-hidden opacity-[0.15] pointer-events-none">
              {Array.from({ length: 24 }).map((_, i) => (
                <div
                  key={i}
                  className="w-[2px] bg-accent-savanna rounded-full"
                  style={{
                    animation: "sound-bar 1.2s ease-in-out infinite",
                    animationDelay: `${i * 0.08}s`,
                    transformOrigin: "bottom",
                    height: "100%",
                  }}
                />
              ))}
            </div>

            <div className="flex flex-col items-center gap-4 relative z-10">
              <motion.div
                animate={
                  isDragging
                    ? { scale: 1.1, rotate: 3 }
                    : { scale: 1, rotate: 0 }
                }
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors duration-300 ${
                  isDragging
                    ? "bg-accent-savanna/15"
                    : "bg-ev-cream group-hover:bg-accent-savanna/10"
                }`}
              >
                <CloudUpload
                  className={`w-7 h-7 transition-colors ${
                    isDragging
                      ? "text-accent-savanna"
                      : "text-ev-warm-gray group-hover:text-accent-savanna"
                  }`}
                />
              </motion.div>

              <div>
                <p className="text-base font-semibold text-ev-charcoal">
                  {isDragging
                    ? "Drop files here"
                    : "Drop .wav or .mp3 files here"}
                </p>
                <p className="text-sm text-ev-warm-gray mt-1">
                  or click to browse &middot; Max 500 MB per file
                </p>
              </div>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                type="button"
                className="px-6 py-2.5 bg-gradient-to-r from-accent-savanna to-accent-gold text-white text-sm font-medium rounded-xl shadow-sm shadow-accent-savanna/20 hover:shadow-md hover:shadow-accent-savanna/25 transition-shadow"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                Browse Files
              </motion.button>
            </div>

            {/* Upload Progress */}
            <AnimatePresence>
              {uploading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mt-8 relative z-10"
                >
                  <div className="w-full max-w-sm mx-auto">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-ev-elephant flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Uploading&hellip;
                      </span>
                      <span className="text-accent-savanna font-medium tabular-nums">
                        {Math.round(uploadProgress)}%
                      </span>
                    </div>
                    <div className="h-2 bg-ev-cream rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-accent-savanna to-accent-gold rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.4 }}
        >
          <RealtimeMicTest onUploaded={fetchRecordings} />
        </motion.div>
      </div>

      {/* Real-time Filter Lab */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
      >
        <RealtimeFilterLab />
      </motion.div>

      {/* Status Messages */}
      <AnimatePresence>
        {uploadError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-4 rounded-xl bg-danger/5 border border-danger/15 text-danger text-sm flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {uploadError}
          </motion.div>
        )}
        {uploadSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-4 rounded-xl bg-success/5 border border-success/15 text-success text-sm flex items-center gap-3"
          >
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            {uploadSuccess}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recordings Section */}
      <div>
        <div className="flex items-center justify-between mb-5 gap-4">
          <h2 className="text-lg font-semibold text-ev-charcoal">
            Your Recordings
          </h2>
          <div className="inline-flex items-center gap-2.5 rounded-xl glass border border-ev-sand/30 px-3.5 py-2 shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-accent-savanna shrink-0" />
            <span className="text-xs text-ev-elephant font-medium whitespace-nowrap">
              AI Enhance
            </span>
            <button
              type="button"
              role="switch"
              onClick={() => setEnhanceWithAI((prev) => !prev)}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${
                enhanceWithAI ? "bg-success" : "bg-ev-warm-gray/30"
              }`}
              aria-checked={enhanceWithAI}
              aria-label="Toggle AI enhancement"
            >
              <motion.span
                className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm"
                animate={{ x: enhanceWithAI ? 18 : 2 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            </button>
            <span className="text-[10px] text-ev-warm-gray">
              {enhanceWithAI ? "Hybrid" : "Spectral"}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-5 rounded-xl glass border border-ev-sand/30 animate-pulse"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-ev-cream" />
                  <div className="flex-1">
                    <div className="h-4 w-48 bg-ev-cream rounded mb-2" />
                    <div className="h-3 w-32 bg-ev-cream rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-8 rounded-xl glass border border-ev-sand/30 text-center">
            <AlertCircle className="w-8 h-8 text-danger mx-auto mb-3" />
            <p className="text-danger mb-4">{error}</p>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={fetchRecordings}
              className="px-5 py-2 bg-ev-cream text-ev-elephant rounded-xl hover:text-ev-charcoal transition-colors text-sm font-medium"
            >
              Retry
            </motion.button>
          </div>
        ) : recordings.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-12 rounded-2xl glass border border-dashed border-ev-sand/60 text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-savanna/10 to-accent-gold/5 flex items-center justify-center mx-auto mb-4">
              <Music className="w-7 h-7 text-accent-savanna/60" />
            </div>
            <p className="text-ev-elephant font-medium mb-1">
              No recordings yet
            </p>
            <p className="text-ev-warm-gray text-sm">
              Upload your first field recording to get started.
            </p>
          </motion.div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="space-y-2"
          >
            {recordings.map((rec) => (
              <motion.div
                key={rec.id}
                variants={fadeUp}
                onClick={() => {
                  if (
                    rec.status === "complete" ||
                    rec.status === "processing"
                  ) {
                    router.push(`/processing/${rec.id}`);
                  }
                }}
                className={`group p-4 rounded-xl glass border border-ev-sand/30 card-hover ${
                  rec.status === "complete" || rec.status === "processing"
                    ? "cursor-pointer"
                    : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-accent-savanna/10 to-accent-gold/5 flex items-center justify-center mt-0.5">
                      <Music className="w-5 h-5 text-accent-savanna" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-ev-charcoal truncate text-sm max-w-[200px] sm:max-w-none">
                          {rec.filename}
                        </p>
                        <AnalysisLabelsBadge recording={rec} />
                      </div>
                      <div className="flex items-center gap-2.5 text-xs text-ev-warm-gray mt-1">
                        <span className="tabular-nums">{formatDuration(rec.duration)}</span>
                        <span className="text-ev-sand">&middot;</span>
                        <span className="tabular-nums">{formatFileSize(rec.file_size)}</span>
                        {rec.sample_rate && (
                          <>
                            <span className="text-ev-sand">&middot;</span>
                            <span className="tabular-nums">
                              {(rec.sample_rate / 1000).toFixed(1)} kHz
                            </span>
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
                        {rec.metadata?.animal_id && (
                          <span className="px-2 py-0.5 rounded-md bg-ev-cream/80 text-ev-elephant text-[11px] leading-tight">
                            Animal: {rec.metadata.animal_id}
                          </span>
                        )}
                        {rec.metadata?.noise_type_ref && (
                          <span className="px-2 py-0.5 rounded-md bg-accent-savanna/8 text-accent-savanna text-[11px] leading-tight">
                            Noise: {rec.metadata.noise_type_ref}
                          </span>
                        )}
                        {rec.metadata?.call_id && (
                          <span className="px-2 py-0.5 rounded-md bg-ev-warm-gray/10 text-ev-elephant text-[11px] leading-tight">
                            Call: {rec.metadata.call_id}
                          </span>
                        )}
                        {(rec.metadata?.start_sec !== undefined ||
                          rec.metadata?.end_sec !== undefined) && (
                          <span className="px-2 py-0.5 rounded-md bg-ev-warm-gray/8 text-ev-warm-gray text-[11px] leading-tight tabular-nums">
                            {rec.metadata?.start_sec?.toFixed(2) ?? "0.00"}s -{" "}
                            {rec.metadata?.end_sec?.toFixed(2) ?? "--"}s
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 self-center">
                    <StatusBadge status={rec.status} />

                    {rec.status === "pending" && (
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleProcess(rec.id);
                        }}
                        disabled={processingIds.has(rec.id)}
                        aria-label={`Process ${rec.filename}`}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-success to-success-light text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-shadow hover:shadow-md"
                      >
                        {processingIds.has(rec.id) ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Starting&hellip;</span>
                          </>
                        ) : (
                          <span>Process</span>
                        )}
                      </motion.button>
                    )}

                    {rec.status === "complete" && (
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(rec.id);
                        }}
                        aria-label={`Download ${rec.filename}`}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-accent-savanna/10 text-accent-savanna text-xs font-semibold rounded-lg hover:bg-accent-savanna/15 transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download</span>
                      </motion.button>
                    )}

                    {rec.status === "failed" && (
                      <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleProcess(rec.id);
                        }}
                        aria-label={`Retry processing ${rec.filename}`}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-danger/10 text-danger text-xs font-semibold rounded-lg hover:bg-danger/15 transition-colors"
                      >
                        <RotateCw className="w-3 h-3" />
                        <span>Retry</span>
                      </motion.button>
                    )}

                    {(rec.status === "complete" ||
                      rec.status === "processing") && (
                      <ChevronRight className="w-4 h-4 text-ev-dust group-hover:text-ev-warm-gray transition-colors" />
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
