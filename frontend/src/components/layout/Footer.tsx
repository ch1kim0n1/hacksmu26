export default function Footer({ isDark }: { isDark?: boolean }) {
  return (
    <footer
      className={`border-t px-6 py-3 ${
        isDark
          ? "border-white/[0.06] bg-dark-bg"
          : "border-ev-sand/40 bg-ev-ivory"
      }`}
    >
      <p
        className={`text-center text-xs ${
          isDark ? "text-dark-text-muted" : "text-ev-warm-gray"
        }`}
      >
        Built for HackSMU 2026 &mdash; ElephantVoices Track
      </p>
    </footer>
  );
}
