// ════════════════════════════════════════════════════════════════════
// RSK/STORM Scoring Engine (Client-Side — Advisory)
// ════════════════════════════════════════════════════════════════════
// Mirrors api/src/scoring.mjs for instant UI feedback.
// Server recalculates authoritatively on save/submit.
// All parameters come from ScoringConfig loaded via /api/config.

export interface ScoringConfiguration {
  dampingFactor: number;
  rawMax: number;
  ratingThresholds: number[];
  ratingLabels: string[];
}

export interface ScoreResult {
  raw: number;
  normalized: number;
  rating: string;
}

const DEFAULT_CONFIGURATION: ScoringConfiguration = {
  dampingFactor: 4,
  rawMax: 134,
  ratingThresholds: [25, 50, 75],
  ratingLabels: ['Low', 'Moderate', 'Elevated', 'Critical'],
};

// ────────────────────────────────────────────────────────────────────
// rskAggregate
// ────────────────────────────────────────────────────────────────────

export function rskAggregate(
  measurements: number[],
  dampingFactor: number = DEFAULT_CONFIGURATION.dampingFactor,
): number {
  const valid = measurements
    .filter((value) => typeof value === 'number' && value > 0)
    .sort((first, second) => second - first);

  let answer = 0;

  if (valid.length > 0) {
    let total = 0;
    for (let index = 0; index < valid.length; index++) {
      total += valid[index] / Math.pow(dampingFactor, index);
    }
    answer = Math.ceil(total);
  }

  return answer;
}

// ────────────────────────────────────────────────────────────────────
// mitigationAggregate — RSK diminishing impact for multiple mitigations
// Same damping formula: ceil(Σ sorted_desc[i] / dampingFactor^i), capped at 100
// ────────────────────────────────────────────────────────────────────

export function mitigationAggregate(
  mitigations: number[],
  dampingFactor: number = DEFAULT_CONFIGURATION.dampingFactor,
): number {
  const valid = mitigations
    .filter((value) => typeof value === 'number' && value > 0)
    .sort((first, second) => second - first);

  let answer = 0;

  if (valid.length > 0) {
    let total = 0;
    for (let index = 0; index < valid.length; index++) {
      total += valid[index] / Math.pow(dampingFactor, index);
    }
    answer = Math.min(100, Math.ceil(total));
  }

  return answer;
}

// ────────────────────────────────────────────────────────────────────
// rskNormalize
// ────────────────────────────────────────────────────────────────────

export function rskNormalize(
  raw: number,
  rawMax: number = DEFAULT_CONFIGURATION.rawMax,
): number {
  let answer = 0;

  if (raw > 0) {
    answer = Math.min(100, (raw / rawMax) * 100);
    answer = Math.round(answer * 10) / 10;
  }

  return answer;
}

// ────────────────────────────────────────────────────────────────────
// questionMeasurement
// ────────────────────────────────────────────────────────────────────

export function questionMeasurement(
  rawScore: number,
  weightValue: number,
  classificationFactor: number,
): number {
  let answer = 0;

  if (rawScore > 0 && weightValue > 0 && classificationFactor > 0) {
    answer = Math.floor((rawScore / 100) * (weightValue / 100) * classificationFactor);
  }

  return answer;
}

// ────────────────────────────────────────────────────────────────────
// ratingFromNormalized
// ────────────────────────────────────────────────────────────────────

export function ratingFromNormalized(
  normalized: number,
  thresholds: number[] = DEFAULT_CONFIGURATION.ratingThresholds,
  labels: string[] = DEFAULT_CONFIGURATION.ratingLabels,
): string {
  let answer = labels[0] || 'Low';

  for (let index = thresholds.length - 1; index >= 0; index--) {
    if (normalized > thresholds[index]) {
      answer = labels[index + 1] || labels[labels.length - 1];
      break;
    }
  }

  return answer;
}

// ────────────────────────────────────────────────────────────────────
// computeScore
// ────────────────────────────────────────────────────────────────────

export function computeScore(
  measurements: number[],
  configuration: ScoringConfiguration = DEFAULT_CONFIGURATION,
): ScoreResult {
  const raw = rskAggregate(measurements, configuration.dampingFactor);
  const normalized = rskNormalize(raw, configuration.rawMax);
  const rating = ratingFromNormalized(
    normalized,
    configuration.ratingThresholds,
    configuration.ratingLabels,
  );

  return { raw, normalized, rating };
}
