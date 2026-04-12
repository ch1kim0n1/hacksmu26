"use client";

import { useCallback } from "react";
import { useLocalStorage } from "./useLocalStorage";

export interface Annotation {
  id: string;
  type: "point" | "region";
  time_ms: number;
  frequency_hz: number;
  end_time_ms?: number;
  freq_max_hz?: number;
  text: string;
  tag: string;
  color: string;
  created_at: string;
}

export type NewAnnotation = Omit<Annotation, "id" | "created_at">;

export interface UseAnnotationsReturn {
  annotations: Annotation[];
  addAnnotation: (ann: NewAnnotation) => void;
  removeAnnotation: (id: string) => void;
  clearAnnotations: () => void;
}

export function useAnnotations(recordingId: string): UseAnnotationsReturn {
  const storageKey = `echofield:annotations:${recordingId}`;
  const [annotations, setAnnotations] = useLocalStorage<Annotation[]>(storageKey, []);

  const addAnnotation = useCallback(
    (ann: NewAnnotation) => {
      const newAnn: Annotation = {
        ...ann,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      };
      setAnnotations([...annotations, newAnn]);
    },
    [annotations, setAnnotations]
  );

  const removeAnnotation = useCallback(
    (id: string) => {
      setAnnotations(annotations.filter((a) => a.id !== id));
    },
    [annotations, setAnnotations]
  );

  const clearAnnotations = useCallback(() => {
    setAnnotations([]);
  }, [setAnnotations]);

  return { annotations, addAnnotation, removeAnnotation, clearAnnotations };
}
