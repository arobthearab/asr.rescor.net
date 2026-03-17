import { ValidationError } from '@rescor-llc/core-utils/errors';

const MAX_FILTER_LENGTH = 120;

export function validateThreatFilter(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return '';
  }

  const value = String(rawValue);

  if (value.length > MAX_FILTER_LENGTH) {
    throw new ValidationError(
      `Threat filter exceeds ${MAX_FILTER_LENGTH} characters`,
      'ASR_FILTER_TOO_LONG',
      'threatFilter'
    );
  }

  return value.trim();
}
