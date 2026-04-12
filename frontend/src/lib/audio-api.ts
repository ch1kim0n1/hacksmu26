import { fetchAPI, API_BASE } from "./api";

export { API_BASE };

export interface RecordingMetadata {
  location?: string;
  date?: string;
  recorded_at?: string;
  microphone_type?: string;
  notes?: string;
  species?: string;
  call_id?: string;
  animal_id?: string;
  noise_type_ref?: string;
  start_sec?: number;
  end_sec?: number;
  sample_rate?: number;
}

export interface QualityMetrics {
  snr_before_db?: number;
  snr_after_db?: number;
  snr_improvement_db?: number;
  quality_score?: number;
  quality_rating?: string;
  spectral_distortion?: number;
  energy_preservation?: number;
}

export interface RecordingResult {
  status: string;
  quality?: QualityMetrics;
  calls?: Call[];
  output_audio_path?: string;
  spectrogram_before_path?: string;
  spectrogram_after_path?: string;
  processing_time_s?: number;
}

export interface Recording {
  id: string;
  filename: string;
  status: string;
  duration_s: number;
  duration?: number;
  filesize_mb: number;
  file_size?: number;
  uploaded_at: string;
  created_at?: string;
  sample_rate?: number;
  location?: string;
  metadata?: RecordingMetadata;
  processing?: {
    progress_pct: number;
    current_stage?: string | null;
    started_at?: string | null;
    completed_at?: string | null;
    duration_s?: number | null;
  };
  call_id?: string;
  animal_id?: string;
  noise_type_ref?: string;
  start_sec?: number;
  end_sec?: number;
  result?: RecordingResult | null;
}

export interface RecordingListResponse {
  recordings: Recording[];
  total: number;
  returned: number;
}

export interface Call {
  id: string;
  recording_id: string;
  call_id?: string;
  animal_id?: string;
  noise_type_ref?: string;
  start_sec?: number;
  end_sec?: number;
  location?: string;
  date?: string;
  species?: string;
  call_type: string;
  start_ms: number;
  duration_ms: number;
  start_time: number;
  end_time: number;
  frequency_min_hz?: number;
  frequency_max_hz?: number;
  frequency_low?: number;
  frequency_high?: number;
  confidence?: number;
  review_status?: string;
  original_call_type?: string;
  corrected_call_type?: string | null;
  sequence_id?: string | null;
  sequence_position?: number | null;
  cluster_id?: string | null;
  fingerprint?: number[];
  color?: string | null;
  acoustic_features?: Record<string, unknown>;
  metadata?: RecordingMetadata;
}

export interface CallListResponse {
  calls: Call[];
  total: number;
}

export interface Stats {
  total_recordings: number;
  total_calls: number;
  avg_snr_improvement: number;
  success_rate: number;
  processing_time_avg: number;
}

export interface UploadResponse {
  message: string;
  recording_ids: string[];
  count: number;
}

export interface MarkerResponse {
  recording_id: string;
  total_markers: number;
  markers: Array<Call & { end_ms: number; color: string }>;
  summary: Record<string, number>;
}

export interface ActivityHeatmapResponse {
  heatmap: {
    hours: number[];
    call_types: string[];
    matrix: number[][];
  };
  total_calls: number;
  recordings_analyzed: number;
  date_range: { from?: string | null; to?: string | null };
}

export interface BatchSummary {
  batch_id: string;
  status: string;
  recordings: number;
  total_calls_detected: number;
  call_type_distribution: Record<string, number>;
  quality_scores: Record<string, number | null>;
  avg_snr_improvement_db?: number | null;
  total_processing_time_s: number;
  recordings_summary: Array<{
    recording_id: string;
    filename?: string | null;
    calls_detected: number;
    dominant_call_type?: string | null;
    quality_score?: number | null;
    snr_improvement_db?: number | null;
    status?: string | null;
  }>;
  shared_patterns: Array<Record<string, unknown>>;
}

