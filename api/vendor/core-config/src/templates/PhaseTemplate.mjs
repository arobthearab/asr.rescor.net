/**
 * PhaseTemplate - Pre-configured phase/environment templates
 *
 * Provides common phase configuration templates for different environments
 */

import { Template } from '../Template.mjs';
import { PhaseSchema } from '../schemas/PhaseSchema.mjs';

/**
 * Development phase template
 *
 * Configured for local development with debug logging
 */
export class DevelopmentPhaseTemplate extends Template {
  constructor(projectPrefix = 'RESCOR', options = {}) {
    super(
      new PhaseSchema({ projectPrefix, ...options }),
      {
        app: {
          phase: 'DEV',
          project_prefix: projectPrefix,
          log_level: 'debug'
        }
      },
      {
        name: 'DevelopmentPhaseTemplate',
        description: `Development phase for ${projectPrefix}`,
        tags: ['development', 'dev', 'debug'],
        projectPrefix
      }
    );
  }
}

/**
 * UAT phase template
 *
 * Configured for User Acceptance Testing with info logging
 */
export class UATPhaseTemplate extends Template {
  constructor(projectPrefix = 'RESCOR', options = {}) {
    super(
      new PhaseSchema({ projectPrefix, ...options }),
      {
        app: {
          phase: 'UAT',
          project_prefix: projectPrefix,
          log_level: 'info'
        }
      },
      {
        name: 'UATPhaseTemplate',
        description: `UAT phase for ${projectPrefix}`,
        tags: ['uat', 'staging', 'testing'],
        projectPrefix
      }
    );
  }
}

/**
 * Production phase template
 *
 * Configured for production with warning-level logging
 */
export class ProductionPhaseTemplate extends Template {
  constructor(projectPrefix = 'RESCOR', options = {}) {
    super(
      new PhaseSchema({ projectPrefix, ...options }),
      {
        app: {
          phase: 'PROD',
          project_prefix: projectPrefix,
          log_level: 'warn'
        }
      },
      {
        name: 'ProductionPhaseTemplate',
        description: `Production phase for ${projectPrefix}`,
        tags: ['production', 'prod'],
        projectPrefix
      }
    );
  }
}

/**
 * Test Center Development template
 *
 * Pre-configured for TC development environment
 */
export class TCDevelopmentTemplate extends Template {
  constructor(options = {}) {
    super(
      new PhaseSchema({ projectPrefix: 'TC', ...options }),
      {
        app: {
          phase: 'DEV',
          project_prefix: 'TC',
          log_level: 'debug'
        }
      },
      {
        name: 'TCDevelopmentTemplate',
        description: 'Test Center development phase (TCDEV schema)',
        tags: ['tc', 'testcenter', 'development'],
        projectPrefix: 'TC',
        schemaName: 'TCDEV'
      }
    );
  }
}

/**
 * Test Center UAT template
 *
 * Pre-configured for TC UAT environment
 */
export class TCUATTemplate extends Template {
  constructor(options = {}) {
    super(
      new PhaseSchema({ projectPrefix: 'TC', ...options }),
      {
        app: {
          phase: 'UAT',
          project_prefix: 'TC',
          log_level: 'info'
        }
      },
      {
        name: 'TCUATTemplate',
        description: 'Test Center UAT phase (TCUAT schema)',
        tags: ['tc', 'testcenter', 'uat'],
        projectPrefix: 'TC',
        schemaName: 'TCUAT'
      }
    );
  }
}

/**
 * Test Center Production template
 *
 * Pre-configured for TC production environment
 */
export class TCProductionTemplate extends Template {
  constructor(options = {}) {
    super(
      new PhaseSchema({ projectPrefix: 'TC', ...options }),
      {
        app: {
          phase: 'PROD',
          project_prefix: 'TC',
          log_level: 'warn'
        }
      },
      {
        name: 'TCProductionTemplate',
        description: 'Test Center production phase (TC schema)',
        tags: ['tc', 'testcenter', 'production'],
        projectPrefix: 'TC',
        schemaName: 'TC'
      }
    );
  }
}

