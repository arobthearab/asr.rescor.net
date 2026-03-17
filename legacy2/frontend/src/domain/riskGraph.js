import { ValidationError } from '@rescor-llc/core-utils/errors';
import { computeControlEffective } from './stormRsk.js';
import { computeLossExpectancies } from './lossExpectancy.js';

function makeKey(left, right) {
  return `${left}::${right}`;
}

function buildLookup(items, kind) {
  const map = new Map();
  for (const item of items || []) {
    if (!item?.id) {
      throw new ValidationError(`${kind} requires id`, 'ASR_GRAPH_INVALID', kind);
    }
    map.set(item.id, item);
  }
  return map;
}

function selectControlsForRow(controls, row) {
  return (controls || []).filter((control) => {
    const byAsset = Array.isArray(control.appliesToAssetIds)
      ? control.appliesToAssetIds.includes(row.assetId)
      : false;

    const byThreat = Array.isArray(control.appliesToThreatIds)
      ? control.appliesToThreatIds.includes(row.threatId)
      : false;

    const byVulnerability = Array.isArray(control.appliesToVulnerabilityIds)
      ? control.appliesToVulnerabilityIds.includes(row.vulnerabilityId)
      : false;

    const byPair = Array.isArray(control.appliesToPairs)
      ? control.appliesToPairs.some((pair) => pair.threatId === row.threatId && pair.vulnerabilityId === row.vulnerabilityId)
      : false;

    return byAsset || byThreat || byVulnerability || byPair;
  });
}

export function generateLinkedRiskRows(graph) {
  const assets = buildLookup(graph.assets, 'asset');
  const threats = buildLookup(graph.threats, 'threat');
  const vulnerabilities = buildLookup(graph.vulnerabilities, 'vulnerability');

  const assetThreat = new Set(
    (graph.links?.assetThreat || []).map((link) => makeKey(link.assetId, link.threatId))
  );
  const assetVulnerability = new Set(
    (graph.links?.assetVulnerability || []).map((link) => makeKey(link.assetId, link.vulnerabilityId))
  );
  const threatVulnerability = new Set(
    (graph.links?.threatVulnerability || []).map((link) => makeKey(link.threatId, link.vulnerabilityId))
  );

  const rows = [];

  for (const asset of assets.values()) {
    for (const threat of threats.values()) {
      if (!assetThreat.has(makeKey(asset.id, threat.id))) {
        continue;
      }

      for (const vulnerability of vulnerabilities.values()) {
        if (!assetVulnerability.has(makeKey(asset.id, vulnerability.id))) {
          continue;
        }

        if (!threatVulnerability.has(makeKey(threat.id, vulnerability.id))) {
          continue;
        }

        const rowContext = {
          assetId: asset.id,
          threatId: threat.id,
          vulnerabilityId: vulnerability.id
        };

        const matchingControls = selectControlsForRow(graph.controls, rowContext);
        const controlEffectives = matchingControls.map((control) =>
          computeControlEffective({
            implemented: control.implemented,
            correction: control.correction
          })
        );

        const loss = computeLossExpectancies({
          assetValue: asset.assetShare,
          threatProbability: threat.probability,
          vulnerabilitySeverity: vulnerability.severity,
          controlEfficacy: 0,
          controlEffectives
        });

        rows.push({
          assetId: asset.id,
          assetName: asset.name,
          threatId: threat.id,
          threatName: threat.name,
          vulnerabilityId: vulnerability.id,
          vulnerabilityName: vulnerability.name,
          A: loss.A,
          T: loss.T,
          V: loss.V,
          C: loss.C,
          SLE: loss.SLE,
          DLE: loss.DLE,
          controls: matchingControls.map((control) => control.name)
        });
      }
    }
  }

  rows.sort((left, right) => right.DLE - left.DLE);
  return rows;
}
