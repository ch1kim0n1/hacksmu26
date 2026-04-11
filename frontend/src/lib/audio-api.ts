import { fetchAPI, API_BASE } from "./api";

// ---- Types ----

export interface Recording {
  id: string;
  filename: string;
  status: string;
  duration?: number;
  sample_rate?: number;
  location?: string;
  created_at: string;
  updated_at?: string;
  file_size?: number;
  metadata?: Record<string, unknown>;
}

export interface RecordingListResponse {
  recordings: Recording[];
  total: number;
  limit: number;
  offset: number;
}

export interface Call {
  id: string;
  recording_id: string;
  call_type: string;
  start_time: number;
  end_time: number;
  frequency_low?: number;
  frequency_high?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface CallListResponse {
  calls: Call[];
  total: number;
  limit: number;
  offset: number;
}

export interface Stats {
  total_recordings: number;
  total_calls: number;
  total_duration: number;
  processing_queue: number;
  storage_used: number;
}

export interface UploadResponse {
  recordings: Recording[];
  message: string;
}

export interface ExportResponse {
  download_url: string;
  format: string;
  recording_count: number;
}

// ---- API Functions ----

export async function uploadFiles(
  files: File[],
  metadata?: Record<string, unknown>
): Promise<UploadResponse> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append("files", file);
  });
  if (metadata) {
    formData.append("metadata", JSON.stringify(metadata));
  }

  return fetchAPI<UploadResponse>("/api/recordings/upload", {
    method: "POST",
    body: formData,
  });
}

export async function getRecordings(params?: {
  limit?: number;
  offset?: number;
  status?: string;
  location?: string;
}): Promise<RecordingListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit !== undefined)
    searchParams.set("limit", String(params.limit));
  if (params?.offset !== undefined)
    searchParams.set("offset", String(params.offset));
  if (params?.status) searchParams.set("status", params.status);
  if (params?.location) searchParams.set("location", params.location);

  const query = searchParams.toString();
  return fetchAPI<RecordingListResponse>(
    `/api/recordings${query ? `?${query}` : ""}`
  );
}

export async function getRecording(id: string): Promise<Recording> {
  return fetchAPI<Recording>(`/api/recordings/${id}`);
}

export async function processRecording(
  id: string
): Promise<{ message: string; status: string }> {
  return fetchAPI<{ message: string; status: string }>(
    `/api/recordings/${id}/process`,
    { method: "POST" }
  );
}

export function getRecordingSpectrogram(id: string): string {
  return `${API_BASE}/api/recordings/${id}/spectrogram`;
}

export async function downloadRecording(id: string): Promise<void> {
  const url = `${API_BASE}/api/recordings/${id}/download`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition");
  let filename = `recording-${id}`;

  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^";\n]+)"?/);
    if (match) {
      filename = match[1];
    }
  }

  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
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
  if (params?.limit !== undefined)
    searchParams.set("limit", String(params.limit));
  if (params?.offset !== undefined)
    searchParams.set("offset", String(params.offset));
  if (params?.call_type) searchParams.set("call_type", params.call_type);
  if (params?.recording_id)
    searchParams.set("recording_id", params.recording_id);

  const query = searchParams.toString();
  return fetchAPI<CallListResponse>(`/api/calls${query ? `?${query}` : ""}`);
}

export async function getCall(id: string): Promise<Call> {
  return fetchAPI<Call>(`/api/calls/${id}`);
}

export async function exportResearch(params: {
  format: string;
  recording_ids: string[];
}): Promise<ExportResponse> {
  return fetchAPI<ExportResponse>("/api/export", {
    method: "POST",
    body: JSON.stringify(params),
  });
}
