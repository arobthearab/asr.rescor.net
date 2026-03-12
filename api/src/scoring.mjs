// ════════════════════════════════════════════════════════════════════
// RSK/STORM Scoring Engine (Server-Side — Authoritative)
// ════════════════════════════════════════════════════════════════════
// All scoring parameters are loaded from the Neo4j ScoringConfig node.
// No hardcoded constants — everything is admin-tunable.
//
// Tuning hierarchy:
//   1. ScoringConfig.dampingFactor / rawMax / ratingThresholds
//   2. ClassificationChoice.factor (per-review global multiplier)
//   3. WeightTier.value (per-tier across all questions)
//   4. Question.choiceScores (per-question override)
// ════════════════════════════════════════════════════════════════════

let cachedScoringConfiguration = null;

// ────────────────────────────────────────────────────────────────────
// loadScoringConfiguration — fetch from Neo4j, cache in memory
// ────────────────────────────────────────────────────────────────────

export async function loadScoringConfiguration(database) {
  let answer = cachedScoringConfiguration;

  if (answer == null) {
    const result = await database.query(
      `MATCH (config:ScoringConfig {configId: 'default'}) RETURN config`
    );

    if (result.length > 0) {
      const config = result[0].config || result[0];
      answer = {
        dampingFactor: config.dampingFactor ?? 4,
        rawMax: config.rawMax ?? 134,
        ratingThresholds: config.ratingThresholds ?? [25, 50, 75],
        ratingLabels: config.ratingLabels ?? ['Low', 'Moderate', 'Elevated', 'Critical'],
        questionnaireVersion: config.questionnaireVersion ?? null,
        questionnaireLabel: config.questionnaireLabel ?? null,
      };
    } else {
      answer = {
        dampingFactor: 4,
        rawMax: 134,
        ratingThresholds: [25, 50, 75],
        ratingLabels: ['Low', 'Moderate', 'Elevated', 'Critical'],
        questionnaireVersion: null,
        questionnaireLabel: null,
      };
    }

    cachedScoringConfiguration = answer;
  }

  return answer;
}

// ────────────────────────────────────────────────────────────────────
// clearScoringConfigurationCache — call after admin updates config
// ────────────────────────────────────────────────────────────────────

export function clearScoringConfigurationCache() {
  cachedScoringConfiguration = null;
}

// ────────────────────────────────────────────────────────────────────
// rskAggregate — diminishing impact composite measurement
// ────────────────────────────────────────────────────────────────────

export function rskAggregate(measurements, dampingFactor) {
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
// rskNormalize — scale raw aggregate to 0–100
// ────────────────────────────────────────────────────────────────────

export function rskNormalize(raw, rawMax) {
  let answer = 0;

  if (raw > 0) {
    answer = Math.min(100, (raw / rawMax) * 100);
    answer = Math.round(answer * 10) / 10;
  }

  return answer;
}

// ────────────────────────────────────────────────────────────────────
// questionMeasurement — 3-factor measurement for one question
// ────────────────────────────────────────────────────────────────────

export function questionMeasurement(rawScore, weightValue, classificationFactor) {
  let answer = 0;

  if (rawScore > 0 && weightValue > 0 && classificationFactor > 0) {
    answer = Math.floor((rawScore / 100) * (weightValue / 100) * classificationFactor);
  }

  return answer;
}

// ────────────────────────────────────────────────────────────────────
// ratingFromNormalized — map normalized score to rating label
// ────────────────────────────────────────────────────────────────────

export function ratingFromNormalized(normalized, thresholds, labels) {
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
// computeScore — aggregate measurements into a scored result
// ────────────────────────────────────────────────────────────────────

export function computeScore(measurements, scoringConfiguration) {
  const raw = rskAggregate(measurements, scoringConfiguration.dampingFactor);
  const normalized = rskNormalize(raw, scoringConfiguration.rawMax);
  const rating = ratingFromNormalized(
    normalized,
    scoringConfiguration.ratingThresholds,
    scoringConfiguration.ratingLabels
  );

  return { raw, normalized, rating };
}