/**
 * SPM Development template
 *
 * Pre-configured for SPM development environment
 */
export class SPMDevelopmentTemplate extends Template {
  constructor(options = {}) {
    super(
      new PhaseSchema({ projectPrefix: 'SPM', ...options }),
      {
        app: {
          phase: 'DEV',
          project_prefix: 'SPM',
          log_level: 'debug'
        }
      },
      {
        name: 'SPMDevelopmentTemplate',
        description: 'SPM development phase (SPMDEV schema)',
        tags: ['spm', 'development'],
        projectPrefix: 'SPM',
        schemaName: 'SPMDEV'
      }
    );
  }
}

/**
 * SPM UAT template
 *
 * Pre-configured for SPM UAT environment
 */
export class SPMUATTemplate extends Template {
  constructor(options = {}) {
    super(
      new PhaseSchema({ projectPrefix: 'SPM', ...options }),
      {
        app: {
          phase: 'UAT',
          project_prefix: 'SPM',
          log_level: 'info'
        }
      },
      {
        name: 'SPMUATTemplate',
        description: 'SPM UAT phase (SPMUAT schema)',
        tags: ['spm', 'uat'],
        projectPrefix: 'SPM',
        schemaName: 'SPMUAT'
      }
    );
  }
}

/**
 * SPM Production template
 *
 * Pre-configured for SPM production environment
 */
export class SPMProductionTemplate extends Template {
  constructor(options = {}) {
    super(
      new PhaseSchema({ projectPrefix: 'SPM', ...options }),
      {
        app: {
          phase: 'PROD',
          project_prefix: 'SPM',
          log_level: 'warn'
        }
      },
      {
        name: 'SPMProductionTemplate',
        description: 'SPM production phase (SPM schema)',
        tags: ['spm', 'production'],
        projectPrefix: 'SPM',
        schemaName: 'SPM'
      }
    );
  }
}

/**
 * Helper function to create phase template by project and environment
 *
 * @param {string} project - Project name (TC, SPM, or custom)
 * @param {string} phase - Phase name (dev, uat, prod)
 * @param {Object} options - Template options
 * @returns {Template} - Phase template instance
 */
export function createPhaseTemplate(project, phase, options = {}) {
  // Project-specific templates
  if (project.toUpperCase() === 'TC') {
    const tcTemplates = {
      dev: TCDevelopmentTemplate,
      development: TCDevelopmentTemplate,
      uat: TCUATTemplate,
      staging: TCUATTemplate,
      prod: TCProductionTemplate,
      production: TCProductionTemplate
    };
    const TemplateClass = tcTemplates[phase.toLowerCase()];
    if (TemplateClass) {
      return new TemplateClass(options);
    }
  }

  if (project.toUpperCase() === 'SPM') {
    const spmTemplates = {
      dev: SPMDevelopmentTemplate,
      development: SPMDevelopmentTemplate,
      uat: SPMUATTemplate,
      staging: SPMUATTemplate,
      prod: SPMProductionTemplate,
      production: SPMProductionTemplate
    };
    const TemplateClass = spmTemplates[phase.toLowerCase()];
    if (TemplateClass) {
      return new TemplateClass(options);
    }
  }

  // Generic templates
  const genericTemplates = {
    dev: DevelopmentPhaseTemplate,
    development: DevelopmentPhaseTemplate,
    uat: UATPhaseTemplate,
    staging: UATPhaseTemplate,
    prod: ProductionPhaseTemplate,
    production: ProductionPhaseTemplate
  };

  const TemplateClass = genericTemplates[phase.toLowerCase()];
  if (!TemplateClass) {
    throw new Error(`Unknown phase: ${phase}. Available: dev, uat, prod`);
  }

  return new TemplateClass(project.toUpperCase(), options);
}
