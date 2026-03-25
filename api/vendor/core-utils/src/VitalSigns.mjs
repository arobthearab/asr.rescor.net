import { BaseError, TimeoutError } from './errors/BaseError.mjs';

const DEFAULT_TOTAL_TIMEOUT_MS = 60_000;
const DEFAULT_ACTION_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_TRANSITIONS = 100;

const TERMINAL_STATES = new Set([
  'success',
  'skip',
  'soft-fail',
  'hard-fail'
]);

const SERVICE_STATES = Object.freeze({
  UNKNOWN: 'UNKNOWN',
  HUNG: 'HUNG',
  STARTING: 'STARTING',
  STARTED: 'STARTED',
  STOPPING: 'STOPPING',
  STOPPED: 'STOPPED',
  FORCED: 'FORCED'
});

/* -------------------------------------------------------------------------- */
/**
 * Creates a cancellable delay promise.
 *
 * @param {number} ms - Delay duration in milliseconds.
 * @param {AbortSignal} [signal] - Optional abort signal.
 * @returns {Promise<void>} Resolves after delay or rejects on abort.
 */
function delay(ms, signal) {
  if (!ms || ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new VitalSignsAbortedError('VitalSigns execution aborted during delay'));
    };

    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };

    if (signal?.aborted) {
      cleanup();
      reject(new VitalSignsAbortedError('VitalSigns execution aborted during delay'));
      return;
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/* -------------------------------------------------------------------------- */
/**
 * Normalizes heterogeneous action return values to a canonical result shape.
 *
 * @param {unknown} result - Raw action result.
 * @returns {{state:string,delayMs?:number,message?:string,data?:unknown,metadata?:object}}
 */
function normalizeStepResult(result) {
  if (result === undefined || result === null || result === true) {
    return { state: 'success' };
  }

  if (result === false) {
    return { state: 'hard-fail' };
  }

  if (typeof result === 'string') {
    return { state: result };
  }

  if (typeof result === 'object') {
    return {
      state: result.state ?? 'success',
      delayMs: result.delayMs,
      message: result.message,
      data: result.data,
      metadata: result.metadata
    };
  }

  return { state: 'success', data: result };
}

/* -------------------------------------------------------------------------- */
/**
 * Determines whether a state causes the action runner to loop.
 *
 * @param {string} state - Action result state.
 * @returns {boolean} True for loop-driving states.
 */
function isLoopingState(state) {
  return state === 'retry' || state === 'force';
}

/* -------------------------------------------------------------------------- */
/**
 * Wraps an action promise with a per-action timeout.
 *
 * @param {Promise<unknown>} actionPromise - Action execution promise.
 * @param {number} timeoutMs - Timeout duration in milliseconds.
 * @param {string} serviceName - Service name for diagnostics.
 * @param {string} actionName - Action name for diagnostics.
 * @returns {Promise<unknown>} Action result or timeout error.
 */
function withActionTimeout(actionPromise, timeoutMs, serviceName, actionName) {
  if (!timeoutMs || timeoutMs <= 0) {
    return actionPromise;
  }

  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new VitalSignsActionTimeoutError(serviceName, actionName, timeoutMs));
    }, timeoutMs);
  });

  return Promise.race([actionPromise, timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

/* -------------------------------------------------------------------------- */
/**
 * Base error type for VitalSigns failures.
 */
export class VitalSignsError extends BaseError {
  /* -------------------------------------------------------------------------- */
  /**
   * @param {string} message - Error message.
   * @param {string|number|null} [code=null] - Optional error code.
   * @param {Record<string, unknown>} [metadata={}] - Structured metadata.
   * @param {Error|null} [originalError=null] - Source error.
   */
  constructor(message, code = null, metadata = {}, originalError = null) {
    super(message, 'VitalSignsError', code, originalError, metadata);
  }
}

/* -------------------------------------------------------------------------- */
/**
 * Raised when transition count exceeds configured loop guard limit.
 */
export class VitalSignsLoopGuardError extends VitalSignsError {
  /* -------------------------------------------------------------------------- */
  /**
   * @param {string} serviceName - Service name.
   * @param {string} actionName - Action name.
   * @param {number} maxTransitions - Configured max transitions.
   */
  constructor(serviceName, actionName, maxTransitions) {
    super(
      `Loop guard triggered for ${serviceName}.${actionName} after ${maxTransitions} transitions`,
      'VITALSIGNS_LOOP_GUARD',
      { serviceName, actionName, maxTransitions }
    );
    this.name = 'VitalSignsLoopGuardError';
  }
}

/* -------------------------------------------------------------------------- */
/**
 * Raised for action handler failures and invalid action behavior.
 */
export class VitalSignsActionError extends VitalSignsError {
  /* -------------------------------------------------------------------------- */
  /**
   * @param {string} serviceName - Service name.
   * @param {string} actionName - Action name.
   * @param {string} message - Failure message.
   * @param {Record<string, unknown>} [metadata={}] - Structured metadata.
   * @param {Error|null} [originalError=null] - Source error.
   */
  constructor(serviceName, actionName, message, metadata = {}, originalError = null) {
    super(
      message || `Action ${serviceName}.${actionName} failed`,
      'VITALSIGNS_ACTION_FAILED',
      { serviceName, actionName, ...metadata },
      originalError
    );
    this.name = 'VitalSignsActionError';
  }
}

/* -------------------------------------------------------------------------- */
/**
 * Raised when execution is aborted by signal.
 */
export class VitalSignsAbortedError extends VitalSignsError {
  /* -------------------------------------------------------------------------- */
  /**
   * @param {string} [message='VitalSigns execution aborted'] - Abort message.
   */
  constructor(message = 'VitalSigns execution aborted') {
    super(message, 'VITALSIGNS_ABORTED');
    this.name = 'VitalSignsAbortedError';
  }
}

/* -------------------------------------------------------------------------- */
/**
 * Raised when a single action exceeds its timeout.
 */
export class VitalSignsActionTimeoutError extends TimeoutError {
  /* -------------------------------------------------------------------------- */
  /**
   * @param {string} serviceName - Service name.
   * @param {string} actionName - Action name.
   * @param {number} timeoutMs - Timeout in milliseconds.
   */
  constructor(serviceName, actionName, timeoutMs) {
    super(`Action ${serviceName}.${actionName} timed out after ${timeoutMs}ms`, 'VITALSIGNS_ACTION_TIMEOUT', timeoutMs);
    this.name = 'VitalSignsActionTimeoutError';
    this.metadata = {
      ...this.metadata,
      serviceName,
      actionName
    };
  }
}

/* -------------------------------------------------------------------------- */
/**
 * Raised when total run timeout is exceeded.
 */
export class VitalSignsTimeoutError extends TimeoutError {
  /* -------------------------------------------------------------------------- */
  /**
   * @param {number} timeoutMs - Total timeout in milliseconds.
   */
  constructor(timeoutMs) {
    super(`VitalSigns execution timed out after ${timeoutMs}ms`, 'VITALSIGNS_TIMEOUT', timeoutMs);
    this.name = 'VitalSignsTimeoutError';
  }
}

/* -------------------------------------------------------------------------- */
/**
 * Represents a named service with lifecycle actions.
 */
export class VitalSign {
  /* -------------------------------------------------------------------------- */
  /**
   * @param {string} name - Service name.
   * @param {object} [options={}] - Action handlers and metadata.
   */
  constructor(name, {
    check = null,
    start = null,
    stop = null,
    force = null,
    actions = {},
    metadata = {}
  } = {}) {
    this.name = name;
    this.metadata = metadata;
    this.actions = {
      check,
      start,
      stop,
      force,
      ...actions
    };
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Resolves an action handler by name.
   *
   * @param {string} actionName - Action key.
   * @returns {Function|null} Action handler or null.
   */
  getAction(actionName) {
    return this.actions[actionName] ?? null;
  }
}

/* -------------------------------------------------------------------------- */
/**
 * Plan-based lifecycle executor for one or more VitalSign services.
 */
export class VitalSigns {
  /* -------------------------------------------------------------------------- */
  /**
   * @param {object} [options={}] - VitalSigns configuration.
   */
  constructor({
    signs = [],
    plans = {},
    manifests = {},
    defaults = {}
  } = {}) {
    this.signMap = new Map();
    this.manifestMap = new Map();
    this.serviceRegistry = new Map();
    this.subscribers = new Set();
    this.plans = plans;
    this.defaults = {
      totalTimeoutMs: DEFAULT_TOTAL_TIMEOUT_MS,
      actionTimeoutMs: DEFAULT_ACTION_TIMEOUT_MS,
      maxTransitions: DEFAULT_MAX_TRANSITIONS,
      failFast: true,
      ...defaults
    };

    for (const sign of signs) {
      this.register(sign);
    }

    for (const [appName, manifest] of Object.entries(manifests)) {
      this.registerManifest(appName, manifest);
    }
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Registers a VitalSign instance.
   *
   * @param {VitalSign} sign - Sign to register.
   * @returns {VitalSigns} Fluent instance.
   */
  register(sign) {
    if (!(sign instanceof VitalSign)) {
      throw new VitalSignsError('Only VitalSign instances can be registered', 'VITALSIGNS_INVALID_SIGN');
    }

    this.signMap.set(sign.name, sign);
    this.setServiceState(sign.name, SERVICE_STATES.UNKNOWN, {
      reason: 'registered'
    });
    return this;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Registers a manifest for an application/service.
   *
   * @param {string} appName - Application/service name.
   * @param {object} [manifest={}] - Required/optional dependency sets.
   * @returns {VitalSigns} Fluent instance.
   */
  registerManifest(appName, manifest = {}) {
    if (!appName || typeof appName !== 'string') {
      throw new VitalSignsError('Manifest name must be a non-empty string', 'VITALSIGNS_INVALID_MANIFEST');
    }

    const normalized = {
      required: Array.isArray(manifest.required) ? manifest.required : [],
      optional: Array.isArray(manifest.optional) ? manifest.optional : []
    };

    this.manifestMap.set(appName, normalized);
    return this;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Returns a registered manifest by name.
   *
   * @param {string} appName - Manifest name.
   * @returns {{required:string[], optional:string[]}|null} Manifest or null.
   */
  getManifest(appName) {
    return this.manifestMap.get(appName) ?? null;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Returns all registered manifests.
   *
   * @returns {Record<string, {required:string[], optional:string[]}>} Manifest map.
   */
  listManifests() {
    return Object.fromEntries(this.manifestMap.entries());
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Subscribes to VitalSigns registry/step events.
   *
   * @param {Function} handler - Event callback.
   * @returns {Function} Unsubscribe function.
   */
  subscribe(handler) {
    if (!(handler instanceof Function)) {
      throw new VitalSignsError('Subscriber must be a function', 'VITALSIGNS_INVALID_SUBSCRIBER');
    }

    this.subscribers.add(handler);
    return () => {
      this.subscribers.delete(handler);
    };
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Emits events to subscribers.
   *
   * @param {object} event - Event payload.
   */
  notify(event) {
    for (const subscriber of this.subscribers) {
      try {
        subscriber(event);
      } catch {
        // Ignore subscriber errors to avoid impacting orchestration flow.
      }
    }
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Updates and stores service registry state.
   *
   * @param {string} serviceName - Service name.
   * @param {string} state - Registry state.
   * @param {object} [details={}] - Additional metadata.
   */
  setServiceState(serviceName, state, details = {}) {
    const previous = this.serviceRegistry.get(serviceName) ?? {
      state: SERVICE_STATES.UNKNOWN,
      updatedAt: null,
      lastAction: null,
      message: null,
      details: {}
    };

    const next = {
      ...previous,
      state,
      updatedAt: Date.now(),
      lastAction: details.action ?? previous.lastAction,
      message: details.message ?? previous.message,
      details: {
        ...previous.details,
        ...details
      }
    };

    this.serviceRegistry.set(serviceName, next);

    if (
      previous.state !== next.state ||
      previous.lastAction !== next.lastAction ||
      previous.message !== next.message
    ) {
      this.notify({
        type: 'service-state-changed',
        service: serviceName,
        previous,
        current: next
      });
    }
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Gets service state entry.
   *
   * @param {string} serviceName - Service name.
   * @returns {{state:string,updatedAt:number|null,lastAction:string|null,message:string|null,details:object}|null}
   */
  getServiceState(serviceName) {
    return this.serviceRegistry.get(serviceName) ?? null;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Lists service registry states.
   *
   * @returns {Record<string, object>} Service states by service name.
   */
  listServiceStates() {
    return Object.fromEntries(this.serviceRegistry.entries());
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Resolves a named plan or validates an inline step array.
   *
   * @param {string|Array<object>} planOrName - Plan name or inline steps.
   * @returns {Array<object>} Resolved step list.
   */
  resolvePlan(planOrName) {
    if (Array.isArray(planOrName)) {
      return planOrName;
    }

    if (typeof planOrName === 'string') {
      const predefinedPlan = this.plans[planOrName];

      if (!Array.isArray(predefinedPlan)) {
        throw new VitalSignsError(`Unknown plan: ${planOrName}`, 'VITALSIGNS_UNKNOWN_PLAN', { planOrName });
      }

      return predefinedPlan;
    }

    throw new VitalSignsError('Plan must be a string or an array of steps', 'VITALSIGNS_INVALID_PLAN');
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Builds per-run context from defaults and caller options.
   *
   * @param {object} [options={}] - Run overrides.
   * @returns {object} Execution context.
   */
  createExecutionContext(options = {}) {
    const merged = {
      ...this.defaults,
      ...options
    };

    const startedAt = Date.now();
    const deadline = startedAt + merged.totalTimeoutMs;

    return {
      options: merged,
      startedAt,
      deadline,
      transitions: 0,
      signal: merged.signal,
      results: [],
      dependencyStack: new Set()
    };
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Resolves required/optional dependencies for a step.
   *
   * @param {object} step - Plan step.
   * @returns {{required:string[], optional:string[]}} Dependencies.
   */
  resolveDependencies(step) {
    if (step?.manifestApp && typeof step.manifestApp === 'string') {
      const manifest = this.getManifest(step.manifestApp) ?? { required: [], optional: [] };
      return {
        required: [...manifest.required],
        optional: [...manifest.optional]
      };
    }

    return {
      required: Array.isArray(step?.requiredServices)
        ? [...step.requiredServices]
        : (Array.isArray(step?.required) ? [...step.required] : []),
      optional: Array.isArray(step?.optionalServices)
        ? [...step.optionalServices]
        : (Array.isArray(step?.optional) ? [...step.optional] : [])
    };
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Maps action/result to service registry state.
   *
   * @param {string} actionName - Action name.
   * @param {object} result - Normalized action result.
   * @returns {string} Registry state.
   */
  resolveServiceStateFromResult(actionName, result) {
    if (result.state === 'hard-fail' && actionName === 'check') {
      return SERVICE_STATES.HUNG;
    }

    if (result.state === 'hard-fail') {
      return SERVICE_STATES.UNKNOWN;
    }

    if (result.state === 'soft-fail') {
      return SERVICE_STATES.UNKNOWN;
    }

    if (actionName === 'start' || actionName === 'check') {
      return SERVICE_STATES.STARTED;
    }

    if (actionName === 'stop') {
      return SERVICE_STATES.STOPPED;
    }

    if (actionName === 'force') {
      return SERVICE_STATES.FORCED;
    }

    return SERVICE_STATES.UNKNOWN;
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Records a completed step in run context and publishes completion event.
   *
   * @param {object} runContext - Execution context.
   * @param {object} stepResult - Completed step result.
   */
  recordStepResult(runContext, stepResult) {
    runContext.results.push(stepResult);
    this.notify({
      type: 'step-completed',
      step: stepResult
    });
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Ensures dependency service is available via check/start before main step.
   *
   * @param {string} dependencyService - Dependency service name.
   * @param {boolean} required - Whether dependency is required.
   * @param {object} parentStep - Step that depends on dependency service.
   * @param {object} runContext - Shared run context.
   */
  async ensureDependency(dependencyService, required, parentStep, runContext) {
    const currentState = this.getServiceState(dependencyService);

    if (currentState?.state === SERVICE_STATES.STARTED) {
      return;
    }

    const sign = this.signMap.get(dependencyService);

    if (!sign) {
      if (required) {
        throw new VitalSignsActionError(
          parentStep.service,
          parentStep.action,
          `Missing required dependency: ${dependencyService}`,
          { parentStep, dependencyService }
        );
      }

      return;
    }

    const stackKey = `${parentStep.service}:${dependencyService}`;
    if (runContext.dependencyStack.has(stackKey)) {
      throw new VitalSignsActionError(
        parentStep.service,
        parentStep.action,
        `Dependency cycle detected while ensuring ${dependencyService}`,
        { parentStep, dependencyService }
      );
    }

    runContext.dependencyStack.add(stackKey);

    try {
      const attemptOrder = ['check', 'start'];
      let dependencyAvailable = false;

      for (const actionName of attemptOrder) {
        const handler = sign.getAction(actionName);

        if (!(handler instanceof Function)) {
          continue;
        }

        if (actionName === 'start') {
          this.setServiceState(dependencyService, SERVICE_STATES.STARTING, {
            action: 'start',
            message: `Starting dependency for ${parentStep.service}`,
            dependencyFor: parentStep.service
          });
        }

        const startedAt = Date.now();
        const result = await this.executeActionWithGuards(
          sign,
          actionName,
          {
            service: dependencyService,
            action: actionName,
            dependencyFor: parentStep.service,
            dependencyRequired: required
          },
          runContext
        );
        const finishedAt = Date.now();

        const normalizedState = !required && result.state === 'hard-fail'
          ? 'soft-fail'
          : result.state;

        const resolvedState = this.resolveServiceStateFromResult(actionName, {
          ...result,
          state: normalizedState
        });

        this.setServiceState(dependencyService, resolvedState, {
          action: actionName,
          message: result.message,
          dependencyFor: parentStep.service,
          dependencyRequired: required
        });

        this.recordStepResult(runContext, {
          service: dependencyService,
          action: actionName,
          startedAt,
          finishedAt,
          durationMs: finishedAt - startedAt,
          state: normalizedState,
          message: result.message,
          data: result.data,
          metadata: {
            ...result.metadata,
            dependencyFor: parentStep.service,
            dependencyRequired: required
          }
        });

        if (normalizedState === 'success') {
          dependencyAvailable = true;
          break;
        }
      }

      if (!dependencyAvailable && required) {
        throw new VitalSignsActionError(
          parentStep.service,
          parentStep.action,
          `Required dependency unavailable: ${dependencyService}`,
          { parentStep, dependencyService }
        );
      }
    } finally {
      runContext.dependencyStack.delete(stackKey);
    }
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Ensures all dependencies declared by a step are prepared.
   *
   * @param {object} step - Plan step.
   * @param {object} runContext - Shared run context.
   */
  async ensureDependenciesForStep(step, runContext) {
    const { required, optional } = this.resolveDependencies(step);

    for (const dependencyService of required) {
      await this.ensureDependency(dependencyService, true, step, runContext);
    }

    for (const dependencyService of optional) {
      await this.ensureDependency(dependencyService, false, step, runContext);
    }
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Throws when execution is aborted.
   *
   * @param {object} context - Execution context.
   */
  assertNotAborted(context) {
    if (context.signal?.aborted) {
      throw new VitalSignsAbortedError();
    }
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Throws when total run timeout has elapsed.
   *
   * @param {object} context - Execution context.
   */
  assertWithinTotalTimeout(context) {
    if (Date.now() > context.deadline) {
      throw new VitalSignsTimeoutError(context.options.totalTimeoutMs);
    }
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Executes a single action with timeout, retry/force handling, and guards.
   *
   * @param {VitalSign} sign - Service sign.
   * @param {string} actionName - Action to execute.
   * @param {object} step - Current plan step.
   * @param {object} runContext - Shared run context.
   * @returns {Promise<object>} Normalized terminal result.
   */
  async executeActionWithGuards(sign, actionName, step, runContext) {
    const action = sign.getAction(actionName);
    let stepAttempt = 0;

    if (!(action instanceof Function)) {
      throw new VitalSignsActionError(sign.name, actionName, `No action handler defined for ${sign.name}.${actionName}`);
    }

    while (true) {
      runContext.transitions += 1;

      if (runContext.transitions > runContext.options.maxTransitions) {
        throw new VitalSignsLoopGuardError(sign.name, actionName, runContext.options.maxTransitions);
      }

      stepAttempt += 1;

      this.assertNotAborted(runContext);
      this.assertWithinTotalTimeout(runContext);

      const now = Date.now();
      const remainingTotalMs = Math.max(runContext.deadline - now, 0);
      const actionTimeoutMs = Math.min(runContext.options.actionTimeoutMs, remainingTotalMs);

      let rawResult;

      try {
        rawResult = await withActionTimeout(
          action({
            sign,
            step,
            actionName,
            attempt: stepAttempt,
            startedAt: runContext.startedAt,
            deadline: runContext.deadline,
            remainingTotalMs,
            signal: runContext.signal,
            options: runContext.options,
            results: runContext.results
          }),
          actionTimeoutMs,
          sign.name,
          actionName
        );
      } catch (error) {
        if (error instanceof VitalSignsError || error instanceof TimeoutError) {
          throw error;
        }

        throw new VitalSignsActionError(
          sign.name,
          actionName,
          `Action ${sign.name}.${actionName} failed`,
          { step },
          error
        );
      }

      const result = normalizeStepResult(rawResult);

      if (!isLoopingState(result.state)) {
        return result;
      }

      if (result.state === 'force') {
        if (actionName === 'force') {
          throw new VitalSignsActionError(
            sign.name,
            actionName,
            `Action ${sign.name}.${actionName} requested force while already forcing`
          );
        }

        return this.executeActionWithGuards(sign, 'force', step, runContext);
      }

      await delay(result.delayMs ?? 0, runContext.signal);
    }
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Executes a plan and returns a full run summary.
   *
   * @param {string|Array<object>} planOrName - Plan name or step list.
   * @param {object} [options={}] - Run options.
   * @returns {Promise<object>} Run summary.
   */
  async run(planOrName, options = {}) {
    const steps = this.resolvePlan(planOrName);
    const runContext = this.createExecutionContext(options);

    for (const step of steps) {
      const sign = this.signMap.get(step.service);

      if (!sign) {
        throw new VitalSignsError(`Unknown service in plan: ${step.service}`, 'VITALSIGNS_UNKNOWN_SERVICE', {
          service: step.service,
          step
        });
      }

      await this.ensureDependenciesForStep(step, runContext);

      const actionName = step.action;
      const startedAt = Date.now();

      if (actionName === 'start') {
        this.setServiceState(step.service, SERVICE_STATES.STARTING, {
          action: actionName,
          message: `Starting ${step.service}`
        });
      }

      if (actionName === 'stop' || actionName === 'force') {
        this.setServiceState(step.service, SERVICE_STATES.STOPPING, {
          action: actionName,
          message: `Stopping ${step.service}`
        });
      }

      this.notify({
        type: 'step-started',
        step: {
          service: step.service,
          action: actionName,
          startedAt
        }
      });

      const result = await this.executeActionWithGuards(sign, actionName, step, runContext);
      const finishedAt = Date.now();

      const resolvedServiceState = this.resolveServiceStateFromResult(actionName, result);
      this.setServiceState(step.service, resolvedServiceState, {
        action: actionName,
        message: result.message
      });

      const stepResult = {
        service: step.service,
        action: actionName,
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        state: result.state,
        message: result.message,
        data: result.data,
        metadata: result.metadata
      };

      this.recordStepResult(runContext, stepResult);

      if (TERMINAL_STATES.has(result.state)) {
        if (result.state === 'hard-fail' && runContext.options.failFast !== false) {
          throw new VitalSignsActionError(
            step.service,
            actionName,
            result.message || `Hard failure for ${step.service}.${actionName}`,
            { result: stepResult }
          );
        }

        continue;
      }

      throw new VitalSignsActionError(
        step.service,
        actionName,
        `Unknown result state: ${result.state}`,
        { result: stepResult }
      );
    }

    return {
      success: runContext.results.every(result => result.state !== 'hard-fail'),
      startedAt: runContext.startedAt,
      finishedAt: Date.now(),
      durationMs: Date.now() - runContext.startedAt,
      transitions: runContext.transitions,
      results: runContext.results
    };
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Runs `check` against all registered services.
   *
   * @param {object} [options={}] - Run options.
   * @returns {Promise<object>} Run summary.
   */
  async check(options = {}) {
    const services = Array.from(this.signMap.keys());
    const steps = services.map(service => ({ service, action: 'check' }));
    return this.run(steps, options);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Runs `start` against all registered services.
   *
   * @param {object} [options={}] - Run options.
   * @returns {Promise<object>} Run summary.
   */
  async start(options = {}) {
    const services = Array.from(this.signMap.keys());
    const steps = services.map(service => ({ service, action: 'start' }));
    return this.run(steps, options);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Runs `stop` against all registered services.
   *
   * @param {object} [options={}] - Run options.
   * @returns {Promise<object>} Run summary.
   */
  async stop(options = {}) {
    const services = Array.from(this.signMap.keys());
    const steps = services.map(service => ({ service, action: 'stop' }));
    return this.run(steps, options);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Runs `force` against all registered services.
   *
   * @param {object} [options={}] - Run options.
   * @returns {Promise<object>} Run summary.
   */
  async force(options = {}) {
    const services = Array.from(this.signMap.keys());
    const steps = services.map(service => ({ service, action: 'force' }));
    return this.run(steps, options);
  }

  /* -------------------------------------------------------------------------- */
  /**
   * Runs an application manifest by ensuring dependencies then running the app step.
   *
   * @param {string} appName - Manifest/application name.
   * @param {object} [options={}] - Run options.
   * @returns {Promise<object>} Run summary.
   */
  async runManifest(appName, options = {}) {
    const manifest = this.getManifest(appName);

    if (!manifest) {
      throw new VitalSignsError(`Unknown manifest: ${appName}`, 'VITALSIGNS_UNKNOWN_MANIFEST', { appName });
    }

    const appAction = options.appAction ?? 'start';
    const includeApplication = options.includeApplication !== false;
    const steps = [];

    if (includeApplication) {
      steps.push({
        service: appName,
        action: appAction,
        manifestApp: appName
      });
    }

    if (!includeApplication) {
      for (const dependencyService of manifest.required) {
        steps.push({ service: dependencyService, action: 'start' });
      }

      for (const dependencyService of manifest.optional) {
        steps.push({ service: dependencyService, action: 'start' });
      }
    }

    return this.run(steps, options);
  }
}
