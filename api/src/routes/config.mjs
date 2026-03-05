// ════════════════════════════════════════════════════════════════════
// Config Route — serves questionnaire + scoring configuration
// ════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { loadScoringConfiguration } from '../scoring.mjs';

// ────────────────────────────────────────────────────────────────────
// createConfigRouter
// ────────────────────────────────────────────────────────────────────

export function createConfigRouter(database) {
  const router = Router();

  // ── Full questionnaire structure ───────────────────────────────
  router.get('/', async (_request, response) => {
    let answer = null;

    try {
      const scoringConfiguration = await loadScoringConfiguration(database);

      const classificationResult = await database.query(
        `MATCH (classification:ClassificationQuestion)-[:HAS_CHOICE]->(choice:ClassificationChoice)
         RETURN classification, choice
         ORDER BY choice.sortOrder`
      );

      const domainsResult = await database.query(
        `MATCH (domain:Domain)
         OPTIONAL MATCH (domain)<-[:BELONGS_TO]-(question:Question)
         RETURN domain, collect(question) AS questions
         ORDER BY domain.domainIndex`
      );

      const weightTiersResult = await database.query(
        `MATCH (tier:WeightTier) RETURN tier ORDER BY tier.value DESC`
      );

      // Fetch policy and CSF lookup tables for tooltip enrichment
      const policyResult = await database.query(
        `MATCH (policy:Policy) RETURN policy.reference AS reference, policy.title AS title`
      );
      const policyTitleMap = {};
      for (const record of policyResult) {
        policyTitleMap[record.reference] = record.title;
      }

      const csfResult = await database.query(
        `MATCH (csf:CsfSubcategory) RETURN csf.code AS code, csf.category AS category, csf.function AS function`
      );
      const csfTooltipMap = {};
      for (const record of csfResult) {
        csfTooltipMap[record.code] = `${record.function}: ${record.category}`;
      }

      answer = {
        scoringConfiguration,
        classification: buildClassificationResponse(classificationResult),
        domains: buildDomainsResponse(domainsResult, policyTitleMap, csfTooltipMap),
        weightTiers: weightTiersResult.map((record) => record.tier || record),
      };

      response.json(answer);
    } catch (error) {
      response.status(500).json({ error: error.message });
    }
  });

  // ── Scoring config only ────────────────────────────────────────
  router.get('/scoring', async (_request, response) => {
    try {
      const scoringConfiguration = await loadScoringConfiguration(database);
      response.json(scoringConfiguration);
    } catch (error) {
      response.status(500).json({ error: error.message });
    }
  });

  return router;
}

// ────────────────────────────────────────────────────────────────────
// buildClassificationResponse
// ────────────────────────────────────────────────────────────────────

function buildClassificationResponse(records) {
  let answer = { text: '', choices: [] };

  if (records.length > 0) {
    const firstRecord = records[0];
    const classification = firstRecord.classification || {};
    answer.text = classification.text || '';
    answer.naAllowed = classification.naAllowed ?? false;
    answer.choices = records.map((record) => {
      const choice = record.choice || {};
      return {
        text: choice.text,
        factor: choice.factor,
        sortOrder: choice.sortOrder,
      };
    });
  }

  return answer;
}

// ────────────────────────────────────────────────────────────────────
// buildDomainsResponse
// ────────────────────────────────────────────────────────────────────

function buildDomainsResponse(records, policyTitleMap, csfTooltipMap) {
  const answer = records.map((record) => {
    const domain = record.domain || {};
    const questions = (record.questions || [])
      .sort((first, second) => (first.questionIndex ?? 0) - (second.questionIndex ?? 0))
      .map((question) => ({
        domainIndex: question.domainIndex,
        questionIndex: question.questionIndex,
        text: question.text,
        weightTier: question.weightTier,
        choices: question.choices || [],
        choiceScores: question.choiceScores || [],
        naScore: question.naScore ?? 1,
      }));

    const policyRefs = domain.policyRefs || [];
    const csfRefs = domain.csfRefs || [];
    const ferpaNote = domain.ferpaNote || null;
    const soxNote = domain.soxNote || null;

    // Build enriched complianceRefs with tooltips
    const complianceRefs = [];

    // NIST CSF
    for (const code of csfRefs) {
      complianceRefs.push({
        tag: 'NIST',
        code,
        tooltip: csfTooltipMap[code] || null,
      });
    }

    // FERPA — extract §-section numbers
    if (ferpaNote) {
      const sectionMatches = ferpaNote.match(/§[\d.]+/g);
      if (sectionMatches) {
        for (const section of sectionMatches) {
          complianceRefs.push({ tag: 'FERPA', code: section, tooltip: ferpaNote });
        }
      }
    }

    // SOX — extract §-section numbers
    if (soxNote) {
      const sectionMatches = soxNote.match(/§[\d.]+/g);
      if (sectionMatches) {
        for (const section of sectionMatches) {
          complianceRefs.push({ tag: 'SOX', code: section, tooltip: soxNote });
        }
      }
    }

    // Stride policies (ISP / IISP)
    for (const code of policyRefs) {
      const tag = code.startsWith('IISP') ? 'IISP' : 'ISP';
      complianceRefs.push({
        tag,
        code,
        tooltip: policyTitleMap[code] || null,
      });
    }

    return {
      domainIndex: domain.domainIndex,
      name: domain.name,
      policyRefs,
      csfRefs,
      ferpaNote,
      soxNote,
      complianceRefs,
      questions,
    };
  });

  return answer;
}
