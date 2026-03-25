/**
 * PromotionPlanner - produces transition plans from a PhasePolicy
 */

import { PhasePolicy } from './PhasePolicy.mjs';

export class PromotionPlanner {
  constructor({ policy = null } = {}) {
    this.policy = policy instanceof PhasePolicy ? policy : PhasePolicy.default();
  }

  planPromotion(currentPhase, options = {}) {
    const targetPhase = this.policy.getNextPhase(currentPhase);
    if (!targetPhase) {
      throw new Error(`No next phase from ${currentPhase}`);
    }

    return this._buildPlan('promote', currentPhase, targetPhase, options);
  }

  planDemotion(currentPhase, options = {}) {
    const targetPhase = this.policy.getPreviousPhase(currentPhase);
    if (!targetPhase) {
      throw new Error(`No previous phase from ${currentPhase}`);
    }

    return this._buildPlan('demote', currentPhase, targetPhase, options);
  }

  planSetPhase(currentPhase, targetPhase, options = {}) {
    if (currentPhase === targetPhase) {
      throw new Error(`Already in phase ${currentPhase}`);
    }

    return this._buildPlan('set', currentPhase, targetPhase, options);
  }

  _buildPlan(action, fromPhase, toPhase, options) {
    const gate = this.policy.getGate(fromPhase, toPhase);
    const dryRun = Boolean(options.dryRun);
    const noDataChange = options.noDataChange !== false;

    return {
      action,
      fromPhase,
      toPhase,
      dryRun,
      noDataChange,
      gate: gate || {
        requireApproval: false,
        requireTicket: false,
        requireCleanStatus: true,
        notes: ''
      },
      checks: {
        approvalRequired: Boolean(gate?.requireApproval),
        ticketRequired: Boolean(gate?.requireTicket),
        cleanStatusRequired: gate?.requireCleanStatus !== false
      }
    };
  }
}
