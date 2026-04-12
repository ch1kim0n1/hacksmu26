import RealtimeMicTest from "@/components/audio/RealtimeMicTest";

export const metadata = { title: "Real-Time Filter · EchoField" };

export default function RealtimePage() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 p-6 lg:p-8">
      <div className="max-w-4xl">
        <h1 className="text-3xl font-bold text-ev-charcoal lg:text-4xl">
          Real-Time Filter
        </h1>
        <p className="mt-2 max-w-3xl text-base text-ev-warm-gray">
          Capture mic audio and apply noise filters live while recording.
          Download the raw and filtered streams side-by-side for instant A/B
          comparison.
        </p>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.7fr)]">
        <div className="min-w-0 rounded-2xl shadow-[0_18px_38px_rgba(110,95,70,0.14),0_42px_84px_rgba(188,164,108,0.12)]">
          <RealtimeMicTest />
        </div>

        <aside className="grid gap-4">
          <section className="rounded-2xl border border-ev-sand/30 bg-white/45 p-5 shadow-[0_18px_38px_rgba(110,95,70,0.14),0_42px_84px_rgba(188,164,108,0.12)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-savanna">
              Live Workflow
            </p>
            <div className="mt-4 space-y-3 text-sm text-ev-elephant">
              <p>
                Start the mic and EchoField will process incoming audio through
                the same denoise pipeline used for uploaded recordings.
              </p>
              <p>
                Use monitor mode with headphones for low-latency preview, then
                compare the raw and filtered downloads after the session ends.
              </p>
              <p>
                When a take sounds good, send it straight into the full pipeline
                so it appears alongside the rest of your recordings.
              </p>
            </div>
          </section>

        </aside>

        <section className="xl:col-span-2 rounded-2xl border border-ev-sand/30 bg-gradient-to-br from-ev-cream to-white/70 p-5 shadow-[0_18px_38px_rgba(110,95,70,0.14),0_42px_84px_rgba(188,164,108,0.12)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-savanna">
            Best Results
          </p>
          <div className="mt-4 grid gap-4 text-sm text-ev-elephant lg:grid-cols-3">
            <p>
              Keep the microphone close to the source and avoid open speaker
              playback unless phone mode is enabled.
            </p>
            <p>
              Watch the raw and filtered level meters while recording to catch
              clipping, silence, or weak signal before the take finishes.
            </p>
            <p>
              Record a few seconds of room tone first so the filter has a
              cleaner noise reference to work from.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
