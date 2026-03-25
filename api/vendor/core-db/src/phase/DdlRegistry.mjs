import { readdir, readFile, stat } from 'fs/promises';
import path from 'path';

const STAGE_ALIASES = Object.freeze({
  backup: 'backup',
  export: 'backup',
  archive: 'backup',
  table: 'table',
  tables: 'table',
  create: 'table',
  ddl: 'table',
  etl: 'etl',
  load: 'etl',
  populate: 'etl',
  data: 'etl',
  key: 'keys',
  keys: 'keys',
  fk: 'keys',
  pk: 'keys',
  constraints: 'keys',
  alter: 'keys',
  view: 'view',
  views: 'view'
});

const ENGINE_EXTENSIONS = Object.freeze({
  db2: ['.sql'],
  neo4j: ['.cypher', '.cql', '.neo4j']
});

const DEFAULT_STAGE_ORDER = Object.freeze(['backup', 'table', 'etl', 'keys', 'view']);

function toStage(token) {
  return STAGE_ALIASES[String(token || '').toLowerCase()] || null;
}

function parseWave(tokens = []) {
  for (const token of tokens) {
    const value = String(token || '').toLowerCase();
    const match = value.match(/^(?:w|wave|v)(\d+)$/);
    if (match) {
      return Number(match[1]);
    }
  }
  return null;
}

function inferStage(tokens = []) {
  for (const token of tokens) {
    const stage = toStage(token);
    if (stage) return stage;
  }
  return 'table';
}

function parseSequence(baseName) {
  const match = String(baseName || '').match(/^(\d{1,6})[-_]/);
  return match ? Number(match[1]) : null;
}

