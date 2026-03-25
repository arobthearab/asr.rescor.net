/**
 * PhasePolicy - declarative phase sequencing and transition guardrails
 */

import { PHASES } from './PhaseManager.mjs';

const VALID_PHASES = new Set(Object.values(PHASES));

export class PhasePolicy {
  constructor({ sequence, gates } = {}) {
    this.sequence = this._normalizeSequence(sequence);
    this.gates = this._normalizeGates(gates);
  }

  static default() {
    return new PhasePolicy({
      sequence: [PHASES.DEVELOPMENT, PHASES.UAT, PHASES.PRODUCTION],
      gates: {}
    });
  }

  static fromJSON(value) {
    if (!value) {
      return PhasePolicy.default();
    }

    if (typeof value === 'string') {
      return new PhasePolicy(JSON.parse(value));
    }

    return new PhasePolicy(value);
  }

  toJSON() {
    return {
      sequence: [...this.sequence],
      gates: { ...this.gates }
    };
  }

  getTransitionKey(fromPhase, toPhase) {
    return `${fromPhase}->${toPhase}`;
  }

  getNextPhase(currentPhase) {
    const index = this.sequence.indexOf(currentPhase);
    if (index < 0 || index === this.sequence.length - 1) {
      return null;
    }
    return this.sequence[index + 1];
  }

  getPreviousPhase(currentPhase) {
    const index = this.sequence.indexOf(currentPhase);
    if (index <= 0) {
      return null;
    }
    return this.sequence[index - 1];
  }

  getGate(fromPhase, toPhase) {
    return this.gates[this.getTransitionKey(fromPhase, toPhase)] || null;
  }

  setGate(fromPhase, toPhase, gate = {}) {
    if (!VALID_PHASES.has(fromPhase) || !VALID_PHASES.has(toPhase)) {
      throw new Error(`Invalid phase transition gate: ${fromPhase} -> ${toPhase}`);
    }

    const key = this.getTransitionKey(fromPhase, toPhase);
    this.gates[key] = {
      requireApproval: Boolean(gate.requireApproval),
      requireTicket: Boolean(gate.requireTicket),
      requireCleanStatus: gate.requireCleanStatus !== false,
      notes: gate.notes ? String(gate.notes) : ''
    };
  }

  _normalizeSequence(sequence) {
    const source = Array.isArray(sequence) && sequence.length > 0
      ? sequence
      : [PHASES.DEVELOPMENT, PHASES.UAT, PHASES.PRODUCTION];

    const normalized = source
      .map(value => String(value || '').trim().toLowerCase())
      .filter(Boolean);

    const unique = [...new Set(normalized)];
    if (unique.some(value => !VALID_PHASES.has(value))) {
      throw new Error(`Invalid phase sequence: ${source.join(', ')}`);
    }

    if (unique.length < 2) {
      throw new Error('Phase sequence must contain at least 2 phases');
    }

    return unique;
  }

  _normalizeGates(gates) {
    if (!gates || typeof gates !== 'object') {
      return {};
    }

    const normalized = {};
    for (const [key, value] of Object.entries(gates)) {
      const [fromPhase, toPhase] = String(key).split('->').map(part => String(part || '').trim().toLowerCase());
      if (!VALID_PHASES.has(fromPhase) || !VALID_PHASES.has(toPhase)) {
        continue;
      }

      normalized[`${fromPhase}->${toPhase}`] = {
        requireApproval: Boolean(value?.requireApproval),
        requireTicket: Boolean(value?.requireTicket),
        requireCleanStatus: value?.requireCleanStatus !== false,
        notes: value?.notes ? String(value.notes) : ''
      };
    }

    return normalized;
  }
}
