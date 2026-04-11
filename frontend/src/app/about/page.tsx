import Link from "next/link";

const TEAM_MEMBERS = [
  { name: "Dmitry Moiseenko", role: "Full-Stack & Design" },
  { name: "Team Member", role: "ML Pipeline" },
  { name: "Team Member", role: "Frontend Lead" },
  { name: "Team Member", role: "Backend Lead" },
];

const STEPS = [
  {
    number: "01",
    title: "Upload",
    description:
      "Drop field recordings into EchoField. We accept WAV, MP3, and FLAC at any sample rate.",
    icon: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12",
  },
  {
    number: "02",
    title: "AI Denoise",
    description:
      "Spectral gating and hybrid denoising isolate elephant vocalizations from environmental noise in seconds.",
    icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
  },
  {
    number: "03",
    title: "Analyze",
    description:
      "View spectrograms, listen to cleaned audio, review acoustic metrics, and export research data.",
    icon: "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z",
  },
];

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-16 pb-16">
      {/* Hero */}
      <section className="text-center pt-8">
        <h1 className="text-4xl font-bold text-echofield-text-primary mb-4">
          About EchoField
        </h1>
        <p className="text-lg text-echofield-text-secondary max-w-2xl mx-auto">
          An interactive platform that removes overlapping noise from elephant
          field recordings, revealing hidden vocalizations for conservation
          research.
        </p>
      </section>

      {/* Why It Matters */}
      <section>
        <h2 className="text-2xl font-bold text-echofield-text-primary mb-4">
          Why This Matters
        </h2>
        <div className="space-y-4 text-echofield-text-secondary leading-relaxed">
          <p>
            Elephant communication research is blocked by noise. Field
            recordings from Africa contain overlapping sounds from aircraft,
            vehicles, generators, wind, and rain that mask the very
            vocalizations researchers need to study.
          </p>
          <p>
            Elephants communicate at frequencies as low as 8 Hz — well below
            human hearing — with harmonic structures extending up to 1000 Hz.
            These rumbles carry information about identity, emotional state,
            reproductive status, and social coordination across distances of
            several kilometers.
          </p>
          <p>
            Without clean recordings, researchers cannot reliably measure
            fundamental frequencies, harmonic richness, formant structures, or
            temporal patterns. EchoField changes that by making the hidden
            voice visible and analyzable.
          </p>
        </div>
      </section>

      {/* Methodology */}
      <section>
        <h2 className="text-2xl font-bold text-echofield-text-primary mb-8">
          How It Works
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className="rounded-xl border border-echofield-border bg-echofield-surface p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-teal/10">
                  <svg
                    className="h-5 w-5 text-accent-teal"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d={step.icon}
                    />
                  </svg>
                </div>
                <span className="text-sm font-bold text-echofield-text-muted">
                  Step {step.number}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-echofield-text-primary mb-2">
                {step.title}
              </h3>
              <p className="text-sm text-echofield-text-secondary leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Team */}
      <section>
        <h2 className="text-2xl font-bold text-echofield-text-primary mb-6">
          The Team
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {TEAM_MEMBERS.map((member, i) => (
            <div
              key={i}
              className="rounded-xl border border-echofield-border bg-echofield-surface p-4 text-center"
            >
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-echofield-surface-elevated">
                <svg
                  className="h-6 w-6 text-echofield-text-muted"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
              <p className="text-sm font-semibold text-echofield-text-primary">
                {member.name}
              </p>
              <p className="text-xs text-echofield-text-muted">{member.role}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ElephantVoices Credit */}
      <section className="rounded-xl border border-gold/20 bg-gold/5 p-8">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gold/10">
            <svg
              className="h-8 w-8 text-gold"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gold mb-1">
              In Partnership with ElephantVoices
            </h3>
            <p className="text-sm text-echofield-text-secondary leading-relaxed">
              EchoField was built for the ElephantVoices track at HackSMU 2026.
              ElephantVoices is a nonprofit dedicated to elephant cognition,
              communication, and conservation. Their decades of field research
              and acoustic data make this work possible.
            </p>
          </div>
        </div>
      </section>

      {/* HackSMU */}
      <section className="text-center">
        <p className="text-sm text-echofield-text-muted mb-4">
          Built in 36 hours at HackSMU 2026 — April 2026, Dallas, TX
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-accent-teal px-6 py-2.5 text-sm font-medium text-echofield-bg transition-colors hover:bg-accent-teal/90"
        >
          Back to EchoField
        </Link>
      </section>
    </div>
  );
}
