/**
 * computeSampleSize - Calculate statistical sample size for population sampling
 *
 * Uses Cochran's formula for sample size calculation:
 * n0 = (z² × p × (1-p)) / e²
 * n = n0 / (1 + (n0 - 1) / N)
 *
 * Default configuration:
 * - z = 1.96 (95% confidence level)
 * - p = 0.5 (maximum variability)
 * - e = 0.05 (5% margin of error)
 * - minSample = 30 (minimum sample size)
 *
 * @param {number} total - Total population size
 * @param {Object} config - Optional configuration
 * @param {number} config.z - Z-score for confidence level (default: 1.96 for 95%)
 * @param {number} config.p - Proportion (default: 0.5 for max variability)
 * @param {number} config.e - Margin of error (default: 0.05 for 5%)
 * @param {number} config.minSample - Minimum sample size (default: 30)
 * @returns {number} Recommended sample size (capped at total)
 *
 * @example
 * // 95% confidence, 5% margin of error
 * const sampleSize = computeSampleSize(10000);  // Returns: 370
 *
 * // 99% confidence, 3% margin of error
 * const sampleSize = computeSampleSize(10000, { z: 2.576, e: 0.03 });  // Returns: 1037
 */
export function computeSampleSize(total, config = {}) {
  if (!total || total <= 0) return 0;

  const DEFAULT_CONFIG = {
    z: 1.96,       // 95% confidence
    p: 0.5,        // Maximum variability
    e: 0.05,       // 5% margin of error
    minSample: 30  // Minimum sample
  };

  const z = config.z ?? DEFAULT_CONFIG.z;
  const p = config.p ?? DEFAULT_CONFIG.p;
  const e = config.e ?? DEFAULT_CONFIG.e;
  const minSample = config.minSample ?? DEFAULT_CONFIG.minSample;

  // Cochran's formula
  const n0 = (z * z * p * (1 - p)) / (e * e);
  const n = n0 / (1 + (n0 - 1) / total);
  const rounded = Math.ceil(n);
  const minAdjusted = Math.max(minSample, rounded);

  return Math.min(total, minAdjusted);
}
