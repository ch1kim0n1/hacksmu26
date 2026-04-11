// ---- API Endpoints ----

export const API_ENDPOINTS = {
  RECORDINGS: "/api/recordings",
  RECORDING: (id: string) => `/api/recordings/${id}`,
  RECORDING_UPLOAD: "/api/recordings/upload",
  RECORDING_PROCESS: (id: string) => `/api/recordings/${id}/process`,
  RECORDING_SPECTROGRAM: (id: string) => `/api/recordings/${id}/spectrogram`,
  RECORDING_DOWNLOAD: (id: string) => `/api/recordings/${id}/download`,
  CALLS: "/api/calls",
  CALL: (id: string) => `/api/calls/${id}`,
  STATS: "/api/stats",
  EXPORT: "/api/export",
} as const;

// ---- Processing Stages ----

export interface ProcessingStage {
  key: string;
  label: string;
  color: string;
}

export const PROCESSING_STAGES: ProcessingStage[] = [
  { key: "uploaded", label: "Uploaded", color: "#8B9BA5" },
  { key: "preprocessing", label: "Preprocessing", color: "#F5A025" },
  { key: "noise_reduction", label: "Noise Reduction", color: "#F5A025" },
  { key: "detecting", label: "Detecting Calls", color: "#C4A46C" },
  { key: "classifying", label: "Classifying", color: "#C4A46C" },
  { key: "analyzing", label: "Analyzing", color: "#C4A46C" },
  { key: "completed", label: "Completed", color: "#10C876" },
  { key: "failed", label: "Failed", color: "#EF4444" },
];

export const PROCESSING_STAGE_MAP: Record<string, ProcessingStage> =
  Object.fromEntries(PROCESSING_STAGES.map((s) => [s.key, s]));

// ---- Noise Type Labels ----

export const NOISE_TYPE_LABELS: Record<string, string> = {
  wind: "Wind Noise",
  rain: "Rain",
  insects: "Insect Chorus",
  birds: "Bird Calls",
  traffic: "Traffic",
  aircraft: "Aircraft",
  human: "Human Activity",
  water: "Water / Stream",
  thunder: "Thunder",
  unknown: "Unknown",
};

// ---- Color Palette ----

export const COLORS = {
  bg: "#F8F5F0",
  surface: "#141E24",
  surfaceElevated: "#1E2A32",
  border: "#D4CCC3",
  textPrimary: "#F0F5F8",
  textSecondary: "#8B9BA5",
  textMuted: "#5A6A75",
  accentTeal: "#C4A46C",
  success: "#10C876",
  warning: "#F5A025",
  danger: "#EF4444",
  gold: "#D4AF37",
  elephant: "#8B8680",
} as const;

// ---- Spectrogram Colormap ----

export const SPECTROGRAM_COLORMAP = [
  { stop: 0.0, color: "#0C1A2A" },
  { stop: 0.25, color: "#0A2E4A" },
  { stop: 0.4, color: "#006B8A" },
  { stop: 0.55, color: "#C4A46C" },
  { stop: 0.7, color: "#80ECFF" },
  { stop: 0.8, color: "#FFD700" },
  { stop: 0.9, color: "#FF8C00" },
  { stop: 1.0, color: "#EF4444" },
] as const;
