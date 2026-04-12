import { fetchAPI, API_BASE } from "./api";

export { API_BASE };

export interface RecordingMetadata {
  location?: string;
  date?: string;
  recorded_at?: string;
  microphone_type?: string;
  notes?: string;
  species?: string;
  original_filename?: string;
  source_format?: string;
  source_content_type?: string;
  channels?: number;
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
  speaker_separation?: SpeakerSeparationResult;
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
  ethology?: EthologyAnnotation | null;
  reference_matches?: ReferenceMatch[];
  publishability?: PublishabilityScore | null;
  speaker_id?: string | null;
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
  calls_recovered?: number;
  publishable_calls?: number;
  recordings_saved?: number;
  noise_types_defeated?: Record<string, number>;
  avg_snr_improvement_db?: number;
  total_noise_energy_removed_percent?: number;
  total_noise_energy_removed_pct?: number;
  speakers_identified?: number;
  hours_of_clean_audio?: number;
}

export interface UploadResponse {
  message: string;
  recording_ids: string[];
  count: number;
  status?: string;
  total_duration_s?: number;
  duplicate?: boolean;
  items?: Array<{
    recording_id: string;
    status: string;
    duplicate?: boolean;
  }>;
}

export interface RecordingStatusResponse {
  id: string;
  status: string;
  progress_pct: number;
  stage?: string | null;
  elapsed_s?: number | null;
  estimated_remaining_s?: number | null;
  message: string;
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
  elephant_call: {
    call_id: string;
    call_type: string;
    recording_id: string;
  };
  reference: {
    id: string;
    species: string;
    call_type: string;
    description: string;
  };
  comparison: {
    frequency_overlap_pct: number;
    spectral_similarity: number;
    harmonic_similarity: number;
    temporal_similarity: number;
    shared_frequency_range_hz: [number, number] | null;
    insight: string;
  };
  visualizations?: Record<string, string>;
  feature_comparison: Record<string, {
    elephant: number;
    reference: number;
    difference_pct: number;
  }>;
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
  const uploadedItems: NonNullable<UploadResponse["items"]> = [];
  let totalDuration = 0;
  let duplicateCount = 0;
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
      status: string;
      recording_ids: string[];
      count: number;
      total_duration_s: number;
      duplicate?: boolean;
    }>(`/api/upload${query ? `?${query}` : ""}`, {
      method: "POST",
      body: formData,
    });
    uploadedIds.push(...response.recording_ids);
    totalDuration += response.total_duration_s ?? 0;
    if (response.duplicate) duplicateCount += response.recording_ids.length;
    for (const recordingId of response.recording_ids) {
      uploadedItems.push({
        recording_id: recordingId,
        status: response.status,
        duplicate: response.duplicate,
      });
    }
  }

  const freshCount = uploadedIds.length - duplicateCount;
  const message =
    duplicateCount > 0 && freshCount > 0
      ? `Uploaded ${freshCount} new file(s); ${duplicateCount} duplicate file(s) already existed`
      : duplicateCount > 0
        ? `${duplicateCount} duplicate file(s) already existed`
        : `Uploaded ${uploadedIds.length} file(s) successfully`;

  return {
    message,
    recording_ids: uploadedIds,
    count: uploadedIds.length,
    status: uploadedItems.length === 1 ? uploadedItems[0].status : undefined,
    total_duration_s: totalDuration,
    duplicate: duplicateCount > 0 && duplicateCount === uploadedIds.length,
    items: uploadedItems,
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

export async function getRecordingStatus(id: string): Promise<RecordingStatusResponse> {
  return fetchAPI<RecordingStatusResponse>(`/api/recordings/${id}/status`);
}

export async function processRecording(
  id: string,
  options?: {
    method?: "spectral" | "hybrid" | "deep" | "adaptive" | "wiener";
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

export async function compareCrossSpecies(
  callIdOrParams: string | { elephant_call_id: string; reference_id: string },
  referenceId?: string
): Promise<CrossSpeciesComparison> {
  const callId = typeof callIdOrParams === "string" ? callIdOrParams : callIdOrParams.elephant_call_id;
  const refId = typeof callIdOrParams === "string" ? referenceId! : callIdOrParams.reference_id;
  return fetchAPI<CrossSpeciesComparison>(
    `/api/compare/cross-species?call_id=${encodeURIComponent(callId)}&reference_id=${encodeURIComponent(refId)}`,
    { method: "POST" }
  );
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

export interface ReferenceSpecies {
  id: string;
  species: string;
  call_type: string;
  description: string;
  frequency_range_hz: [number, number];
}

export async function getReferenceSpecies(): Promise<{ references: ReferenceSpecies[] }> {
  return fetchAPI<{ references: ReferenceSpecies[] }>("/api/reference-calls");
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

// ─── Research Features: Ethology, Reference Library, Profiles, Social Network ───

export interface EthologyAnnotation {
  label: string;
  meaning: string;
  behavioral_context: string;
  social_function: string;
  range_km: number;
  typical_duration_s: [number, number];
  typical_frequency_hz: [number, number];
  caller_state: string;
  common_response: string;
  source: string;
}

export async function getEthologyAnnotations(): Promise<Record<string, EthologyAnnotation>> {
  return fetchAPI<Record<string, EthologyAnnotation>>("/api/ethology");
}

export async function getCallEthology(callId: string): Promise<{ call_id: string; ethology: EthologyAnnotation | null }> {
  return fetchAPI<{ call_id: string; ethology: EthologyAnnotation | null }>(`/api/calls/${callId}/ethology`);
}

export interface ReferenceRumble {
  id: string;
  label: string;
  behavioral_context: string;
  fundamental_hz: number;
  harmonic_count: number;
  typical_duration_s: number;
  bandwidth_hz: number;
  harmonicity: number;
  spectral_centroid_hz: number;
  spectral_entropy: number;
  snr_db: number;
  source: string;
}

export interface ReferenceMatch {
  rumble_id: string;
  label: string;
  behavioral_context: string;
  similarity_score: number;
  fundamental_hz: number | null;
}

export async function getReferenceLibrary(): Promise<ReferenceRumble[]> {
  return fetchAPI<ReferenceRumble[]>("/api/reference-library");
}

export async function getCallReferenceMatches(callId: string, topK?: number): Promise<ReferenceMatch[]> {
  const params = topK ? `?top_k=${topK}` : "";
  return fetchAPI<ReferenceMatch[]>(`/api/calls/${callId}/reference-matches${params}`);
}

export interface ElephantProfile {
  individual_id: string;
  call_count: number;
  recording_count: number;
  recordings: string[];
  locations: string[];
  dates: string[];
  most_common_type: string;
  call_type_distribution: Record<string, number>;
  acoustic_signature: {
    fundamental_frequency_hz: number;
    harmonicity: number;
    bandwidth_hz: number;
    snr_db: number;
    spectral_centroid_hz: number;
    duration_s: number;
    pitch_contour_slope: number;
    spectral_entropy: number;
  };
  active_hours: Record<string, number>;
  social_connections: string[];
}

export async function getElephants(): Promise<ElephantProfile[]> {
  return fetchAPI<ElephantProfile[]>("/api/elephants");
}

export async function getElephant(id: string): Promise<ElephantProfile> {
  return fetchAPI<ElephantProfile>(`/api/elephants/${encodeURIComponent(id)}`);
}

export async function getElephantCalls(id: string): Promise<CallListResponse> {
  const response = await fetchAPI<{ items?: Call[]; total: number }>(
    `/api/elephants/${encodeURIComponent(id)}/calls`
  );
  const calls = (response.items ?? []).map((call) => ({
    ...call,
    start_time: call.start_ms / 1000,
    end_time: (call.start_ms + call.duration_ms) / 1000,
    frequency_low: call.frequency_min_hz,
    frequency_high: call.frequency_max_hz,
  }));
  return { calls, total: response.total };
}

export interface SocialNetworkData {
  nodes: Array<{
    id: string;
    call_count: number;
    most_common_type: string;
    recordings: string[];
    locations: string[];
    dates: string[];
  }>;
  edges: Array<{
    source: string;
    target: string;
    shared_recordings: number;
    call_response_pairs: number;
    weight: number;
  }>;
  stats: {
    total_individuals: number;
    total_connections: number;
    most_connected: string;
    avg_connections: number;
  };
}

export async function getSocialNetwork(): Promise<SocialNetworkData> {
  return fetchAPI<SocialNetworkData>("/api/social-network");
}

export interface ConversationData {
  recording_id: string;
  speakers: Array<{ id: string; call_count: number; dominant_type: string }>;
  calls: Array<{
    call_id: string;
    speaker_id: string;
    start_ms: number;
    duration_ms: number;
    call_type: string;
    confidence: number;
  }>;
  response_pairs: Array<{
    call_id: string;
    response_id: string;
    gap_ms: number;
    speaker_a: string;
    speaker_b: string;
  }>;
  total_exchanges: number;
  longest_sequence_length: number;
}

export async function getRecordingConversation(recordingId: string): Promise<ConversationData> {
  return fetchAPI<ConversationData>(`/api/recordings/${recordingId}/conversation`);
}

// ─── Speaker Separation ───

export interface SpeakerData {
  id: string;
  fundamental_hz: number;
  harmonic_count: number;
  energy_ratio: number;
  duration_s: number;
}

export interface SpeakerSeparationResult {
  speaker_count: number;
  speakers: SpeakerData[];
}

export async function getRecordingSpeakers(recordingId: string): Promise<SpeakerSeparationResult> {
  return fetchAPI<SpeakerSeparationResult>(`/api/recordings/${recordingId}/speakers`);
}

export function getSpeakerAudioUrl(recordingId: string, speakerId: string): string {
  return `${API_BASE}/api/recordings/${recordingId}/speakers/${speakerId}/download`;
}

// ─── Harmonic Decomposition ───

export interface HarmonicBand {
  order: number;
  frequency_hz: number;
  energy_before: number;
  energy_after: number;
  snr_before_db: number;
  snr_after_db: number;
  energy_preserved_pct: number;
  spectrogram_slice_b64: string;
}

export interface HarmonicDecompositionData {
  fundamental_hz: number;
  harmonics: HarmonicBand[];
  total_harmonics_detected: number;
}

export async function getCallHarmonics(callId: string): Promise<HarmonicDecompositionData> {
  return fetchAPI<HarmonicDecompositionData>(`/api/calls/${callId}/harmonics`);
}

// ─── Publishability & Research Summary ───

export interface PublishabilityScore {
  score: number;
  tier: string;
  tier_label: string;
  components: Record<string, { value: number; weight: number; contribution: number }>;
}

export interface RecordingSummary2 {
  recording_id: string;
  filename: string;
  duration_s: number;
  processing_date: string;
  noise_environment: { primary_type: string; severity: string; pct_affected: number };
  call_inventory: {
    total_calls: number;
    by_type: Record<string, number>;
    by_tier: Record<string, number>;
    individuals_detected: number;
    individual_ids: string[];
  };
  quality_assessment: {
    avg_publishability_score: number;
    avg_snr_improvement_db: number;
    best_call_id: string | null;
    best_call_score: number;
  };
  notable_findings: string[];
  recommended_actions: string[];
}

export async function getRecordingSummary(recordingId: string): Promise<RecordingSummary2> {
  return fetchAPI<RecordingSummary2>(`/api/recordings/${recordingId}/summary`);
}

// ─── Research Impact Stats (extended) ───

export interface ResearchImpactStats extends Stats {
  calls_recovered: number;
  publishable_calls: number;
  recordings_saved: number;
  noise_types_defeated: Record<string, number>;
  avg_snr_improvement_db: number;
  total_noise_energy_removed_pct: number;
  speakers_identified: number;
  hours_of_clean_audio: number;
}

export async function getResearchImpactStats(): Promise<ResearchImpactStats> {
  return fetchAPI<ResearchImpactStats>("/api/stats/research-impact");
}

// ─── ML Training & Active Learning ───

export interface MLLabelingQueueItem {
  call_id: string;
  call_type: string;
  confidence: number;
  recording_id: string;
  start_ms: number;
  duration_ms: number;
  acoustic_features?: Record<string, unknown>;
}

export async function getMLLabelingQueue(limit = 10): Promise<MLLabelingQueueItem[]> {
  return fetchAPI<MLLabelingQueueItem[]>(`/api/ml/labeling-queue?limit=${limit}`);
}

export async function labelMLCall(
  callId: string,
  payload: { call_type_refined: string; social_function: string }
): Promise<{ status: string; labels_since_last_train: number; retrain_threshold: number; should_retrain: boolean }> {
  return fetchAPI(`/api/ml/label/${callId}`, { method: "POST", body: JSON.stringify(payload) });
}

export async function trainMLClassifier(): Promise<{
  status: string; model_path: string; accuracy: number; training_time_s: number;
}> {
  return fetchAPI("/api/ml/train", { method: "POST" });
}

export async function predictMLCall(callId: string): Promise<{
  call_id: string; call_type: string; social_function: string; confidence: number;
  top_features: Array<[string, number]>; narrative_text: string;
}> {
  return fetchAPI(`/api/ml/predict/${callId}`);
}

export interface MLBenchmarks {
  accuracy_over_time: Array<[number, number]>;
  call_type: Record<string, unknown>;
  social_function: Record<string, unknown>;
}

export async function getMLBenchmarks(): Promise<MLBenchmarks> {
  return fetchAPI<MLBenchmarks>("/api/ml/benchmarks");
}

export async function getMLBenchmarksLatest(): Promise<{
  call_type: { label_count: number; metrics: Record<string, unknown> };
  social_function: { label_count: number; metrics: Record<string, unknown> };
}> {
  return fetchAPI("/api/ml/benchmarks/latest");
}

// ─── Call Comparison ───

export interface CallComparisonResult {
  call_a_id: string;
  call_b_id: string;
  similarity_score: number;
  fingerprint_distance: number;
  overlay: {
    spectrogram_overlay_url: string;
    waveform_overlay_url: string;
    difference_heatmap_url: string;
    aligned: boolean;
    time_stretch_factor: number;
  };
  dimension_breakdown: {
    timbral_similarity: number;
    pitch_contour_similarity: number;
    temporal_dynamics_similarity: number;
    energy_profile_similarity: number;
  };
}

export async function compareCalls(callA: string, callB: string): Promise<CallComparisonResult> {
  return fetchAPI<CallComparisonResult>(`/api/calls/compare?call_a=${encodeURIComponent(callA)}&call_b=${encodeURIComponent(callB)}`);
}

export function getCallCompareOverlayUrl(callA: string, callB: string, type: "spectrogram" | "waveform" | "difference" = "spectrogram"): string {
  return `${API_BASE}/api/calls/compare-overlay.png?call_a=${encodeURIComponent(callA)}&call_b=${encodeURIComponent(callB)}&type=${type}`;
}

export interface SimilarCallMatch {
  call_id: string;
  recording_id: string | null;
  call_type: string;
  similarity: number;
}

export async function getSimilarCalls(callId: string, limit = 10): Promise<{
  query_call_id: string; matches: SimilarCallMatch[]; fingerprint_version: string;
}> {
  return fetchAPI(`/api/calls/${callId}/similar?limit=${limit}`);
}

export async function getSimilarContours(callId: string, params?: {
  call_type?: string; limit?: number; min_similarity?: number; method?: "dtw" | "pearson";
}): Promise<{ query_call_id: string; matches: SimilarCallMatch[]; total_compared: number }> {
  const searchParams = new URLSearchParams();
  if (params?.call_type) searchParams.set("call_type", params.call_type);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.min_similarity) searchParams.set("min_similarity", String(params.min_similarity));
  if (params?.method) searchParams.set("method", params.method);
  const query = searchParams.toString();
  return fetchAPI(`/api/calls/${callId}/similar-contours${query ? `?${query}` : ""}`);
}

// ─── Pattern Detection ───

export interface BehavioralPattern {
  pattern_id: string;
  motif: string[];
  pattern: string;
  occurrences: number;
  recordings: string[];
  avg_gap_ms: number;
}

export async function getPatterns(minOccurrences = 2): Promise<BehavioralPattern[]> {
  return fetchAPI<BehavioralPattern[]>(`/api/patterns?min_occurrences=${minOccurrences}`);
}

export async function getPatternInstances(patternId: string): Promise<{
  pattern: BehavioralPattern; instances: Array<Record<string, unknown>>;
}> {
  return fetchAPI(`/api/patterns/${encodeURIComponent(patternId)}/instances`);
}

// ─── Call Annotations ───

export interface CallAnnotation {
  id: string;
  call_id: string;
  note: string;
  tags: string[];
  researcher_id: string | null;
  created_at: string;
}

export async function addCallAnnotation(
  callId: string,
  payload: { note: string; tags?: string[]; researcher_id?: string }
): Promise<CallAnnotation> {
  return fetchAPI<CallAnnotation>(`/api/calls/${callId}/annotations`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getCallAnnotations(callId: string): Promise<CallAnnotation[]> {
  return fetchAPI<CallAnnotation[]>(`/api/calls/${callId}/annotations`);
}

export async function deleteCallAnnotation(callId: string, annotationId: string): Promise<{ deleted: boolean }> {
  return fetchAPI(`/api/calls/${callId}/annotations/${annotationId}`, { method: "DELETE" });
}

// ─── Model Management ───

export interface ModelVersionInfo {
  version: string;
  active: boolean;
  model_path: string;
  metadata_path: string | null;
  trained_at: string | null;
  samples: number | null;
  classes: number | null;
  accuracy: number | null;
  ece: number | null;
  class_distribution: Record<string, number>;
}

export async function getModels(): Promise<ModelVersionInfo[]> {
  return fetchAPI<ModelVersionInfo[]>("/api/models");
}

export async function activateModel(version: string): Promise<ModelVersionInfo> {
  return fetchAPI<ModelVersionInfo>(`/api/models/${encodeURIComponent(version)}/activate`, { method: "POST" });
}

// ─── Site Analytics ───

export interface SiteSummary {
  location: string;
  recording_count: number;
}

export async function getSites(): Promise<SiteSummary[]> {
  return fetchAPI<SiteSummary[]>("/api/sites");
}

export interface NoiseSource {
  noise_type: string;
  occurrence_rate: number;
  avg_frequency_range_hz: [number, number];
  avg_energy_db: number;
  temporal_pattern: Record<string, unknown> | null;
}

export interface TimeWindow {
  start_hour: number;
  end_hour: number;
  avg_noise_db: number;
  dominant_noise: string | null;
}

export interface SiteNoiseProfile {
  location: string;
  recordings_analyzed: number;
  date_range: [string | null, string | null];
  noise_sources: NoiseSource[];
  noise_floor_db: number;
  optimal_windows: TimeWindow[];
  recommendations: string[];
}

export async function getSiteNoiseProfile(location: string): Promise<SiteNoiseProfile> {
  return fetchAPI<SiteNoiseProfile>(`/api/sites/${encodeURIComponent(location)}/noise-profile`);
}

export async function getSiteRecommendations(location: string): Promise<{
  location: string; optimal_windows: TimeWindow[]; recommendations: string[];
}> {
  return fetchAPI(`/api/sites/${encodeURIComponent(location)}/recommendations`);
}

// ─── Deep Analytics ───

export interface PopulationAnalytics {
  call_type_distribution: Record<string, number>;
  social_function_distribution: Record<string, number>;
  by_site: Record<string, { call_count: number; dominant_type: string }>;
  temporal_patterns: { hourly_distribution: number[]; call_rate_per_recording: number[] };
}

export async function getPopulationAnalytics(): Promise<PopulationAnalytics> {
  return fetchAPI<PopulationAnalytics>("/api/analytics/population");
}

export interface AnalyticsSocialGraph {
  nodes: Array<{ id: string; call_count: number; dominant_type: string }>;
  edges: Array<{ from: string; to: string; response_count: number; avg_ici_ms: number }>;
}

export async function getAnalyticsSocialGraph(): Promise<AnalyticsSocialGraph> {
  return fetchAPI<AnalyticsSocialGraph>("/api/analytics/social-graph");
}

export async function getRecordingFeatures(recordingId: string): Promise<{
  recording_id: string;
  call_count: number;
  call_types: Record<string, number>;
  feature_distributions: Record<string, { min: number; max: number; mean: number }>;
}> {
  return fetchAPI(`/api/analytics/recording/${recordingId}/features`);
}

// ─── Webhooks ───

export interface WebhookConfig {
  id: string;
  url: string;
  event_type: string;
  created_at: string;
}

export async function createWebhook(payload: { url: string; event_type: string }): Promise<WebhookConfig> {
  return fetchAPI<WebhookConfig>("/api/webhooks", { method: "POST", body: JSON.stringify(payload) });
}

export async function getWebhooks(): Promise<WebhookConfig[]> {
  return fetchAPI<WebhookConfig[]>("/api/webhooks");
}

export async function deleteWebhook(webhookId: string): Promise<{ id: string; deleted: boolean }> {
  return fetchAPI(`/api/webhooks/${webhookId}`, { method: "DELETE" });
}

// ─── Recording Metadata PATCH ───

export async function updateRecordingMetadata(
  recordingId: string,
  metadata: Partial<RecordingMetadata>
): Promise<Recording> {
  const recording = await fetchAPI<Recording>(`/api/recordings/${recordingId}/metadata`, {
    method: "PATCH",
    body: JSON.stringify(metadata),
  });
  return normalizeRecording(recording);
}
