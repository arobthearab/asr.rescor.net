/**
 * PromotionExecutor - applies PromotionPlanner plans with explicit safety checks
 */

export class PromotionExecutor {
  constructor({ stateAdapter = null } = {}) {
    this.stateAdapter = stateAdapter;
  }

  async execute(plan, options = {}) {
    if (!plan || typeof plan !== 'object') {
      throw new Error('A valid plan is required');
    }

    const dryRun = Boolean(plan.dryRun || options.dryRun);
    const allowDestructive = Boolean(options.allowDestructive);
    const approvalToken = options.approvalToken ? String(options.approvalToken).trim() : '';

    if (plan.toPhase === 'production' && !approvalToken && !dryRun) {
      throw new Error('Production transitions require approvalToken');
    }

    if (plan.noDataChange === false && !allowDestructive && !dryRun) {
      throw new Error('Destructive/data-changing execution requires allowDestructive=true');
    }

    if (dryRun) {
      return {
        success: true,
        applied: false,
        dryRun: true,
        plan
      };
    }

    if (!this.stateAdapter || typeof this.stateAdapter.setCurrentPhase !== 'function') {
      throw new Error('No stateAdapter configured for execution');
    }

    await this.stateAdapter.setCurrentPhase(plan.toPhase);

    return {
      success: true,
      applied: true,
      dryRun: false,
      plan
    };
  }
}
