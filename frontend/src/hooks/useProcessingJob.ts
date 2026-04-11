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
  error: string | null;
}

const INITIAL_STAGES: StageInfo[] = [
  { name: "ingestion", status: "pending" },
  { name: "spectrogram", status: "pending" },
  { name: "noise_removal", status: "pending" },
  { name: "quality_assessment", status: "pending" },
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
    error: null,
  });

  // Update status based on connection
  useEffect(() => {
    if (!recordingId) {
      setState({
        status: "idle",
        currentStage: "",
        progress: 0,
        stages: INITIAL_STAGES.map((s) => ({ ...s })),
        quality: null,
        error: null,
      });
      return;
    }
    if (isConnected && state.status === "idle") {
      setState((prev) => ({ ...prev, status: "connecting" }));
    }
  }, [recordingId, isConnected, state.status]);

  // Handle incoming messages
  useEffect(() => {
    if (!lastMessage) return;

    const msg: WSMessage = lastMessage;

    switch (msg.type) {
      case "STAGE_UPDATE": {
        const stageName = msg.data.stage as string;
        const stageStatus = msg.data.status as
          | "pending"
          | "active"
          | "complete";
        const progress = (msg.data.progress as number) ?? state.progress;

        setState((prev) => {
          const newStages = prev.stages.map((s) => {
            if (s.name === stageName) {
              return { ...s, status: stageStatus };
            }
            return s;
          });

          return {
            ...prev,
            status: "processing",
            currentStage: stageName,
            progress,
            stages: newStages,
          };
        });
        break;
      }

      case "QUALITY_SCORE": {
        const quality: QualityInfo = {
          snr_before: msg.data.snr_before as number,
          snr_after: msg.data.snr_after as number,
          improvement: msg.data.improvement as number,
          score: msg.data.score as number,
        };

        setState((prev) => ({
          ...prev,
          quality,
        }));
        break;
      }

      case "PROCESSING_COMPLETE": {
        setState((prev) => ({
          ...prev,
          status: "complete",
          progress: 100,
          currentStage: "",
          stages: prev.stages.map((s) => ({ ...s, status: "complete" as const })),
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
