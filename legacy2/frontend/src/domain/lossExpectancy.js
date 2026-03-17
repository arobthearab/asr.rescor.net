import { ValidationError } from '@rescor-llc/core-utils/errors';
import { computeControlEfficacy } from './stormRsk.js';

function toFiniteNumber(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${fieldName} must be a finite number`, 'ASR_INVALID_NUMBER', fieldName);
  }

  return parsed;
}

function validateNormalizedRange(value, fieldName) {
  if (value < 0 || value > 1) {
    throw new ValidationError(`${fieldName} must be between 0 and 1`, 'ASR_OUT_OF_RANGE', fieldName);
  }
}

export function normalizeRiskInputs({ assetValue, threatProbability, vulnerabilitySeverity, controlEfficacy }) {
  const A = toFiniteNumber(assetValue, 'assetValue');
  const T = toFiniteNumber(threatProbability, 'threatProbability');
  const V = toFiniteNumber(vulnerabilitySeverity, 'vulnerabilitySeverity');
  const C = toFiniteNumber(controlEfficacy, 'controlEfficacy');

  validateNormalizedRange(T, 'threatProbability');
  validateNormalizedRange(V, 'vulnerabilitySeverity');
  validateNormalizedRange(C, 'controlEfficacy');

  if (A < 0) {
    throw new ValidationError('assetValue must be >= 0', 'ASR_OUT_OF_RANGE', 'assetValue');
  }

  return { A, T, V, C };
}

export function normalizeRiskInputsWithControls({
  assetValue,
  threatProbability,
  vulnerabilitySeverity,
  controlEfficacy,
  controlEffectives
}) {
  let resolvedControlEfficacy = controlEfficacy;

  if (Array.isArray(controlEffectives) && controlEffectives.length > 0) {
    resolvedControlEfficacy = computeControlEfficacy(controlEffectives);
  }

  return normalizeRiskInputs({
    assetValue,
    threatProbability,
    vulnerabilitySeverity,
    controlEfficacy: resolvedControlEfficacy
  });
}

/**
 * Single Loss Expectancy (SLE)
 * SLE = A * 1 * V * (1 - C)
 */
export function computeSLE(inputs) {
  const { A, V, C } = normalizeRiskInputs(inputs);
  return A * 1 * V * (1 - C);
}

/**
 * Distributed Loss Expectancy (DLE)
 * DLE = A * T * V * (1 - C)
 */
export function computeDLE(inputs) {
  const { A, T, V, C } = normalizeRiskInputs(inputs);
  return A * T * V * (1 - C);
}

export function computeLossExpectancies(inputs) {
  const normalized = normalizeRiskInputsWithControls(inputs);
  const { A, T, V, C } = normalized;

  return {
    ...normalized,
    SLE: A * 1 * V * (1 - C),
    DLE: A * T * V * (1 - C)
  };
}
