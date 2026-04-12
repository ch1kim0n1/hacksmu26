"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  API_BASE,
  compareCrossSpecies,
  getCalls,
  getReferenceCalls,
  type Call,
  type CrossSpeciesComparison,
} from "@/lib/audio-api";

export default function ComparePage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [references, setReferences] = useState<Array<Record<string, unknown>>>([]);
  const [callId, setCallId] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [comparison, setComparison] = useState<CrossSpeciesComparison | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCalls({ limit: 100 }).then((data) => {
      setCalls(data.calls);
      setCallId(data.calls[0]?.id || "");
    }).catch(() => undefined);
    getReferenceCalls().then((data) => {
      setReferences(data);
      setReferenceId(String(data[0]?.id || ""));
    }).catch(() => undefined);
  }, []);

  const runComparison = async () => {
    if (!callId || !referenceId) return;
    setError(null);
    try {
      setComparison(await compareCrossSpecies({ elephant_call_id: callId, reference_id: referenceId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed");
    }
  };

  return (
    <main className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
        <Link href="/database" className="mb-4 inline-flex text-sm text-ev-warm-gray hover:text-ev-elephant">
          Back to database
        </Link>
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-ev-charcoal">Cross-Species Comparison</h1>
          <p className="mt-2 text-ev-elephant">
            Compare elephant calls against reference bioacoustic signals.
          </p>
        </div>

        <section className="mb-8 grid gap-4 rounded-lg border border-ev-sand bg-ev-cream p-5 md:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-ev-charcoal">Elephant call</span>
            <select value={callId} onChange={(event) => setCallId(event.target.value)} className="w-full rounded-lg border border-ev-sand bg-background-elevated px-3 py-2 text-sm">
              {calls.map((call) => (
                <option key={call.id} value={call.id}>
                  {call.call_type} · {call.id}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-ev-charcoal">Reference</span>
            <select value={referenceId} onChange={(event) => setReferenceId(event.target.value)} className="w-full rounded-lg border border-ev-sand bg-background-elevated px-3 py-2 text-sm">
              {references.map((reference) => (
                <option key={String(reference.id)} value={String(reference.id)}>
                  {String(reference.species)}
                </option>
              ))}
            </select>
          </label>
          <button onClick={runComparison} className="self-end rounded-lg bg-accent-savanna px-5 py-2 text-sm font-semibold text-ev-ivory hover:bg-accent-savanna/90">
            Compare
          </button>
        </section>

        {error && <div className="mb-6 rounded-lg border border-danger/20 bg-danger/10 p-4 text-sm text-danger">{error}</div>}

        {comparison && (
          <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
            <section className="rounded-lg border border-ev-sand bg-ev-cream p-5">
              <h2 className="mb-4 text-xl font-semibold text-ev-charcoal">
                Elephant vs. {String(comparison.reference.species)}
              </h2>
              <Image
                src={`${API_BASE}${comparison.visualizations?.overlay_url ?? ""}`}
                alt="Cross-species frequency overlay"
                width={1600}
                height={900}
                unoptimized
                className="h-auto w-full rounded-lg border border-ev-sand"
              />
              <p className="mt-4 rounded-lg bg-background-elevated p-4 text-sm leading-relaxed text-ev-elephant">
                {String(comparison.comparison.insight)}
              </p>
            </section>
            <aside className="rounded-lg border border-ev-sand bg-ev-cream p-5">
              <h2 className="mb-4 text-lg font-semibold text-ev-charcoal">Metrics</h2>
              {[
                ["Frequency overlap", comparison.comparison.frequency_overlap_pct],
                ["Spectral similarity", comparison.comparison.spectral_similarity],
                ["Harmonic similarity", comparison.comparison.harmonic_similarity],
                ["Temporal similarity", comparison.comparison.temporal_similarity],
              ].map(([label, value]) => (
                <div key={String(label)} className="mb-3 flex justify-between border-b border-ev-sand pb-2 text-sm">
                  <span className="text-ev-warm-gray">{String(label)}</span>
                  <span className="font-medium text-ev-charcoal">{String(value)}</span>
                </div>
              ))}
            </aside>
          </div>
        )}
    </main>
  );
}
