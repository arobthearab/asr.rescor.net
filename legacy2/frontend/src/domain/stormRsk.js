import { ValidationError } from '@rescor-llc/core-utils/errors';

const DEFAULT_BASE = 5;
const DEFAULT_CURRENT = 1;
const DEFAULT_DIVISOR = DEFAULT_BASE - DEFAULT_CURRENT;

function toFiniteNumber(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${fieldName} must be a finite number`, 'ASR_INVALID_NUMBER', fieldName);
  }

  return parsed;
}

function ensureRange01(value, fieldName) {
  if (value < 0 || value > 1) {
    throw new ValidationError(`${fieldName} must be between 0 and 1`, 'ASR_OUT_OF_RANGE', fieldName);
  }
}

/**
 * Asset share transform for STORM-style A semantics.
 *
 * A = assetValue / totalAssetValue
 * Example: 10,000 / 1,000,000 = 0.01
 */
export function computeAssetShareA({ assetValue, totalAssetValue }) {
  const asset = toFiniteNumber(assetValue, 'assetValue');
  const total = toFiniteNumber(totalAssetValue, 'totalAssetValue');

  if (asset < 0) {
    throw new ValidationError('assetValue must be >= 0', 'ASR_OUT_OF_RANGE', 'assetValue');
  }

  if (total <= 0) {
    throw new ValidationError('totalAssetValue must be > 0', 'ASR_OUT_OF_RANGE', 'totalAssetValue');
  }

  if (asset > total) {
    throw new ValidationError('assetValue must be <= totalAssetValue', 'ASR_OUT_OF_RANGE', 'assetValue');
  }

  return asset / total;
}

function ensurePositiveInt(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`${fieldName} must be a positive integer`, 'ASR_INVALID_INTEGER', fieldName);
  }

  return parsed;
}

/**
 * Core RSK diminishing-returns aggregate used by STORM.
 * Equivalent to Σ(v_i / d^i), where d = base - current (defaults to 4).
 */
export function rskDiminishingAggregate(values, { divisor = DEFAULT_DIVISOR, floor = 0 } = {}) {
  if (!Array.isArray(values) || values.length === 0) {
    return floor;
  }

  const numeric = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => right - left);

  if (numeric.length === 0) {
    return floor;
  }

  let total = 0;

  for (let index = 0; index < numeric.length; index += 1) {
    total += numeric[index] / Math.pow(divisor, index);
  }

  return Math.max(floor, total);
}

/**
 * TestingCenter STORM aggregate behavior (rounded up integer severity aggregate).
 */
export function calculateStormAggregate(measurements, divisor = DEFAULT_DIVISOR) {
  return Math.ceil(rskDiminishingAggregate(measurements, { divisor, floor: 0 }));
}

/**
 * TestingCenter weighted correction behavior, capped at 1.
 */
export function calculateStormWeightedCorrection(corrections, divisor = DEFAULT_DIVISOR) {
  const aggregate = rskDiminishingAggregate(corrections, { divisor, floor: 0 });
  return Math.min(1, aggregate);
}

/**
 * Legacy AsrValuation/StormIapProcess equivalent for A.
 */
export function computeAssetValueA({
  dataClassification,
  users,
  highValueSelections = []
}) {
  const classValue = ensurePositiveInt(dataClassification, 'dataClassification');
  const usersValue = ensurePositiveInt(users, 'users');

  const highValueAggregate = rskDiminishingAggregate(highValueSelections, {
    divisor: DEFAULT_DIVISOR,
    floor: 0
  });

  const highValueValue = highValueAggregate <= 0 ? 1 : highValueAggregate;

  const highValueMaximum = rskDiminishingAggregate([1, 3, 4, 6, 7, 8], {
    divisor: DEFAULT_DIVISOR,
    floor: 1
  });

  const maximum = 3 * 5 * highValueMaximum;
  const total = classValue * usersValue * highValueValue;

  return {
    value: total / maximum,
    total,
    maximum,
    factors: {
      dataClassification: classValue,
      users: usersValue,
      highValue: highValueValue
    }
  };
}

/**
 * Legacy StormHAM533 equivalent for T (probability + impact).
 */
export function computeThreatT({ history, access, means }) {
  const historyValue = ensurePositiveInt(history, 'history');
  const accessValue = ensurePositiveInt(access, 'access');
  const meansValue = ensurePositiveInt(means, 'means');

  const maximum = 5 * 3 * 3;
  const total = historyValue * accessValue * meansValue;

  const probability = total / maximum;
  const impact = (5 * accessValue * meansValue) / maximum;

  return {
    probability,
    impact,
    value: probability,
    total,
    maximum,
    factors: {
      history: historyValue,
      access: accessValue,
      means: meansValue
    }
  };
}

/**
 * Legacy StormSCEP control effectiveness for one control.
 */
export function computeControlEffective({ implemented, correction }) {
  const implementedValue = toFiniteNumber(implemented, 'implemented');
  const correctionValue = toFiniteNumber(correction, 'correction');

  ensureRange01(implementedValue, 'implemented');
  ensureRange01(correctionValue, 'correction');

  return correctionValue * implementedValue;
}

/**
 * Legacy AsrControlsTable.findControls aggregate efficacy for C.
 */
export function computeControlEfficacy(controlEffectives) {
  const aggregate = rskDiminishingAggregate(controlEffectives, {
    divisor: DEFAULT_DIVISOR,
    floor: 0
  });

  return Math.min(1, aggregate);
}

/**
 * Legacy StormCRVE3 exposure equivalent for V.
 */
export function computeVulnerabilityV({
  capabilities,
  resources,
  visibility,
  confidentialityExposure,
  integrityExposure,
  availabilityExposure
}) {
  const capabilitiesValue = ensurePositiveInt(capabilities, 'capabilities');
  const resourcesValue = ensurePositiveInt(resources, 'resources');
  const visibilityValue = ensurePositiveInt(visibility, 'visibility');
  const confidentialityValue = ensurePositiveInt(confidentialityExposure, 'confidentialityExposure');
  const integrityValue = ensurePositiveInt(integrityExposure, 'integrityExposure');
  const availabilityValue = ensurePositiveInt(availabilityExposure, 'availabilityExposure');

  const ciaAggregate = rskDiminishingAggregate(
    [confidentialityValue, integrityValue, availabilityValue],
    { divisor: DEFAULT_DIVISOR, floor: 0 }
  );

  const ciaMaximum = rskDiminishingAggregate([3, 3, 3], {
    divisor: DEFAULT_DIVISOR,
    floor: 1
  });

  const basicAggregate = capabilitiesValue * resourcesValue * visibilityValue;
  const basicMaximum = 27;

  const total = ciaAggregate * basicAggregate;
  const maximum = ciaMaximum * basicMaximum;

  return {
    value: total / maximum,
    total,
    maximum,
    cia: {
      aggregate: ciaAggregate,
      maximum: ciaMaximum
    },
    basic: {
      aggregate: basicAggregate,
      maximum: basicMaximum
    }
  };
}
