// ════════════════════════════════════════════════════════════════════
// Unit Tests — RSK Scoring Engine (pure math, no Neo4j)
// ════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { rskAggregate, rskNormalize, questionMeasurement, ratingFromNormalized, computeScore } from '../src/scoring.mjs';

// ── rskAggregate ─────────────────────────────────────────────────

describe('rskAggregate', () => {
  it('returns 0 for empty measurements', () => {
    expect(rskAggregate([], 4)).toBe(0);
  });

  it('returns the single measurement for one item', () => {
    expect(rskAggregate([10], 4)).toBe(10);
  });

  it('applies diminishing damping to sorted measurements', () => {
    // [20, 10] sorted desc → 20/4^0 + 10/4^1 = 20 + 2.5 = 22.5 → ceil = 23
    expect(rskAggregate([10, 20], 4)).toBe(23);
  });

  it('filters out non-positive and non-numeric values', () => {
    expect(rskAggregate([0, -5, null, undefined, 'bad', 10], 4)).toBe(10);
  });

  it('sorts highest first for maximum impact', () => {
    // [30, 20, 10] → 30/1 + 20/4 + 10/16 = 30 + 5 + 0.625 = 35.625 → ceil = 36
    expect(rskAggregate([10, 30, 20], 4)).toBe(36);
  });

  it('handles damping factor of 1 (no damping)', () => {
    // Each gets full weight: 10 + 20 + 5 = 35
    expect(rskAggregate([10, 20, 5], 1)).toBe(35);
  });
});

// ── rskNormalize ─────────────────────────────────────────────────

describe('rskNormalize', () => {
  it('returns 0 for raw score of 0', () => {
    expect(rskNormalize(0, 134)).toBe(0);
  });

  it('scales raw to percentage of rawMax', () => {
    // 67/134 * 100 = 50.0
    expect(rskNormalize(67, 134)).toBe(50);
  });

  it('caps at 100 when raw exceeds rawMax', () => {
    expect(rskNormalize(200, 134)).toBe(100);
  });

  it('rounds to one decimal place', () => {
    // 50/134 * 100 = 37.3134... → 37.3
    expect(rskNormalize(50, 134)).toBe(37.3);
  });
});

// ── questionMeasurement ──────────────────────────────────────────

describe('questionMeasurement', () => {
  it('returns 0 when rawScore is 0', () => {
    expect(questionMeasurement(0, 50, 1.0)).toBe(0);
  });

  it('returns 0 when weightValue is 0', () => {
    expect(questionMeasurement(75, 0, 1.0)).toBe(0);
  });

  it('returns 0 when classificationFactor is 0', () => {
    expect(questionMeasurement(75, 50, 0)).toBe(0);
  });

  it('computes floor of (rawScore/100) * (weightValue/100) * factor', () => {
    // (100/100) * (100/100) * 1.0 = 1.0 → floor = 1
    expect(questionMeasurement(100, 100, 1.0)).toBe(1);
    // (75/100) * (50/100) * 2.0 = 0.75 → floor = 0
    expect(questionMeasurement(75, 50, 2.0)).toBe(0);
    // (100/100) * (100/100) * 100 = 100 → floor = 100
    expect(questionMeasurement(100, 100, 100)).toBe(100);
  });
});

// ── ratingFromNormalized ─────────────────────────────────────────

describe('ratingFromNormalized', () => {
  const thresholds = [25, 50, 75];
  const labels = ['Low', 'Moderate', 'Elevated', 'Critical'];

  it('returns Low for 0', () => {
    expect(ratingFromNormalized(0, thresholds, labels)).toBe('Low');
  });

  it('returns Low for exactly 25 (not exceeding threshold)', () => {
    expect(ratingFromNormalized(25, thresholds, labels)).toBe('Low');
  });

  it('returns Moderate for 26 (exceeds first threshold)', () => {
    expect(ratingFromNormalized(26, thresholds, labels)).toBe('Moderate');
  });

  it('returns Elevated for 51', () => {
    expect(ratingFromNormalized(51, thresholds, labels)).toBe('Elevated');
  });

  it('returns Critical for 76', () => {
    expect(ratingFromNormalized(76, thresholds, labels)).toBe('Critical');
  });

  it('returns Critical for 100', () => {
    expect(ratingFromNormalized(100, thresholds, labels)).toBe('Critical');
  });
});

// ── computeScore ─────────────────────────────────────────────────

describe('computeScore', () => {
  const scoringConfiguration = {
    dampingFactor: 4,
    rawMax: 134,
    ratingThresholds: [25, 50, 75],
    ratingLabels: ['Low', 'Moderate', 'Elevated', 'Critical'],
  };

  it('returns zero score for empty measurements', () => {
    const result = computeScore([], scoringConfiguration);
    expect(result.raw).toBe(0);
    expect(result.normalized).toBe(0);
    expect(result.rating).toBe('Low');
  });

  it('returns a complete scored result for valid measurements', () => {
    const result = computeScore([20, 15, 10], scoringConfiguration);
    expect(result.raw).toBeGreaterThan(0);
    expect(result.normalized).toBeGreaterThan(0);
    expect(typeof result.rating).toBe('string');
  });
});
