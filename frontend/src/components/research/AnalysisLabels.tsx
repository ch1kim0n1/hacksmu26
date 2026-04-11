import type { Recording } from "@/lib/audio-api";

interface Props {
  recording: Recording;
}

/**
 * Full analysis labels panel for the detail sidebar.
 * Renders call_id, animal_id, and noise_type_ref when present.
 */
export function AnalysisLabels({ recording }: Props) {
  const { call_id, animal_id, noise_type_ref } = recording;

  const hasLabels =
    (call_id && call_id.length > 0) ||
    (animal_id && animal_id.length > 0) ||
    (noise_type_ref && noise_type_ref.length > 0);

  if (!hasLabels) return null;

  return (
    <dl className="space-y-3 text-sm">
      {animal_id && animal_id.length > 0 && (
        <div className="flex justify-between">
          <dt className="text-ev-warm-gray">Animal</dt>
          <dd className="text-ev-charcoal font-medium">{animal_id}</dd>
        </div>
      )}
      {noise_type_ref && noise_type_ref.length > 0 && (
        <div className="flex justify-between">
          <dt className="text-ev-warm-gray">Noise Ref</dt>
          <dd className="text-ev-charcoal font-medium">{noise_type_ref}</dd>
        </div>
      )}
      {call_id && call_id.length > 0 && (
        <div className="flex justify-between">
          <dt className="text-ev-warm-gray">Call ID</dt>
          <dd className="text-ev-charcoal font-mono text-xs">{call_id}</dd>
        </div>
      )}
    </dl>
  );
}

/**
 * Analysis time window display for the detail sidebar.
 * Shows start_sec, end_sec, and computed duration.
 */
export function AnalysisWindow({ recording }: Props) {
  const { start_sec, end_sec } = recording;

  if (start_sec == null || end_sec == null) return null;

  const duration = end_sec - start_sec;

  return (
    <div className="space-y-3 text-sm">
      <p className="text-ev-warm-gray text-xs font-medium uppercase tracking-wider">
        Analysis Window
      </p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-ev-warm-gray text-xs">Start</p>
          <p className="text-ev-charcoal font-medium">{start_sec.toFixed(1)}s</p>
        </div>
        <div>
          <p className="text-ev-warm-gray text-xs">End</p>
          <p className="text-ev-charcoal font-medium">{end_sec.toFixed(1)}s</p>
        </div>
        <div>
          <p className="text-ev-warm-gray text-xs">Duration</p>
          <p className="text-ev-charcoal font-medium">{duration.toFixed(1)}s</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact inline badges for the recordings list.
 * Shows animal_id and noise_type_ref as small badges.
 */
export function AnalysisLabelsBadge({ recording }: Props) {
  const { animal_id, noise_type_ref } = recording;

  const hasLabels =
    (animal_id && animal_id.length > 0) ||
    (noise_type_ref && noise_type_ref.length > 0);

  if (!hasLabels) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {animal_id && animal_id.length > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-accent-savanna/10 text-accent-savanna border border-accent-savanna/20">
          {animal_id}
        </span>
      )}
      {noise_type_ref && noise_type_ref.length > 0 && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-accent-gold/10 text-accent-gold border border-accent-gold/20">
          {noise_type_ref}
        </span>
      )}
    </div>
  );
}
