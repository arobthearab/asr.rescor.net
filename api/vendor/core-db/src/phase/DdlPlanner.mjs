const DEFAULT_STAGE_ORDER = Object.freeze(['backup', 'table', 'etl', 'keys', 'view']);

function normalizeRelativePath(value = '') {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function normalizeStage(stage) {
  const value = String(stage || '').toLowerCase();
  if (value === 'backup' || value === 'export' || value === 'archive') return 'backup';
  if (value === 'tables' || value === 'create') return 'table';
  if (value === 'load' || value === 'data') return 'etl';
  if (value === 'key' || value === 'constraints' || value === 'fk' || value === 'pk') return 'keys';
  if (value === 'views') return 'view';
  return value;
}

function defaultSort(left, right) {
  const leftSequence = left.sequence ?? Number.MAX_SAFE_INTEGER;
  const rightSequence = right.sequence ?? Number.MAX_SAFE_INTEGER;

  if (leftSequence !== rightSequence) {
    return leftSequence - rightSequence;
  }

  return left.relativePath.localeCompare(right.relativePath);
}

function stableUnique(items = []) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }

  return result;
}

export class DdlPlanner {
  constructor({ project = null, stageOrder = DEFAULT_STAGE_ORDER } = {}) {
    this.project = project ? String(project).toUpperCase() : null;
    const normalized = Array.isArray(stageOrder)
      ? stageOrder.map(normalizeStage).filter(Boolean)
      : [];

    this.stageOrder = normalized.length > 0 ? stableUnique(normalized) : [...DEFAULT_STAGE_ORDER];
  }

  static fromRegistry(registry) {
    const planning = registry?.getPlanningConfig?.() || {};
    return new DdlPlanner({
      project: registry?.project,
      stageOrder: planning.stageOrder || DEFAULT_STAGE_ORDER
    });
  }

  inferDependencies(entries = []) {
    const byKey = new Map();

    for (const entry of entries) {
      const key = `${entry.engine}:${entry.objectName}:${entry.stage}`;
      byKey.set(key, entry);
    }

    for (const entry of entries) {
      const inherited = [];

      if (entry.stage === 'etl') {
        const tableKey = `${entry.engine}:${entry.objectName}:table`;
        if (byKey.has(tableKey)) inherited.push(byKey.get(tableKey).relativePath);
      }

      if (entry.stage === 'keys') {
        const tableKey = `${entry.engine}:${entry.objectName}:table`;
        const etlKey = `${entry.engine}:${entry.objectName}:etl`;
        if (byKey.has(tableKey)) inherited.push(byKey.get(tableKey).relativePath);
        if (byKey.has(etlKey)) inherited.push(byKey.get(etlKey).relativePath);
      }

      if (entry.stage === 'view' && Number.isFinite(entry.wave) && entry.wave > 0) {
        for (const candidate of entries) {
          if (candidate.engine !== entry.engine || candidate.stage !== 'view') continue;
          if (!Number.isFinite(candidate.wave)) continue;
          if (candidate.wave < entry.wave) {
            inherited.push(candidate.relativePath);
          }
        }
      }

      const explicit = Array.isArray(entry.dependencies) ? entry.dependencies : [];
      entry.dependencies = stableUnique([...explicit, ...inherited].map(normalizeRelativePath).filter(Boolean));
    }

    return entries;
  }

  topologicalSort(entries = [], entryMap = new Map()) {
    const sorted = [...entries].sort(defaultSort);

    const inDegree = new Map();
    const adjacency = new Map();

    for (const entry of sorted) {
      inDegree.set(entry.relativePath, 0);
      adjacency.set(entry.relativePath, []);
    }

    for (const entry of sorted) {
      for (const dependency of entry.dependencies || []) {
        const dependencyPath = normalizeRelativePath(dependency);
        if (!inDegree.has(dependencyPath)) continue;

        inDegree.set(entry.relativePath, (inDegree.get(entry.relativePath) || 0) + 1);
        adjacency.get(dependencyPath).push(entry.relativePath);
      }
    }

    const queue = sorted
      .filter(entry => inDegree.get(entry.relativePath) === 0)
      .sort(defaultSort)
      .map(entry => entry.relativePath);

    const result = [];

    while (queue.length > 0) {
      const nextPath = queue.shift();
      const nextEntry = entryMap.get(nextPath);
      if (!nextEntry) continue;

      result.push(nextEntry);

      for (const dependentPath of adjacency.get(nextPath) || []) {
        const degree = (inDegree.get(dependentPath) || 0) - 1;
        inDegree.set(dependentPath, degree);

        if (degree === 0) {
          queue.push(dependentPath);
          queue.sort((leftPath, rightPath) => {
            const leftEntry = entryMap.get(leftPath);
            const rightEntry = entryMap.get(rightPath);
            return defaultSort(leftEntry, rightEntry);
          });
        }
      }
    }

    if (result.length !== sorted.length) {
      const unresolved = sorted.filter(entry => !result.find(item => item.relativePath === entry.relativePath));
      return [...result, ...unresolved.sort(defaultSort)];
    }

    return result;
  }

