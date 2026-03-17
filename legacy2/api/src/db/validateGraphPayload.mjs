import { ValidationError } from '@rescor-llc/core-utils/errors';

function requireArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new ValidationError(`Graph field ${fieldName} must be an array`, 'ASR_GRAPH_INVALID_PAYLOAD', fieldName);
  }
}

export function validateGraphPayload(graph) {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    throw new ValidationError('Graph payload must be an object', 'ASR_GRAPH_INVALID_PAYLOAD', 'graph');
  }

  requireArray(graph.assets, 'assets');
  requireArray(graph.threats, 'threats');
  requireArray(graph.vulnerabilities, 'vulnerabilities');
  requireArray(graph.controls, 'controls');

  if (!graph.links || typeof graph.links !== 'object' || Array.isArray(graph.links)) {
    throw new ValidationError('Graph field links must be an object', 'ASR_GRAPH_INVALID_PAYLOAD', 'links');
  }

  requireArray(graph.links.assetThreat, 'links.assetThreat');
  requireArray(graph.links.assetVulnerability, 'links.assetVulnerability');
  requireArray(graph.links.threatVulnerability, 'links.threatVulnerability');
}
