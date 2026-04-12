"use client";

import { useEffect, useState, useMemo } from "react";
import useWebSocket, { type WSMessage } from "./useWebSocket";

interface StageInfo {
  name: string;
  status: "pending" | "active" | "complete";
}

interface QualityInfo {
  snr_before: number;
  snr_after: number;
  improvement: number;
  score: number;
}

export interface ProcessingState {
  status: "idle" | "connecting" | "processing" | "complete" | "error";
  currentStage: string;
  progress: number;
  stages: StageInfo[];
  quality: QualityInfo | null;
  noiseType: string | null;
  callCount: number | null;
  spectrograms: { before?: string; after?: string };
  liveEvents: string[];
  error: string | null;
}

const INITIAL_STAGES: StageInfo[] = [
  { name: "ingestion", status: "pending" },
  { name: "spectrogram", status: "pending" },
  { name: "noise_classification", status: "pending" },
  { name: "noise_removal", status: "pending" },
  { name: "feature_extraction", status: "pending" },
  { name: "quality_assessment", status: "pending" },
  { name: "complete", status: "pending" },
];

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";

function buildWSUrl(recordingId: string): string {
  return `${WS_BASE}/processing/${recordingId}`;
}

export default function useProcessingJob(
  recordingId: string | null
): ProcessingState {
  const wsUrl = useMemo(
    () => (recordingId ? buildWSUrl(recordingId) : null),
    [recordingId]
  );

  const { lastMessage, isConnected } = useWebSocket(wsUrl);

  const [state, setState] = useState<ProcessingState>({
    status: "idle",
    currentStage: "",
    progress: 0,
    stages: INITIAL_STAGES.map((s) => ({ ...s })),
    quality: null,
    noiseType: null,
    callCount: null,
    spectrograms: {},
    liveEvents: [],
    error: null,
  });

  // Single source of truth for live state: backend websocket event stream.
  useEffect(() => {
    if (!recordingId) {
      setState({
        status: "idle",
        currentStage: "",
        progress: 0,
        stages: INITIAL_STAGES.map((s) => ({ ...s })),
        quality: null,
        noiseType: null,
        callCount: null,
        spectrograms: {},
        liveEvents: [],
        error: null,
      });
      return;
    }
    if (isConnected) {
      setState((prev) =>
        prev.status === "idle" ? { ...prev, status: "connecting" } : prev
      );
    }
  }, [recordingId, isConnected]);

  // Handle incoming messages
  useEffect(() => {
    if (!lastMessage) return;

    const msg: WSMessage = lastMessage;

    switch (msg.type) {
      case "PROCESSING_STARTED": {
        setState((prev) => ({
          ...prev,
          status: "processing",
          error: null,
        }));
        break;
      }

      case "STAGE_UPDATE": {
        const stageName = msg.data.stage as string;
        const stageStatus = msg.data.status as
          | "pending"
          | "active"
          | "complete";
        const progress = (msg.data.progress as number) ?? 0;

        setState((prev) => {
          const stageIndex = prev.stages.findIndex((s) => s.name === stageName);

          const newStages = prev.stages.map((s, index) => {
            if (stageName === "complete") {
              return { ...s, status: "complete" as const };
            }
            if (stageIndex >= 0) {
              if (index < stageIndex) {
                return { ...s, status: "complete" as const };
              }
              if (index === stageIndex) {
                return { ...s, status: stageStatus };
              }
            }
            return s;
          });

          return {
            ...prev,
            status: "processing",
            currentStage: stageName,
            progress,
            stages: newStages,
            noiseType: typeof msg.data.noise_type === "string" ? msg.data.noise_type : prev.noiseType,
            callCount: typeof msg.data.call_count === "number" ? msg.data.call_count : prev.callCount,
            spectrograms: typeof msg.data.spectrogram_url === "string"
              ? {
                  ...prev.spectrograms,
                  [msg.data.variant === "before" ? "before" : "after"]: msg.data.spectrogram_url,
                }
              : prev.spectrograms,
            liveEvents: [stageName, ...prev.liveEvents.filter((event) => event !== stageName)].slice(0, 8),
          };
        });
        break;
      }

      case "QUALITY_SCORE": {
        const quality: QualityInfo = {
          snr_before: Number(msg.data.snr_before ?? msg.data.snr_before_db ?? 0),
          snr_after: Number(msg.data.snr_after ?? msg.data.snr_after_db ?? 0),
          improvement: Number(msg.data.improvement ?? msg.data.snr_improvement_db ?? 0),
          score: Number(msg.data.score ?? msg.data.quality_score ?? 0),
        };

        setState((prev) => ({
          ...prev,
          quality,
        }));
        break;
      }

      case "PROCESSING_COMPLETE": {
        const quality: QualityInfo | null = msg.data.quality
          ? {
              snr_before: Number(
                (msg.data.quality as Record<string, unknown>).snr_before_db ?? 0
              ),
              snr_after: Number(
                (msg.data.quality as Record<string, unknown>).snr_after_db ?? 0
              ),
              improvement: Number(
                (msg.data.quality as Record<string, unknown>).snr_improvement_db ?? 0
              ),
              score: Number(
                (msg.data.quality as Record<string, unknown>).quality_score ?? 0
              ),
            }
          : null;

        setState((prev) => ({
          ...prev,
          status: "complete",
          progress: 100,
          currentStage: "complete",
          stages: prev.stages.map((s) => ({ ...s, status: "complete" as const })),
          quality: quality ?? prev.quality,
          noiseType: typeof msg.data.noise_type === "string" ? msg.data.noise_type : prev.noiseType,
          callCount: typeof msg.data.call_count === "number" ? msg.data.call_count : prev.callCount,
          liveEvents: ["complete", ...prev.liveEvents.filter((event) => event !== "complete")].slice(0, 8),
        }));
        break;
      }

      case "PROCESSING_FAILED": {
        const errorMsg =
          (msg.data.error as string) || "Processing failed";

        setState((prev) => ({
          ...prev,
          status: "error",
          error: errorMsg,
        }));
        break;
      }
    }
  }, [lastMessage]);

  return state;
}
