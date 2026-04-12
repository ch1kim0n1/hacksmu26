"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  CloudUpload,
  Layers,
  Loader2,
} from "lucide-react";
import { getRecordings, uploadFiles, type Recording } from "@/lib/audio-api";
import { SoundWave } from "@/components/ui/motion-primitives";

function formatFileSize(bytes?: number): string {
  if (!bytes) return "--";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatCard({
  href,
  label,
  value,
  icon,
  delay = 0,
}: {
  href: string;
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
    >
      <Link
        href={href}
        className="glass group flex min-h-[88px] items-center rounded-2xl border border-ev-sand/30 p-4 transition-all duration-200 hover:border-ev-warm-gray/25 hover:bg-white/70 hover:shadow-[0_18px_40px_rgba(123,90,50,0.08)]"
      >
        <div className="flex w-full items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-savanna/12 to-accent-gold/5 text-accent-savanna">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-bold leading-tight text-ev-charcoal tabular-nums">
              {value}
            </p>
            <p className="truncate text-[11px] font-medium text-ev-warm-gray">
              {label}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-ev-dust transition-colors group-hover:text-ev-elephant" />
        </div>
      </Link>
    </motion.div>
  );
}

export default function UploadPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  const fetchRecordings = useCallback(async () => {
    try {
      setLoading(true);
      setStatsError(null);
      const data = await getRecordings({ limit: 100 });
      setRecordings(data.recordings);
    } catch (err) {
      setStatsError(
        err instanceof Error ? err.message : "Failed to load recording stats",
      );
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

  const completedCount = recordings.filter((r) => r.status === "complete").length;
  const pendingCount = recordings.filter((r) => r.status === "pending").length;
  const processingCount = recordings.filter((r) => r.status === "processing").length;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 lg:p-8">
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
          <p className="mt-1 text-sm text-ev-warm-gray">
            Upload elephant field recordings for AI-powered noise removal and
            vocalization analysis.
          </p>
        </div>
        <SoundWave
          bars={6}
          className="hidden h-6 sm:flex"
          color="bg-ev-elephant/55"
        />
      </motion.div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          href="/recordings"
          label="Total Recordings"
          value={loading ? "..." : recordings.length}
          icon={<Layers className="h-5 w-5" />}
          delay={0}
        />
        <StatCard
          href="/results"
          label="Completed"
          value={loading ? "..." : completedCount}
          icon={<CheckCircle2 className="h-5 w-5" />}
          delay={0.07}
        />
        <StatCard
          href="/recordings?status=pending"
          label="Pending"
          value={loading ? "..." : pendingCount}
          icon={<Clock className="h-5 w-5" />}
          delay={0.14}
        />
        <StatCard
          href="/recordings?status=processing"
          label="Processing"
          value={loading ? "..." : processingCount}
          icon={<Activity className="h-5 w-5" />}
          delay={0.21}
        />
      </div>

      {statsError && (
        <div className="rounded-xl border border-danger/15 bg-danger/5 p-4 text-sm text-danger">
          {statsError}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15, duration: 0.4 }}
      >
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`upload-zone-glow group relative cursor-pointer overflow-hidden rounded-2xl p-10 text-center transition-all duration-300 ${
            isDragging
              ? "active bg-accent-savanna/5 shadow-glow"
              : "border border-dashed border-ev-sand/60 bg-white/40 hover:border-accent-savanna/30 hover:bg-white/60"
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

          <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex h-8 justify-center gap-[3px] overflow-hidden opacity-[0.15]">
            {Array.from({ length: 24 }).map((_, i) => (
              <div
                key={i}
                className="w-[2px] rounded-full bg-accent-savanna"
                style={{
                  animation: "sound-bar 1.2s ease-in-out infinite",
                  animationDelay: `${i * 0.08}s`,
                  transformOrigin: "bottom",
                  height: "100%",
                }}
              />
            ))}
          </div>

          <div className="relative z-10 flex flex-col items-center gap-4">
            <motion.div
              animate={
                isDragging ? { scale: 1.1, rotate: 3 } : { scale: 1, rotate: 0 }
              }
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className={`flex h-14 w-14 items-center justify-center rounded-2xl transition-colors duration-300 ${
                isDragging
                  ? "bg-accent-savanna/15"
                  : "bg-ev-cream group-hover:bg-accent-savanna/10"
              }`}
            >
              <CloudUpload
                className={`h-7 w-7 transition-colors ${
                  isDragging
                    ? "text-accent-savanna"
                    : "text-ev-warm-gray group-hover:text-accent-savanna"
                }`}
              />
            </motion.div>

            <div>
              <p className="text-base font-semibold text-ev-charcoal">
                {isDragging ? "Drop files here" : "Drop .wav or .mp3 files here"}
              </p>
              <p className="mt-1 text-sm text-ev-warm-gray">
                or click to browse · Max 500 MB per file
              </p>
            </div>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              type="button"
              className="rounded-xl bg-gradient-to-r from-accent-savanna to-accent-gold px-6 py-2.5 text-sm font-medium text-white shadow-sm shadow-accent-savanna/20 transition-shadow hover:shadow-md hover:shadow-accent-savanna/25"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              Browse Files
            </motion.button>
          </div>

          <AnimatePresence>
            {uploading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="relative z-10 mt-8"
              >
                <div className="mx-auto w-full max-w-sm">
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="flex items-center gap-1.5 text-ev-elephant">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Uploading…
                    </span>
                    <span className="font-medium text-accent-savanna tabular-nums">
                      {Math.round(uploadProgress)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-ev-cream">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-accent-savanna to-accent-gold"
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

      <AnimatePresence>
        {uploadError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 rounded-xl border border-danger/15 bg-danger/5 p-4 text-sm text-danger"
          >
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            {uploadError}
          </motion.div>
        )}
        {uploadSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 rounded-xl border border-success/15 bg-success/5 p-4 text-sm text-success"
          >
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
            {uploadSuccess}
          </motion.div>
        )}
      </AnimatePresence>

      <section className="glass rounded-2xl border border-ev-sand/30 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ev-charcoal">
              Manage your recordings
            </h2>
            <p className="mt-1 text-sm text-ev-warm-gray">
              Review uploaded files, process pending work, and download finished
              outputs from the dedicated recordings page.
            </p>
          </div>
          <Link
            href="/recordings"
            className="inline-flex items-center gap-2 rounded-xl bg-ev-charcoal px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-ev-elephant"
          >
            Open Recordings
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
