import path from 'path';

function normalizeRelativePath(value = '') {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

export class DdlExecutor {
  constructor({ adapters = {} } = {}) {
    this.adapters = { ...adapters };
  }

  setAdapter(engine, adapter) {
    this.adapters[String(engine || '').toLowerCase()] = adapter;
    return this;
  }

  async executePlan(plan, options = {}) {
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.passes)) {
      throw new Error('A valid DDL plan with passes is required');
    }

    const dryRun = options.dryRun !== false;
    const continueOnError = Boolean(options.continueOnError);
    const rootDir = options.rootDir ? path.resolve(options.rootDir) : process.cwd();

    const result = {
      dryRun,
      rootDir,
      generatedAt: new Date().toISOString(),
      totalPasses: plan.passes.length,
      passesSucceeded: 0,
      passesFailed: 0,
      filesSucceeded: 0,
      filesFailed: 0,
      skippedFiles: 0,
      passResults: []
    };

    for (const pass of plan.passes) {
      const engine = String(pass.engine || '').toLowerCase();
      const adapter = this.adapters[engine];
      const passResult = {
        engine,
        stage: pass.stage,
        wave: pass.wave,
        description: pass.description,
        filesSucceeded: 0,
        filesFailed: 0,
        filesSkipped: 0,
        files: []
      };

      for (const file of pass.files || []) {
        const relativePath = normalizeRelativePath(file.path);
        const absolutePath = path.resolve(rootDir, relativePath);

        if (dryRun) {
          passResult.filesSkipped += 1;
          result.skippedFiles += 1;
          passResult.files.push({
            path: relativePath,
            absolutePath,
            status: 'planned'
          });
          continue;
        }

        if (!adapter) {
          passResult.filesSkipped += 1;
          result.skippedFiles += 1;
          passResult.files.push({
            path: relativePath,
            absolutePath,
            status: 'skipped',
            reason: `No adapter configured for engine ${engine}`
          });
          continue;
        }

        try {
          const fileResult = await adapter.executeFile(absolutePath, {
            pass,
            file,
            continueOnError
          });

          passResult.filesSucceeded += 1;
          result.filesSucceeded += 1;
          passResult.files.push({
            path: relativePath,
            absolutePath,
            status: 'applied',
            result: fileResult || null
          });
        } catch (error) {
          passResult.filesFailed += 1;
          result.filesFailed += 1;
          passResult.files.push({
            path: relativePath,
            absolutePath,
            status: 'failed',
            error: error.message
          });

          if (!continueOnError) {
            passResult.failed = true;
            result.passesFailed += 1;
            result.passResults.push(passResult);
            throw Object.assign(new Error(`DDL execution failed for ${relativePath}: ${error.message}`), {
              code: 'DDL_EXECUTION_FAILED',
              result
            });
          }
        }
      }

      if (passResult.filesFailed > 0) {
        passResult.failed = true;
        result.passesFailed += 1;
      } else {
        result.passesSucceeded += 1;
      }

      result.passResults.push(passResult);
    }

    result.success = result.filesFailed === 0;
    return result;
  }
}
