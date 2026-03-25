/**
 * ApiTemplate - Pre-configured API templates
 *
 * Provides common API configuration templates for different services
 */

import { Template } from '../Template.mjs';
import { ApiSchema } from '../schemas/ApiSchema.mjs';

/**
 * Security API template
 *
 * Configured for security-related APIs (NVD, etc.)
 */
export class SecurityApiTemplate extends Template {
  constructor(options = {}) {
    super(
      new ApiSchema({ apis: ['nvd'], ...options }),
      {
        api: {
          nvd_base_url: 'https://services.nvd.nist.gov/rest/json',
          nvd_key: options.nvdKey || ''  // Requires API key
        }
      },
      {
        name: 'SecurityApiTemplate',
        description: 'Security vulnerability database APIs (NVD)',
        tags: ['security', 'vulnerabilities', 'nvd']
      }
    );
  }
}

/**
 * Development tools API template
 *
 * Configured for development-related APIs (GitHub, etc.)
 */
export class DevelopmentApiTemplate extends Template {
  constructor(options = {}) {
    super(
      new ApiSchema({ apis: ['github'], ...options }),
      {
        api: {
          github_base_url: 'https://api.github.com',
          github_key: options.githubKey || ''  // Requires token
        }
      },
      {
        name: 'DevelopmentApiTemplate',
        description: 'Development tool APIs (GitHub)',
        tags: ['development', 'github', 'tools']
      }
    );
  }
}

/**
 * AI Services API template
 *
 * Configured for AI/ML APIs (OpenAI, Anthropic)
 */
export class AIApiTemplate extends Template {
  constructor(options = {}) {
    const apis = options.apis || ['openai', 'anthropic'];

    const defaults = {
      api: {}
    };

    if (apis.includes('openai')) {
      defaults.api.openai_base_url = 'https://api.openai.com/v1';
      defaults.api.openai_key = options.openaiKey || '';
    }

    if (apis.includes('anthropic')) {
      defaults.api.anthropic_base_url = 'https://api.anthropic.com/v1';
      defaults.api.anthropic_key = options.anthropicKey || '';
    }

    super(
      new ApiSchema({ apis, ...options }),
      defaults,
      {
        name: 'AIApiTemplate',
        description: 'AI/ML service APIs (OpenAI, Anthropic)',
        tags: ['ai', 'ml', 'openai', 'anthropic']
      }
    );
  }
}

/**
 * Communication API template
 *
 * Configured for communication APIs (SendGrid, Twilio, Slack)
 */
export class CommunicationApiTemplate extends Template {
  constructor(options = {}) {
    const apis = options.apis || ['sendgrid', 'twilio', 'slack'];

    const defaults = {
      api: {}
    };

    if (apis.includes('sendgrid')) {
      defaults.api.sendgrid_base_url = 'https://api.sendgrid.com/v3';
      defaults.api.sendgrid_key = options.sendgridKey || '';
    }

    if (apis.includes('twilio')) {
      defaults.api.twilio_base_url = 'https://api.twilio.com';
      defaults.api.twilio_key = options.twilioKey || '';
    }

    if (apis.includes('slack')) {
      defaults.api.slack_base_url = 'https://slack.com/api';
      defaults.api.slack_key = options.slackKey || '';
    }

    super(
      new ApiSchema({ apis, ...options }),
      defaults,
      {
        name: 'CommunicationApiTemplate',
        description: 'Communication service APIs (SendGrid, Twilio, Slack)',
        tags: ['communication', 'email', 'sms', 'chat']
      }
    );
  }
}

/**
 * Payment API template
 *
 * Configured for payment processing APIs (Stripe)
 */
export class PaymentApiTemplate extends Template {
  constructor(options = {}) {
    super(
      new ApiSchema({ apis: ['stripe'], ...options }),
      {
        api: {
          stripe_base_url: 'https://api.stripe.com/v1',
          stripe_key: options.stripeKey || ''  // Requires API key
        }
      },
      {
        name: 'PaymentApiTemplate',
        description: 'Payment processing APIs (Stripe)',
        tags: ['payment', 'stripe', 'billing']
      }
    );
  }
}

/**
 * Complete API template
 *
 * Configured with all common APIs for full-featured applications
 */
export class CompleteApiTemplate extends Template {
  constructor(options = {}) {
    const apis = ['nvd', 'github', 'openai', 'sendgrid', 'slack'];

    super(
      new ApiSchema({ apis, ...options }),
      {
        api: {
          nvd_base_url: 'https://services.nvd.nist.gov/rest/json',
          nvd_key: options.nvdKey || '',
          github_base_url: 'https://api.github.com',
          github_key: options.githubKey || '',
          openai_base_url: 'https://api.openai.com/v1',
          openai_key: options.openaiKey || '',
          sendgrid_base_url: 'https://api.sendgrid.com/v3',
          sendgrid_key: options.sendgridKey || '',
          slack_base_url: 'https://slack.com/api',
          slack_key: options.slackKey || ''
        }
      },
      {
        name: 'CompleteApiTemplate',
        description: 'Complete API configuration with all common services',
        tags: ['complete', 'full-featured', 'all-apis']
      }
    );
  }
}

/**
 * Helper function to create API template by category
 *
 * @param {string} category - Category name (security, development, ai, communication, payment, complete)
 * @param {Object} options - Template options
 * @returns {Template} - API template instance
 */
export function createApiTemplate(category, options = {}) {
  const templates = {
    security: SecurityApiTemplate,
    development: DevelopmentApiTemplate,
    dev: DevelopmentApiTemplate,
    ai: AIApiTemplate,
    ml: AIApiTemplate,
    communication: CommunicationApiTemplate,
    comm: CommunicationApiTemplate,
    payment: PaymentApiTemplate,
    complete: CompleteApiTemplate,
    full: CompleteApiTemplate
  };

  const TemplateClass = templates[category.toLowerCase()];
  if (!TemplateClass) {
    throw new Error(`Unknown API template category: ${category}. Available: ${Object.keys(templates).join(', ')}`);
  }

  return new TemplateClass(options);
}
