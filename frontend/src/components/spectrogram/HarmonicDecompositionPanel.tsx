"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  getCallHarmonics,
  type HarmonicDecompositionData,
} from "@/lib/audio-api";

export default function HarmonicDecompositionPanel({ callId }: { callId: string }) {
  const [data, setData] = useState<HarmonicDecompositionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCallHarmonics(callId)
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
  }, [callId]);

  if (loading) {
    return (
      <div className="rounded-lg border border-ev-sand/40 bg-white/70 p-5">
        <div className="flex items-center gap-2 text-sm text-ev-warm-gray">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading harmonic bands...
        </div>
      </div>
    );
  }

  if (!data || data.harmonics.length === 0) {
    return (
      <div className="rounded-lg border border-ev-sand/40 bg-white/70 p-5">
        <h2 className="text-sm font-semibold text-ev-charcoal">
          Harmonic Decomposition
        </h2>
        <p className="mt-1 text-sm text-ev-warm-gray">
          No stable harmonic series was detected for this call.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-ev-sand/40 bg-white/70 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ev-charcoal">
            Harmonic Decomposition
          </h2>
          <p className="text-xs text-ev-warm-gray">
            Fundamental {data.fundamental_hz.toFixed(1)} Hz, {data.total_harmonics_detected} bands
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {data.harmonics.map((band) => {
          const snrGain = band.snr_after_db - band.snr_before_db;
          return (
            <div
              key={band.order}
              className="grid gap-3 rounded-lg border border-ev-sand/30 bg-ev-cream/50 p-3 sm:grid-cols-[150px_1fr_120px]"
            >
              <div>
                <p className="text-xs font-semibold text-ev-charcoal">
                  {band.order === 1 ? "Fundamental" : `Harmonic ${band.order}`}
                </p>
                <p className="text-[11px] font-mono text-ev-warm-gray">
                  {band.frequency_hz.toFixed(1)} Hz
                </p>
              </div>
              {band.spectrogram_slice_b64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/png;base64,${band.spectrogram_slice_b64}`}
                  alt={`Harmonic ${band.order} spectrogram slice`}
                  className="h-14 w-full rounded-md border border-ev-sand/30 object-cover"
                />
              ) : (
                <div className="h-14 rounded-md border border-ev-sand/30 bg-white/60" />
              )}
              <div className="text-right text-[11px] text-ev-warm-gray">
                <p>
                  SNR {band.snr_before_db.toFixed(1)} to {band.snr_after_db.toFixed(1)} dB
                </p>
                <p className={snrGain >= 0 ? "font-semibold text-success" : "font-semibold text-danger"}>
                  {snrGain >= 0 ? "+" : ""}
                  {snrGain.toFixed(1)} dB
                </p>
                <p>{band.energy_preserved_pct.toFixed(0)}% energy kept</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
