export function MetricCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl glass border border-ev-sand/30">
      <h3 className="text-[11px] font-medium text-ev-warm-gray mb-3 uppercase tracking-wider leading-none">{label}</h3>
      <div className="min-h-0">{children}</div>
    </div>
  );
}