export interface ReviewQueueResponse {
  total: number;
  returned: number;
  items: Call[];
}

export interface InfrasoundRevealResponse {
  recording_id: string;
  infrasound_detected: boolean;
  infrasound_regions: Array<{
    start_ms: number;
    end_ms: number;
    estimated_f0_hz: number;
    shifted_f0_hz?: number | null;
    energy_db: number;
  }>;
  shifted_audio_url: string;
  shift_octaves: number;
  frequency_range_original_hz: [number, number];
  frequency_range_shifted_hz: [number, number];
  infrasound_energy_pct: number;
  method: string;
  mix_mode: string;
}

export interface EmotionTimelineResponse {
  recording_id: string;
  duration_ms: number;
  resolution_ms: number;
  timeline: Array<{
    time_ms: number;
    state: string;
    arousal: number;
    valence: number;
    color: string;
    call_id?: string | null;
  }>;
  call_emotions: Array<Record<string, unknown>>;
  recording_summary: {
    dominant_state?: string;
    arousal_avg?: number;
    valence_avg?: number;
    state_distribution?: Record<string, number>;
  };
}

export interface CrossSpeciesComparison {
  elephant_call: Record<string, unknown>;
  reference: Record<string, unknown>;
  comparison: Record<string, unknown>;
  visualizations: Record<string, string>;
  feature_comparison: Record<string, unknown>;
}

function normalizeRecording(recording: Recording): Recording {
  const metadataSampleRate = Number(recording.metadata?.sample_rate ?? 0);
  const meta = recording.metadata;
  return {
    ...recording,
    duration: recording.duration_s,
    file_size: recording.filesize_mb,
    created_at: recording.uploaded_at,
    sample_rate:
      recording.sample_rate ??
      (metadataSampleRate > 0 ? metadataSampleRate : undefined),
    location: recording.location ?? (meta?.location as string | undefined),
    call_id: recording.call_id ?? (meta?.call_id as string | undefined),
    animal_id: recording.animal_id ?? (meta?.animal_id as string | undefined),
    noise_type_ref: recording.noise_type_ref ?? (meta?.noise_type_ref as string | undefined),
    start_sec: recording.start_sec ?? (typeof meta?.start_sec === "number" ? meta.start_sec : undefined),
    end_sec: recording.end_sec ?? (typeof meta?.end_sec === "number" ? meta.end_sec : undefined),
  };
}

export async function uploadFiles(
  files: File[],
  metadata?: Record<string, unknown>
): Promise<UploadResponse> {
  const uploadedIds: string[] = [];
  for (const file of files) {
    const formData = new FormData();
    formData.append("file", file);
    const params = new URLSearchParams();
    if (typeof metadata?.location === "string") params.set("location", metadata.location);
    if (typeof metadata?.date === "string") params.set("date", metadata.date);
    if (typeof metadata?.recorded_at === "string") params.set("recorded_at", metadata.recorded_at);
    if (typeof metadata?.notes === "string") params.set("notes", metadata.notes);
    const query = params.toString();
    const response = await fetchAPI<{
      message: string;
      recording_ids: string[];
      count: number;
    }>(`/api/upload${query ? `?${query}` : ""}`, {
      method: "POST",
      body: formData,
    });
    uploadedIds.push(...response.recording_ids);
  }

  return {
    message: `Uploaded ${uploadedIds.length} file(s) successfully`,
    recording_ids: uploadedIds,
    count: uploadedIds.length,
  };
}

export async function getRecordings(params?: {
  limit?: number;
  offset?: number;
  status?: string;
  location?: string;
}): Promise<RecordingListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params?.offset !== undefined) searchParams.set("offset", String(params.offset));
  if (params?.status) searchParams.set("status", params.status);
  if (params?.location) searchParams.set("location", params.location);
  const query = searchParams.toString();
  const response = await fetchAPI<RecordingListResponse>(`/api/recordings${query ? `?${query}` : ""}`);
  return {
    ...response,
    recordings: response.recordings.map(normalizeRecording),
  };
}