  buildPlan(entries = [], options = {}) {
    const requestedEngine = options.engine ? String(options.engine).toLowerCase() : null;
    const includeStages = Array.isArray(options.stages)
      ? options.stages.map(normalizeStage).filter(Boolean)
      : null;

    const filtered = entries
      .filter(entry => !requestedEngine || entry.engine === requestedEngine)
      .filter(entry => !includeStages || includeStages.includes(entry.stage));

    const byEngine = new Map();
    for (const entry of filtered) {
      if (!byEngine.has(entry.engine)) {
        byEngine.set(entry.engine, []);
      }
      byEngine.get(entry.engine).push({ ...entry, relativePath: normalizeRelativePath(entry.relativePath) });
    }

    const passes = [];

    for (const [engine, rawEntries] of byEngine.entries()) {
      const entriesWithDependencies = this.inferDependencies(rawEntries);
      const entryMap = new Map(entriesWithDependencies.map(entry => [entry.relativePath, entry]));

      for (const stage of this.stageOrder) {
        const stageEntries = entriesWithDependencies.filter(entry => entry.stage === stage);
        if (stageEntries.length === 0) continue;

        if (stage === 'view') {
          const waves = stableUnique(stageEntries.map(entry => entry.wave ?? 0)).sort((a, b) => a - b);

          for (const wave of waves) {
            const waveEntries = stageEntries.filter(entry => (entry.wave ?? 0) === wave);
            const ordered = this.topologicalSort(waveEntries, entryMap);

            passes.push({
              engine,
              stage,
              wave,
              description: wave > 0
                ? `Create ${engine.toUpperCase()} views (wave ${wave})`
                : `Create ${engine.toUpperCase()} views`,
              files: ordered.map(entry => ({
                path: entry.relativePath,
                sequence: entry.sequence,
                objectName: entry.objectName,
                dependencies: entry.dependencies || []
              }))
            });
          }

          continue;
        }

        const ordered = this.topologicalSort(stageEntries, entryMap);
        passes.push({
          engine,
          stage,
          wave: null,
          description: this.describePass(engine, stage),
          files: ordered.map(entry => ({
            path: entry.relativePath,
            sequence: entry.sequence,
            objectName: entry.objectName,
            dependencies: entry.dependencies || []
          }))
        });
      }
    }

    const totals = {
      passes: passes.length,
      files: passes.reduce((sum, pass) => sum + pass.files.length, 0),
      byEngine: {},
      byStage: {}
    };

    for (const pass of passes) {
      totals.byEngine[pass.engine] = (totals.byEngine[pass.engine] || 0) + pass.files.length;
      totals.byStage[pass.stage] = (totals.byStage[pass.stage] || 0) + pass.files.length;
    }

    return {
      project: this.project,
      stageOrder: [...this.stageOrder],
      generatedAt: new Date().toISOString(),
      totals,
      passes
    };
  }

  describePass(engine, stage) {
    const engineName = engine.toUpperCase();
    if (stage === 'backup') return `Run pre-change ${engineName} backup/export scripts`;
    if (stage === 'table') return `Create base ${engineName} tables (constraints deferred)`;
    if (stage === 'etl') return `Run ${engineName} ETL/data load scripts`;
    if (stage === 'keys') return `Apply ${engineName} primary/foreign key constraints`;
    if (stage === 'view') return `Create ${engineName} views`;
    return `Run ${engineName} ${stage} scripts`;
  }
}
