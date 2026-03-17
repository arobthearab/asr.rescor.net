import { ValidationError } from '@rescor-llc/core-utils/errors';

export const ASR_GRAPH_STORAGE_KEY = 'asr.linkedRiskGraph.v1';

function cloneGraph(graph) {
  return JSON.parse(JSON.stringify(graph));
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new ValidationError(
      `Graph field ${fieldName} must be an array`,
      'ASR_GRAPH_INVALID_SHAPE',
      fieldName
    );
  }
}

export function validateGraphStructure(graph) {
  if (!isObject(graph)) {
    throw new ValidationError(
      'Graph payload must be an object',
      'ASR_GRAPH_INVALID_PAYLOAD',
      'graph'
    );
  }

  requireArray(graph.assets, 'assets');
  requireArray(graph.threats, 'threats');
  requireArray(graph.vulnerabilities, 'vulnerabilities');
  requireArray(graph.controls, 'controls');

  if (!isObject(graph.links)) {
    throw new ValidationError(
      'Graph field links must be an object',
      'ASR_GRAPH_INVALID_SHAPE',
      'links'
    );
  }

  requireArray(graph.links.assetThreat, 'links.assetThreat');
  requireArray(graph.links.assetVulnerability, 'links.assetVulnerability');
  requireArray(graph.links.threatVulnerability, 'links.threatVulnerability');
}

export function parseGraphJson(rawJsonText) {
  let parsed;

  try {
    parsed = JSON.parse(rawJsonText);
  } catch {
    throw new ValidationError(
      'Imported graph is not valid JSON',
      'ASR_GRAPH_INVALID_JSON',
      'graphImport'
    );
  }

  validateGraphStructure(parsed);
  return parsed;
}

export function serializeGraph(graph) {
  validateGraphStructure(graph);
  return JSON.stringify(graph, null, 2);
}

export function loadGraphFromStorage(defaultGraph, storage) {
  if (!storage) {
    return {
      graph: cloneGraph(defaultGraph),
      warning: ''
    };
  }

  const raw = storage.getItem(ASR_GRAPH_STORAGE_KEY);

  if (!raw) {
    return {
      graph: cloneGraph(defaultGraph),
      warning: ''
    };
  }

  try {
    const parsed = parseGraphJson(raw);

    return {
      graph: parsed,
      warning: ''
    };
  } catch {
    return {
      graph: cloneGraph(defaultGraph),
      warning: 'Stored graph was invalid and has been reset to defaults.'
    };
  }
}

export function saveGraphToStorage(graph, storage) {
  if (!storage) {
    return;
  }

  const serialized = serializeGraph(graph);
  storage.setItem(ASR_GRAPH_STORAGE_KEY, serialized);
}

export function cloneDefaultGraph(defaultGraph) {
  return cloneGraph(defaultGraph);
}