function normalizeRelativePath(value = '') {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function parseEntry(filePath, engine, options = {}) {
  const { relativePath = null, override = {} } = options;
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const sequence = parseSequence(base);
  const normalizedBase = base.replace(/^\d{1,6}[-_]/, '');
  const tokens = normalizedBase.split(/[-_\.]+/).filter(Boolean);
  const inferredStage = inferStage(tokens);
  const stage = toStage(override.stage) || inferredStage;
  const inferredWave = stage === 'view' ? parseWave(tokens) : null;
  const wave = Number.isFinite(Number(override.wave)) ? Number(override.wave) : inferredWave;

  let objectName = 'unknown';
  const stageIndex = tokens.findIndex(token => toStage(token) === stage);
  if (stageIndex >= 0) {
    if (stageIndex + 1 < tokens.length) {
      objectName = tokens[stageIndex + 1].toUpperCase();
    } else if (stageIndex > 0) {
      objectName = tokens[stageIndex - 1].toUpperCase();
    }
  } else if (tokens.length > 0) {
    objectName = tokens[tokens.length - 1].toUpperCase();
  }

  if (override.objectName) {
    objectName = String(override.objectName).toUpperCase();
  }

  const dependencies = Array.isArray(override.dependsOn)
    ? override.dependsOn.map(item => normalizeRelativePath(item)).filter(Boolean)
    : [];

  return {
    engine,
    filePath,
    relativePath: normalizeRelativePath(relativePath || path.basename(filePath)),
    fileName: path.basename(filePath),
    sequence,
    stage,
    objectName,
    wave,
    dependencies
  };
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(baseDir) {
  const entries = await readdir(baseDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const resolved = path.join(baseDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkFiles(resolved));
    } else if (entry.isFile()) {
      files.push(resolved);
    }
  }

  return files;
}

export class DdlRegistry {
  constructor({ project, rootDir = null, manifestPath = null, phase = null } = {}) {
    this.project = String(project || '').toUpperCase();
    this.rootDir = rootDir;
    this.manifestPath = manifestPath;
    this.phase = this.normalizePhase(phase);
    this.manifest = null;
    this.lastConflicts = [];
  }

  normalizePhase(value = null) {
    if (value == null) return null;
    const normalized = String(value).trim().toLowerCase();
    if (['dev', 'develop', 'development', 'local'].includes(normalized)) return 'development';
    if (['uat', 'test', 'testing', 'stage', 'staging'].includes(normalized)) return 'uat';
    if (['prod', 'production', 'live'].includes(normalized)) return 'production';
    return normalized;
  }

  async load() {
    const manifestPath = this.manifestPath || path.resolve(this.rootDir || process.cwd(), 'ddl.manifest.json');
    if (await exists(manifestPath)) {
      const content = await readFile(manifestPath, 'utf-8');
      this.manifest = JSON.parse(content);

      if (!this.rootDir && this.manifest.rootDir) {
        this.rootDir = path.resolve(path.dirname(manifestPath), this.manifest.rootDir);
      }

      this.manifest.project = this.manifest.project || this.project;
      this.manifest.engines = this.manifest.engines || {
        db2: { baseDir: 'db2' },
        neo4j: { baseDir: 'neo4j' }
      };
      this.manifest.planning = this.manifest.planning || {};
      this.manifest.planning.stageOrder = Array.isArray(this.manifest.planning.stageOrder)
        ? this.manifest.planning.stageOrder.map(token => toStage(token)).filter(Boolean)
        : [...DEFAULT_STAGE_ORDER];

      this.manifest.files = this.manifest.files || {};

      this.manifestPath = manifestPath;
      return this;
    }

    if (!this.rootDir) {
      throw new Error('DDL rootDir not configured and no ddl.manifest.json found');
    }

    this.manifest = {
      project: this.project,
      rootDir: this.rootDir,
      engines: {
        db2: { baseDir: 'db2' },
        neo4j: { baseDir: 'neo4j' }
      },
      planning: {
        stageOrder: [...DEFAULT_STAGE_ORDER]
      }
    };

    return this;
  }

  resolveEngineDir(engine) {
    const key = String(engine || '').toLowerCase();
    const engineConfig = this.manifest?.engines?.[key];
    const baseDir = engineConfig?.baseDir || key;
    if (path.isAbsolute(baseDir)) {
      return baseDir;
    }
    return path.resolve(this.rootDir, baseDir);
  }

  phaseSuffixForCurrentPhase() {
    if (this.phase === 'development') return 'DEV';
    if (this.phase === 'uat') return 'UAT';
    if (this.phase === 'production') return '';
    return '';
  }

  inferPhaseDirectoryForEngine(engine) {
    const baseDir = this.resolveEngineDir(engine);
    const suffix = this.phaseSuffixForCurrentPhase();
    if (!suffix) return null;

    const parent = path.dirname(baseDir);
    const baseName = path.basename(baseDir);
    const candidateName = `${baseName}${suffix}`;
    const candidate = path.join(parent, candidateName);
    if (path.resolve(candidate) === path.resolve(baseDir)) {
      return null;
    }
    return candidate;
  }

  resolveManifestPhaseDir(engine) {
    const phase = this.phase;
    if (!phase) return null;

    const phaseDirs = this.manifest?.phaseDirectories;
    if (!phaseDirs || typeof phaseDirs !== 'object') {
      return null;
    }

    const phaseConfig = phaseDirs[phase];
    if (!phaseConfig || typeof phaseConfig !== 'object') {
      return null;
    }

    const candidate = phaseConfig[engine] || phaseConfig.baseDir || null;
    if (!candidate) return null;
    if (path.isAbsolute(candidate)) return candidate;
    return path.resolve(this.rootDir, candidate);
  }

  async resolveEngineSearchDirs(engine) {
    const baseDir = this.resolveEngineDir(engine);
    const result = [];

    const addDir = async (directory, layer) => {
      if (!directory) return;
      const resolved = path.resolve(directory);
      if (result.find(item => path.resolve(item.dir) === resolved)) {
        return;
      }
      if (!await exists(resolved)) return;
      result.push({ dir: resolved, layer });
    };

    const manifestPhaseDir = this.resolveManifestPhaseDir(engine);
    const inferredPhaseDir = this.inferPhaseDirectoryForEngine(engine);

    if (this.phase && this.phase !== 'production') {
      await addDir(manifestPhaseDir, 'phase');
      await addDir(inferredPhaseDir, 'phase');
    }

    await addDir(baseDir, 'base');
    return result;
  }

  getConflicts() {
    return [...this.lastConflicts];
  }

  getPlanningConfig() {
    if (!this.manifest) {
      return {
        stageOrder: [...DEFAULT_STAGE_ORDER]
      };
    }

    return {
      stageOrder: Array.isArray(this.manifest.planning?.stageOrder) && this.manifest.planning.stageOrder.length > 0
        ? [...this.manifest.planning.stageOrder]
        : [...DEFAULT_STAGE_ORDER]
    };
  }

  getManifestFileOverrides() {
    const entries = this.manifest?.files || {};
    if (!entries || typeof entries !== 'object') {
      return new Map();
    }

    const result = new Map();
    for (const [relativePath, value] of Object.entries(entries)) {
      result.set(normalizeRelativePath(relativePath), value || {});
    }
    return result;
  }

  resolveExtensionsForEngine(engineName) {
    const manifestExtensions = this.manifest?.engines?.[engineName]?.extensions;
    if (Array.isArray(manifestExtensions) && manifestExtensions.length > 0) {
      return manifestExtensions.map(item => String(item || '').toLowerCase()).filter(Boolean);
    }

    return ENGINE_EXTENSIONS[engineName] || [];
  }

  async listEntries({ engine = null } = {}) {
    if (!this.manifest) {
      await this.load();
    }

    const engines = engine
      ? [String(engine).toLowerCase()]
      : Object.keys(this.manifest.engines || { db2: {}, neo4j: {} });

    const fileOverrides = this.getManifestFileOverrides();

    const selectedByKey = new Map();
    const conflicts = [];

    for (const name of engines) {
      const engineConfig = this.manifest.engines?.[name] || {};
      if (engineConfig.enabled === false) {
        continue;
      }

      const searchDirs = await this.resolveEngineSearchDirs(name);
      if (searchDirs.length === 0) {
        continue;
      }

      const validExtensions = this.resolveExtensionsForEngine(name);

      for (let priority = 0; priority < searchDirs.length; priority += 1) {
        const source = searchDirs[priority];
        const files = await walkFiles(source.dir);

        for (const filePath of files) {
          if (validExtensions.length > 0 && !validExtensions.includes(path.extname(filePath).toLowerCase())) {
            continue;
          }

          const relativePath = normalizeRelativePath(path.relative(source.dir, filePath));
          const override = fileOverrides.get(relativePath) || {};

          const entry = parseEntry(filePath, name, {
            relativePath,
            override
          });

          entry.sourceLayer = source.layer;
          entry.sourceDir = normalizeRelativePath(path.relative(this.rootDir, source.dir));
          entry.sourcePriority = priority;

          const key = `${entry.engine}:${entry.relativePath}`;
          const existing = selectedByKey.get(key);
          if (!existing) {
            selectedByKey.set(key, entry);
            continue;
          }

          conflicts.push({
            engine: entry.engine,
            relativePath: entry.relativePath,
            selected: {
              filePath: existing.filePath,
              sourceLayer: existing.sourceLayer,
              sourceDir: existing.sourceDir
            },
            shadowed: {
              filePath: entry.filePath,
              sourceLayer: entry.sourceLayer,
              sourceDir: entry.sourceDir
            }
          });

          if ((entry.sourcePriority ?? Number.MAX_SAFE_INTEGER) < (existing.sourcePriority ?? Number.MAX_SAFE_INTEGER)) {
            selectedByKey.set(key, entry);
          }
        }
      }
    }

    const entries = [...selectedByKey.values()];
    this.lastConflicts = conflicts;

    entries.sort((left, right) => {
      const seqLeft = left.sequence ?? Number.MAX_SAFE_INTEGER;
      const seqRight = right.sequence ?? Number.MAX_SAFE_INTEGER;
      if (seqLeft !== seqRight) return seqLeft - seqRight;
      return left.fileName.localeCompare(right.fileName);
    });

    return entries;
  }

  summarize(entries = []) {
    const summary = {
      project: this.project,
      rootDir: this.rootDir,
      manifestPath: this.manifestPath,
      planning: this.getPlanningConfig(),
      totalFiles: entries.length,
      byEngine: {},
      byStage: {},
      tableComponents: {
        withCreate: 0,
        withEtl: 0,
        withKeys: 0,
        complete: 0,
        incomplete: 0
      },
      viewWaves: {},
      conflicts: this.getConflicts().length,
      sourceLayers: {
        phase: 0,
        base: 0
      }
    };

    const componentsByTable = new Map();

    for (const entry of entries) {
      summary.byEngine[entry.engine] = (summary.byEngine[entry.engine] || 0) + 1;
      summary.byStage[entry.stage] = (summary.byStage[entry.stage] || 0) + 1;

      if (entry.sourceLayer === 'phase') summary.sourceLayers.phase += 1;
      if (entry.sourceLayer === 'base') summary.sourceLayers.base += 1;

      if (entry.stage === 'view') {
        const wave = entry.wave ?? 0;
        summary.viewWaves[wave] = (summary.viewWaves[wave] || 0) + 1;
      }

      if (entry.stage === 'table' || entry.stage === 'etl' || entry.stage === 'keys') {
        const key = `${entry.engine}:${entry.objectName}`;
        if (!componentsByTable.has(key)) {
          componentsByTable.set(key, new Set());
        }
        componentsByTable.get(key).add(entry.stage);
      }
    }

    for (const parts of componentsByTable.values()) {
      if (parts.has('table')) summary.tableComponents.withCreate += 1;
      if (parts.has('etl')) summary.tableComponents.withEtl += 1;
      if (parts.has('keys')) summary.tableComponents.withKeys += 1;

      if (parts.has('table') && parts.has('etl') && parts.has('keys')) {
        summary.tableComponents.complete += 1;
      } else {
        summary.tableComponents.incomplete += 1;
      }
    }

    return summary;
  }
}
