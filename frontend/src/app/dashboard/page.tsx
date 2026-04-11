export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-ev-sand bg-ev-ivory px-6 py-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent-savanna">
          EchoField Dashboard
        </p>
        <h1 className="mt-3 text-3xl font-bold text-ev-charcoal sm:text-4xl">
          Research command center
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-ev-elephant sm:text-base">
          This is the dashboard entry point reached from the cinematic landing
          scene. It reuses the existing app shell and gives us a clean place to
          grow the main EchoField workspace next.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-ev-sand bg-ev-cream p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-ev-warm-gray">
            Active Pipelines
          </p>
          <p className="mt-3 text-4xl font-bold text-accent-savanna">12</p>
          <p className="mt-2 text-sm text-ev-elephant">
            Current denoising and analysis jobs staged for review.
          </p>
        </div>

        <div className="rounded-2xl border border-ev-sand bg-ev-cream p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-ev-warm-gray">
            Recent Recordings
          </p>
          <p className="mt-3 text-4xl font-bold text-accent-gold">44</p>
          <p className="mt-2 text-sm text-ev-elephant">
            Field captures available for inspection, processing, and export.
          </p>
        </div>

        <div className="rounded-2xl border border-ev-sand bg-ev-cream p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-ev-warm-gray">
            Detected Calls
          </p>
          <p className="mt-3 text-4xl font-bold text-success">212</p>
          <p className="mt-2 text-sm text-ev-elephant">
            Highlighted vocal events ready for spectrogram and playback review.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-ev-sand bg-ev-cream p-6">
        <p className="text-xs uppercase tracking-[0.22em] text-ev-warm-gray">
          Next Step
        </p>
        <p className="mt-3 text-base leading-7 text-ev-elephant">
          Use the existing navigation to move into upload, processing, database,
          and export flows. This dashboard is intentionally lightweight for now
          and serves as the destination for the landing-page globe transition.
        </p>
      </section>
    </div>
  );
}