export async function getRecording(id: string): Promise<Recording> {
  const recording = await fetchAPI<Recording>(`/api/recordings/${id}`);
  return normalizeRecording(recording);
}

export async function processRecording(
  id: string,
  options?: {
    method?: "spectral" | "hybrid" | "deep";
    aggressiveness?: number;
    preset?: "demo";
  }
): Promise<{ id: string; status: string; method: string; preset?: string | null }> {
  const params = new URLSearchParams();
  if (options?.method) params.set("method", options.method);
  if (typeof options?.aggressiveness === "number") {
    params.set("aggressiveness", String(options.aggressiveness));
  }
  if (options?.preset) params.set("preset", options.preset);
  const query = params.toString();
  return fetchAPI(`/api/recordings/${id}/process${query ? `?${query}` : ""}`, {
    method: "POST",
  });
}

export async function processBatch(params: {
  recording_ids: string[];
  method?: "spectral" | "hybrid" | "deep";
  aggressiveness?: number;
}): Promise<{ batch_id: string; queued: number; status: string }> {
  return fetchAPI("/api/recordings/batch-process", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function getBatchSummary(batchId: string): Promise<BatchSummary> {
  return fetchAPI<BatchSummary>(`/api/batch/${batchId}/summary`);
}

export async function getRecordingMarkers(id: string): Promise<MarkerResponse> {
  return fetchAPI<MarkerResponse>(`/api/recordings/${id}/markers`);
}

export async function revealInfrasound(id: string, params?: {
  shift_octaves?: number;
  method?: "phase_vocoder" | "resample";
  mix_mode?: "shifted_only" | "blended" | "side_by_side";
}): Promise<InfrasoundRevealResponse> {
  return fetchAPI<InfrasoundRevealResponse>(`/api/recordings/${id}/infrasound-reveal`, {
    method: "POST",
    body: JSON.stringify({
      shift_octaves: params?.shift_octaves ?? 3,
      method: params?.method ?? "phase_vocoder",
      mix_mode: params?.mix_mode ?? "shifted_only",
    }),
  });
}

export function getInfrasoundShiftedAudioUrl(recordingId: string): string {
  return `${API_BASE}/api/recordings/${recordingId}/audio/infrasound-shifted`;
}

export async function getEmotionTimeline(id: string): Promise<EmotionTimelineResponse> {
  return fetchAPI<EmotionTimelineResponse>(`/api/recordings/${id}/emotion-timeline`);
}

export async function getReferenceCalls(): Promise<Array<Record<string, unknown>>> {
  return fetchAPI<Array<Record<string, unknown>>>("/api/reference-calls");
}

export async function compareCrossSpecies(params: {
  elephant_call_id: string;
  reference_id: string;
}): Promise<CrossSpeciesComparison> {
  return fetchAPI<CrossSpeciesComparison>("/api/compare/cross-species", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function getRecordingSpectrogram(id: string, type: "before" | "after" | "comparison" = "after"): string {
  return `${API_BASE}/api/recordings/${id}/spectrogram?type=${type}`;
}

export async function downloadRecording(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/recordings/${id}/download`);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  const blob = await response.blob();
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `recording-${id}.wav`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(anchor.href);
}

export async function getStats(): Promise<Stats> {
  return fetchAPI<Stats>("/api/stats");
}

export async function getCalls(params?: {
  limit?: number;
  offset?: number;
  call_type?: string;
  recording_id?: string;
}): Promise<CallListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params?.offset !== undefined) searchParams.set("offset", String(params.offset));
  if (params?.call_type) searchParams.set("call_type", params.call_type);
  if (params?.recording_id) searchParams.set("recording_id", params.recording_id);
  const query = searchParams.toString();
  const response = await fetchAPI<{ calls?: Call[]; items?: Call[]; total: number }>(
    `/api/calls${query ? `?${query}` : ""}`
  );
  const rows = response.calls ?? response.items ?? [];
  const calls = rows.map((call) => ({
    ...call,
    start_time: call.start_ms / 1000,
    end_time: (call.start_ms + call.duration_ms) / 1000,
    frequency_low: call.frequency_min_hz,
    frequency_high: call.frequency_max_hz,
  }));
  return { calls, total: response.total };
}

export async function getCall(id: string): Promise<Call> {
  const call = await fetchAPI<Call>(`/api/calls/${id}`);
  return {
    ...call,
    start_time: call.start_ms / 1000,
    end_time: (call.start_ms + call.duration_ms) / 1000,
    frequency_low: call.frequency_min_hz,
    frequency_high: call.frequency_max_hz,
  };
}

export interface SpectrogramData {
  recording_id: string;
  width: number;
  height: number;
  duration_s: number;
  freq_max_hz: number;
  sample_rate: number;
  magnitudes: number[][];
}

export async function getSpectrogramData(
  recordingId: string,
  options?: { width?: number; height?: number }
): Promise<SpectrogramData> {
  const params = new URLSearchParams();
  if (options?.width) params.set("width", String(options.width));
  if (options?.height) params.set("height", String(options.height));
  const query = params.toString();
  return fetchAPI<SpectrogramData>(
    `/api/recordings/${recordingId}/spectrogram-data${query ? `?${query}` : ""}`
  );
}

export async function exportResearch(params: {
  format: string;
  recording_ids: string[];
  call_types?: string[];
  min_confidence?: number | null;
  include_audio?: boolean;
  include_spectrograms?: boolean;
  include_fingerprints?: boolean;
  include_audio_clips?: boolean;
}): Promise<Blob> {
  const response = await fetch(`${API_BASE}/api/export/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    throw new Error(`Export failed: ${response.status} ${response.statusText}`);
  }
  return response.blob();
}

export async function getActivityHeatmap(params?: {
  location?: string;
  date_from?: string;
  date_to?: string;
}): Promise<ActivityHeatmapResponse> {
  const searchParams = new URLSearchParams();
  if (params?.location) searchParams.set("location", params.location);
  if (params?.date_from) searchParams.set("date_from", params.date_from);
  if (params?.date_to) searchParams.set("date_to", params.date_to);
  const query = searchParams.toString();
  return fetchAPI<ActivityHeatmapResponse>(`/api/stats/activity-heatmap${query ? `?${query}` : ""}`);
}

export async function getReviewQueue(params?: {
  status?: string;
  max_confidence?: number;
  call_type?: string;
  limit?: number;
  offset?: number;
}): Promise<ReviewQueueResponse> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (typeof params?.max_confidence === "number") searchParams.set("max_confidence", String(params.max_confidence));
  if (params?.call_type) searchParams.set("call_type", params.call_type);
  if (typeof params?.limit === "number") searchParams.set("limit", String(params.limit));
  if (typeof params?.offset === "number") searchParams.set("offset", String(params.offset));
  const query = searchParams.toString();
  const response = await fetchAPI<ReviewQueueResponse>(`/api/review-queue${query ? `?${query}` : ""}`);
  return {
    ...response,
    items: response.items.map((call) => ({
      ...call,
      start_time: call.start_ms / 1000,
      end_time: (call.start_ms + call.duration_ms) / 1000,
      frequency_low: call.frequency_min_hz,
      frequency_high: call.frequency_max_hz,
    })),
  };
}

export async function reviewCall(
  callId: string,
  payload: { action: "confirm" | "reclassify" | "discard"; corrected_call_type?: string; reviewer?: string }
): Promise<Call> {
  return fetchAPI<Call>(`/api/calls/${callId}/review`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function retrainClassifier(): Promise<Record<string, unknown>> {
  return fetchAPI<Record<string, unknown>>("/api/classifier/retrain", {
    method: "POST",
  });
}
