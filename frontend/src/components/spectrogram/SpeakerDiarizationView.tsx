"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, Users } from "lucide-react";
import {
  getRecordingSpeakers,
  getSpeakerAudioUrl,
  type SpeakerData,
  type SpeakerSeparationResult,
} from "@/lib/audio-api";

export default function SpeakerDiarizationView({
  recordingId,
  initial,
}: {
  recordingId: string;
  initial?: SpeakerSeparationResult;
}) {
  const [data, setData] = useState<SpeakerSeparationResult | null>(initial ?? null);
  const [loading, setLoading] = useState(!initial);

  useEffect(() => {
    if (initial?.speakers?.length) {
      setData(initial);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getRecordingSpeakers(recordingId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initial, recordingId]);

  const speakers: SpeakerData[] = data?.speakers ?? [];

  return (
    <div className="rounded-lg border border-ev-sand/40 bg-white/70 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-savanna/10">
            <Users className="h-4 w-4 text-accent-savanna" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ev-charcoal">
              Speaker Separation
            </h2>
            <p className="text-xs text-ev-warm-gray">
              {loading
                ? "Separating harmonic voice tracks..."
                : `${data?.speaker_count ?? speakers.length} track${(data?.speaker_count ?? speakers.length) === 1 ? "" : "s"} detected`}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ev-warm-gray">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading separated speakers...
        </div>
      ) : speakers.length === 0 ? (
        <p className="text-sm text-ev-warm-gray">
          No separated speaker tracks are available for this recording.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {speakers.map((speaker) => (
            <div
              key={speaker.id}
              className="rounded-lg border border-ev-sand/30 bg-ev-cream/50 p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ev-charcoal">
                    {speaker.id.replace("_", " ")}
                  </p>
                  <p className="text-[11px] text-ev-warm-gray">
                    {speaker.duration_s.toFixed(1)}s isolated audio
                  </p>
                </div>
                <a
                  href={getSpeakerAudioUrl(recordingId, speaker.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-ev-sand/40 bg-white px-2 py-1 text-[11px] font-medium text-ev-elephant hover:text-ev-charcoal"
                >
                  <Download className="h-3 w-3" />
                  WAV
                </a>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <dt className="text-ev-warm-gray">f0</dt>
                  <dd className="font-mono text-ev-charcoal">
                    {speaker.fundamental_hz.toFixed(1)} Hz
                  </dd>
                </div>
                <div>
                  <dt className="text-ev-warm-gray">Harmonics</dt>
                  <dd className="font-mono text-ev-charcoal">
                    {speaker.harmonic_count}
                  </dd>
                </div>
                <div>
                  <dt className="text-ev-warm-gray">Energy</dt>
                  <dd className="font-mono text-ev-charcoal">
                    {Math.round(speaker.energy_ratio * 100)}%
                  </dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
