// ════════════════════════════════════════════════════════════════════
// Document Export Routes — DOCX questionnaire, XLSX workbook, review report
// ════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, PageOrientation,
  ShadingType, BorderStyle, Header, Footer, PageNumber,
  TableOfContents, PageBreak,
} from 'docx';
import ExcelJS from 'exceljs';
import { loadScoringConfiguration } from '../scoring.mjs';
import { authorize } from '../middleware/authorize.mjs';

// ── Brand Constants ──────────────────────────────────────────────────
const RESCOR_GREEN = '2E7D32';
const RESCOR_BLUE = '1565C0';
const RESCOR_GRAY = '757575';
const GAP_RED = 'C62828';
const WHITE = 'FFFFFF';
const BLACK = '000000';
const HEAD_GRAY = 'E0E0E0';
const CRIT_BG = 'FFEBEE';
const HIGH_BG = 'FFF3E0';
const MED_BG = 'E8F5E9';
const INFO_BG = 'F5F5F5';

const WEIGHT_FILLS = { Critical: CRIT_BG, High: HIGH_BG, Medium: MED_BG, Info: INFO_BG };

const DOMAIN_FILLS = ['E3F2FD', 'E8F5E9', 'FFF3E0', 'F3E5F5', 'E0F7FA', 'FBE9E7', 'F1F8E9'];

const RATING_FILLS = { Low: 'E8F5E9', Moderate: 'FFF3E0', Elevated: 'FFE0B2', Critical: 'FFCDD2' };
const RATING_FONT_COLORS = { Low: RESCOR_GREEN, Moderate: BLACK, Elevated: 'E65100', Critical: GAP_RED };

// ── Table border helpers ────────────────────────────────────────────
const THIN_BORDER = { style: BorderStyle.SINGLE, size: 1, color: 'BDBDBD' };
const NO_BORDER = { style: BorderStyle.NONE, size: 0 };

function allBorders(border = THIN_BORDER) {
  return { top: border, bottom: border, left: border, right: border };
}

// ════════════════════════════════════════════════════════════════════
// createExportRouter
// ════════════════════════════════════════════════════════════════════

export function createExportRouter(database, stormService, recorder = null) {
  const router = Router();

  // ────────────────────────────────────────────────────────────────
  // 4a. GET /api/export/questionnaire.docx
  // ────────────────────────────────────────────────────────────────
  router.get(
    '/export/questionnaire.docx',
    authorize('admin', 'reviewer', 'user', 'auditor'),
    async (_request, response) => {
      try {
        const config = await loadFullConfig(database);
        const document = buildQuestionnaireDocx(config);
        const buffer = await Packer.toBuffer(document);

        response.set({
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': 'attachment; filename="ASR_Questionnaire.docx"',
          'Content-Length': buffer.length,
        });
        response.send(buffer);
      } catch (error) {
        recorder?.emit(9210, 'e', 'Failed to export questionnaire DOCX', { error: error.message });
        response.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  // ────────────────────────────────────────────────────────────────
  // 4b. GET /api/export/questionnaire.xlsx
  // ────────────────────────────────────────────────────────────────
  router.get(
    '/export/questionnaire.xlsx',
    authorize('admin', 'reviewer', 'user', 'auditor'),
    async (_request, response) => {
      try {
        const config = await loadFullConfig(database);
        const workbook = buildQuestionnaireXlsx(config);
        const buffer = await workbook.xlsx.writeBuffer();

        response.set({
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="ASR_Questionnaire.xlsx"',
          'Content-Length': buffer.length,
        });
        response.send(Buffer.from(buffer));
      } catch (error) {
        recorder?.emit(9211, 'e', 'Failed to export questionnaire XLSX', { error: error.message });
        response.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  // ────────────────────────────────────────────────────────────────
  // 4c. GET /api/reviews/:reviewId/export/report.docx
  // ────────────────────────────────────────────────────────────────
  router.get(
    '/reviews/:reviewId/export/report.docx',
    authorize('admin', 'reviewer', 'user', 'auditor'),
    async (request, response) => {
      try {
        const { reviewId } = request.params;
        const reviewData = await loadReviewExportData(database, reviewId);
        if (reviewData == null) {
          response.status(404).json({ error: 'Review not found' });
          return;
        }
        const config = await loadFullConfig(database);
        const document = await buildReviewReportDocx(reviewData, config, stormService);
        const buffer = await Packer.toBuffer(document);

        const safeName = (reviewData.review.applicationName || 'Review')
          .replace(/[^a-zA-Z0-9_-]/g, '_');
        response.set({
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="ASR_Report_${safeName}.docx"`,
          'Content-Length': buffer.length,
        });
        response.send(buffer);
      } catch (error) {
        recorder?.emit(9212, 'e', 'Failed to export review report DOCX', { error: error.message });
        response.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  return router;
}


// ════════════════════════════════════════════════════════════════════
// Data Loading Helpers
// ════════════════════════════════════════════════════════════════════

async function loadFullConfig(database) {
  const scoringConfiguration = await loadScoringConfiguration(database);

  const classificationResult = await database.query(
    `MATCH (classification:ClassificationQuestion)-[:HAS_CHOICE]->(choice:ClassificationChoice)
     RETURN classification, choice
     ORDER BY choice.sortOrder`,
  );

  const domainsResult = await database.query(
    `MATCH (domain:Domain)
     WHERE domain.active = true
     OPTIONAL MATCH (domain)<-[:BELONGS_TO]-(question:Question)
     WHERE question.active = true
     RETURN domain, collect(question) AS questions
     ORDER BY domain.domainIndex`,
  );

  const weightTiersResult = await database.query(
    `MATCH (tier:WeightTier) RETURN tier ORDER BY tier.value DESC`,
  );

  const classification = buildClassificationConfig(classificationResult);
  const domains = buildDomainsConfig(domainsResult);
  const weightTiers = weightTiersResult.map((record) => record.tier || record);

  return { scoringConfiguration, classification, domains, weightTiers };
}

function buildClassificationConfig(records) {
  let answer = { text: '', choices: [] };
  if (records.length > 0) {
    const question = records[0].classification || {};
    answer.text = question.text || '';
    answer.choices = records.map((record) => {
      const choice = record.choice || {};
      return { text: choice.text, factor: choice.factor, sortOrder: choice.sortOrder };
    });
  }
  return answer;
}

function buildDomainsConfig(records) {
  return records.map((record) => {
    const domain = record.domain || {};
    const questions = (record.questions || [])
      .sort((first, second) => (first.questionIndex ?? 0) - (second.questionIndex ?? 0))
      .map((question) => ({
        questionId: question.questionId || null,
        domainIndex: question.domainIndex,
        questionIndex: question.questionIndex,
        text: question.text,
        weightTier: question.weightTier,
        choices: question.choices || [],
        choiceScores: question.choiceScores || [],
        naScore: question.naScore ?? 1,
        responsibleFunction: question.responsibleFunction || null,
      }));
    return {
      domainIndex: domain.domainIndex,
      name: domain.name,
      policyRefs: domain.policyRefs || [],
      csfRefs: domain.csfRefs || [],
      questions,
    };
  });
}

async function loadReviewExportData(database, reviewId) {
  const reviewResult = await database.query(
    `MATCH (review:Review {reviewId: $reviewId})
     OPTIONAL MATCH (review)-[:CONTAINS]->(answer:Answer)
     OPTIONAL MATCH (answer)-[:ANSWERS]->(question:Question)
     RETURN review, collect({answer: answer, question: question}) AS answers`,
    { reviewId },
  );

  if (reviewResult.length === 0) {
    return null;
  }

  const row = reviewResult[0];
  const review = row.review || row;
  const answers = (row.answers || []).filter((item) => item.answer != null);

  // Remediation items
  const remediationRows = await database.query(
    `MATCH (review:Review {reviewId: $reviewId})-[:CONTAINS]->(answer:Answer)
     WHERE answer.measurement > 25
     OPTIONAL MATCH (answer)-[:HAS_REMEDIATION]->(ri:RemediationItem)
     RETURN answer.domainIndex      AS domainIndex,
            answer.questionIndex    AS questionIndex,
            answer.questionText     AS questionText,
            answer.choiceText       AS choiceText,
            answer.measurement      AS measurement,
            ri.remediationId        AS remediationId,
            ri.proposedAction       AS proposedAction,
            ri.assignedFunction     AS assignedFunction,
            ri.status               AS status,
            ri.responseType         AS responseType,
            ri.mitigationPercent    AS mitigationPercent,
            ri.targetDate           AS targetDate,
            ri.notes                AS notes
     ORDER BY answer.measurement DESC, answer.domainIndex, answer.questionIndex`,
    { reviewId },
  );

  const remediationMap = new Map();
  for (const remRow of remediationRows) {
    const key = `${remRow.domainIndex}:${remRow.questionIndex}`;
    if (!remediationMap.has(key)) {
      remediationMap.set(key, {
        domainIndex: remRow.domainIndex,
        questionIndex: remRow.questionIndex,
        questionText: remRow.questionText || '',
        choiceText: remRow.choiceText || '',
        measurement: remRow.measurement,
        remediations: [],
      });
    }
    if (remRow.remediationId) {
      remediationMap.get(key).remediations.push({
        proposedAction: remRow.proposedAction || '',
        assignedFunction: remRow.assignedFunction || '',
        status: remRow.status || 'OPEN',
        responseType: remRow.responseType || 'CUSTOM',
        mitigationPercent: remRow.mitigationPercent ?? 0,
        targetDate: remRow.targetDate || '',
        notes: remRow.notes || '',
      });
    }
  }

  // Gate answers
  const gateRows = await database.query(
    `MATCH (gate:GateQuestion)
     OPTIONAL MATCH (ga:GateAnswer {reviewId: $reviewId, gateId: gate.gateId})
     RETURN gate.gateId       AS gateId,
            gate.function     AS function,
            gate.text         AS text,
            gate.choices      AS choices,
            ga.choiceIndex    AS choiceIndex,
            ga.respondedBy    AS respondedBy,
            ga.respondedAt    AS respondedAt,
            ga.evidenceNotes  AS evidenceNotes
     ORDER BY gate.sortOrder`,
    { reviewId },
  );

  return {
    review,
    answers,
    remediations: Array.from(remediationMap.values()),
    gates: gateRows,
  };
}


// ════════════════════════════════════════════════════════════════════
// 4a. DOCX Questionnaire Builder (decomposed)
// ════════════════════════════════════════════════════════════════════

function buildDocxTitleSection(scoringConfiguration) {
  const children = [
    new Paragraph({
      children: [new TextRun({ text: 'Application Security Review', bold: true, size: 48, color: RESCOR_GREEN })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Questionnaire', bold: true, size: 36, color: RESCOR_BLUE })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: `Version: ${scoringConfiguration.questionnaireLabel || 'Current'}`,
        italics: true, size: 20, color: RESCOR_GRAY,
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
  ];
  return children;
}

function buildDocxWeightTierTable(weightTiers) {
  const children = [
    heading('Weight Tiers', HeadingLevel.HEADING_2),
  ];
  const tierRows = [
    headerRow(['Tier', 'Value', 'Priority', 'Escalation']),
    ...weightTiers.map((tier) => {
      const name = tier.name || tier.tierName;
      const value = tier.value;
      return new TableRow({
        children: [
          shadedCell(name, WEIGHT_FILLS[name] || INFO_BG),
          textCell(String(value)),
          textCell(tierPriority(name)),
          textCell(tierEscalation(name)),
        ],
      });
    }),
  ];
  children.push(simpleTable(tierRows));
  return children;
}

function buildDocxRatingScaleSection() {
  const children = [
    heading('Risk Rating Scale', HeadingLevel.HEADING_2),
  ];
  const ratingRows = [
    headerRow(['Range', 'Rating', 'Description']),
    ratingRow('0–25%', 'Low', 'Strong posture — controls mature and effective'),
    ratingRow('26–50%', 'Moderate', 'Adequate — minor gaps with compensating controls'),
    ratingRow('51–75%', 'Elevated', 'Material gaps requiring remediation plans'),
    ratingRow('76–100%', 'Critical', 'Fundamental controls missing or ineffective'),
  ];
  children.push(simpleTable(ratingRows));
  return children;
}

function buildDocxApplicationInfoSection() {
  const children = [
    new Paragraph({ children: [new PageBreak()] }),
    heading('Application Information', HeadingLevel.HEADING_1),
  ];
  const infoFields = [
    'Application Name', 'Business Owner', 'Technical Owner', 'CMDB ID',
    'Risk Classification', 'Assessment Date', 'Assessor',
  ];
  const infoRows = [
    headerRow(['Field', 'Value']),
    ...infoFields.map((field) => new TableRow({
      children: [boldCell(field), textCell('')],
    })),
  ];
  children.push(simpleTable(infoRows));
  return children;
}

function buildDocxClassificationSection(classification) {
  const children = [
    heading('Risk Classification', HeadingLevel.HEADING_2),
    paragraph(classification.text),
  ];
  const classificationRows = [
    headerRow(['Choice', 'Factor']),
    ...classification.choices.map((choice) => new TableRow({
      children: [textCell(choice.text), textCell(String(choice.factor))],
    })),
  ];
  children.push(simpleTable(classificationRows));
  return children;
}

function buildDocxQuestionTableForDomain(domain, startingQuestionNumber) {
  const questionRows = [headerRow(['#', 'Weight', 'Question', 'Answer Choices', '✓', 'Notes'])];
  let questionNumber = startingQuestionNumber;

  for (const question of domain.questions) {
    questionNumber++;
    const choiceTexts = [...(question.choices || []), 'N/A'];

    questionRows.push(new TableRow({
      children: [
        textCell(`Q${questionNumber}`),
        shadedCell(question.weightTier, WEIGHT_FILLS[question.weightTier] || INFO_BG),
        textCell(question.text),
        textCell(choiceTexts.map((choice, index) => {
          const score = index < (question.choiceScores || []).length
            ? question.choiceScores[index]
            : (index === choiceTexts.length - 1 ? question.naScore : 0);
          return `${choice}  [${score}]`;
        }).join('\n')),
        textCell('☐'),
        textCell(''),
      ],
    }));
  }

  return { rows: questionRows, nextQuestionNumber: questionNumber };
}

function buildDocxDomainSections(domains) {
  const children = [new Paragraph({ children: [new PageBreak()] })];
  let questionNumber = 0;

  for (const domain of domains) {
    children.push(heading(`Domain ${domain.domainIndex}: ${domain.name}`, HeadingLevel.HEADING_1));

    if (domain.csfRefs.length > 0) {
      children.push(paragraph(`NIST CSF: ${domain.csfRefs.join(', ')}`, { color: RESCOR_BLUE, italics: true }));
    }
    if (domain.policyRefs.length > 0) {
      children.push(paragraph(`Policy Scope: ${domain.policyRefs.join(', ')}`, { color: RESCOR_GRAY, italics: true }));
    }

    const questionTable = buildDocxQuestionTableForDomain(domain, questionNumber);
    questionNumber = questionTable.nextQuestionNumber;
    children.push(simpleTable(questionTable.rows));
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  return children;
}

function buildDocxSummarySection(domains) {
  const children = [
    heading('Assessment Summary', HeadingLevel.HEADING_1),
  ];
  const summaryRows = [
    headerRow(['Domain', '# Questions', 'Score %', 'Rating', 'Notes']),
    ...domains.map((domain) => new TableRow({
      children: [
        textCell(domain.name),
        textCell(String(domain.questions.length)),
        textCell(''), textCell(''), textCell(''),
      ],
    })),
    new TableRow({
      children: [
        boldCell('OVERALL'),
        textCell(String(domains.reduce((sum, domain) => sum + domain.questions.length, 0))),
        textCell(''), textCell(''), textCell(''),
      ],
    }),
  ];
  children.push(simpleTable(summaryRows));
  return children;
}

function buildQuestionnaireDocx(config) {
  const { scoringConfiguration, classification, domains, weightTiers } = config;
  const children = [
    ...buildDocxTitleSection(scoringConfiguration),
    heading('Instructions', HeadingLevel.HEADING_1),
    paragraph(
      'This questionnaire assesses the security posture of applications. ' +
      'Each question maps to organizational policies and NIST CSF 2.0 subcategories. ' +
      'For each question, select exactly one response. If not applicable, select "N/A" with justification.',
    ),
    ...buildDocxWeightTierTable(weightTiers),
    ...buildDocxRatingScaleSection(),
    ...buildDocxApplicationInfoSection(),
    ...buildDocxClassificationSection(classification),
    ...buildDocxDomainSections(domains),
    ...buildDocxSummarySection(domains),
  ];

  return new Document({
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, bottom: 720, left: 900, right: 900 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [new TextRun({ text: 'ASR Questionnaire', size: 16, color: RESCOR_GRAY })],
            alignment: AlignmentType.RIGHT,
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'Confidential — ', size: 16, color: RESCOR_GRAY }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, color: RESCOR_GRAY }),
            ],
            alignment: AlignmentType.CENTER,
          })],
        }),
      },
      children,
    }],
  });
}


// ════════════════════════════════════════════════════════════════════
// 4b. XLSX Questionnaire Builder (decomposed)
// ════════════════════════════════════════════════════════════════════

function buildXlsxInstructionLines(weightTiers) {
  const lines = [
    '', 'HOW TO COMPLETE',
    '1. Go to the Questionnaire tab.',
    '2. FIRST answer the Risk Classification question at the top — this sets the global multiplier.',
    '3. For each domain question, click the Answer cell (yellow) and choose from the dropdown.',
    '4. The Measurement column auto-calculates immediately.',
    '5. Use the Notes column for justifications.',
    '6. If you select N/A, provide an explanation in Notes.',
    '7. Review the Summary tab for domain and overall risk scores.',
    '', 'WEIGHT TIERS',
  ];
  for (const tier of weightTiers) {
    lines.push(`  ${tier.name || tier.tierName}: ${tier.value}`);
  }
  lines.push('', 'RISK RATING SCALE');
  lines.push('  0–25%  Low      — Strong posture');
  lines.push('  26–50% Moderate — Adequate, minor gaps');
  lines.push('  51–75% Elevated — Material gaps');
  lines.push('  76–100% Critical — Fundamental gaps');
  lines.push('', `Generated: ${new Date().toISOString().slice(0, 10)}`);
  return lines;
}

function buildXlsxInstructionsSheet(workbook, weightTiers, scoringConfiguration) {
  const instructionsSheet = workbook.addWorksheet('Instructions', { properties: { tabColor: { argb: RESCOR_GREEN } } });
  instructionsSheet.getColumn(1).width = 100;
  instructionsSheet.getCell('A1').value = 'Application Security Review — Questionnaire';
  instructionsSheet.getCell('A1').font = { bold: true, size: 18, color: { argb: `FF${RESCOR_GREEN}` } };
  instructionsSheet.getCell('A3').value = 'Interactive Excel workbook with live risk scoring.';
  instructionsSheet.getCell('A3').font = { bold: true, size: 12, color: { argb: `FF${RESCOR_BLUE}` } };

  const instructionLines = buildXlsxInstructionLines(weightTiers);
  let instructionRow = 5;
  for (const line of instructionLines) {
    instructionsSheet.getCell(`A${instructionRow}`).value = line;
    instructionRow++;
  }
  instructionsSheet.state = 'visible';
  return instructionsSheet;
}

function buildXlsxQuestionnaireColumns() {
  const columns = [
    { header: '#', key: 'num', width: 5 },
    { header: 'Domain', key: 'domain', width: 28 },
    { header: 'Question', key: 'question', width: 58 },
    { header: 'Weight', key: 'weight', width: 10 },
    { header: 'Answer ▼', key: 'answer', width: 42 },
    { header: 'Measurement', key: 'measurement', width: 13 },
    { header: 'Notes', key: 'notes', width: 32 },
    { header: 'ClassFactor', key: 'classFactor', width: 1, hidden: true },
  ];
  return columns;
}

function buildXlsxClassificationRow(sheet, classification) {
  const classRow = 2;
  sheet.getCell(`A${classRow}`).value = '★';
  sheet.getCell(`A${classRow}`).font = { bold: true, size: 12, color: { argb: `FF${GAP_RED}` } };
  sheet.getCell(`A${classRow}`).alignment = { horizontal: 'center' };
  sheet.mergeCells(`B${classRow}:C${classRow}`);
  sheet.getCell(`B${classRow}`).value = classification.text;
  sheet.getCell(`B${classRow}`).font = { bold: true, size: 11, color: { argb: `FF${GAP_RED}` } };
  sheet.getCell(`D${classRow}`).value = 'Global';
  sheet.getCell(`D${classRow}`).font = { bold: true, size: 9, color: { argb: `FF${GAP_RED}` } };
  sheet.getCell(`D${classRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCDD2' } };

  const classChoiceTexts = classification.choices.map((choice) => choice.text);
  sheet.getCell(`E${classRow}`).dataValidation = {
    type: 'list',
    formulae: [`"${classChoiceTexts.join(',')}"`],
    showErrorMessage: true,
    errorTitle: 'Invalid Classification',
    error: 'Please select a risk classification.',
  };
  sheet.getCell(`E${classRow}`).fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFDE7' },
  };

  let classFactorExpression = '0';
  for (let index = classification.choices.length - 1; index >= 0; index--) {
    const choice = classification.choices[index];
    const escapedText = choice.text.replace(/"/g, '""');
    classFactorExpression = `IF(E2="${escapedText}",${choice.factor},${classFactorExpression})`;
  }
  sheet.getCell(`F${classRow}`).value = { formula: classFactorExpression };
  sheet.getCell(`H${classRow}`).value = { formula: 'F2' };

  const classRowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EAF6' } };
  for (let column = 1; column <= 8; column++) {
    sheet.getCell(classRow, column).fill = classRowFill;
  }
}

function buildXlsxQuestionRow(sheet, currentRow, question, questionNumber, domain, questionIndex, tierValueMap, domainFill) {
  const weightValue = tierValueMap[question.weightTier] || 0;

  sheet.getCell(`A${currentRow}`).value = questionNumber;
  sheet.getCell(`A${currentRow}`).font = { bold: true, size: 10 };
  sheet.getCell(`A${currentRow}`).alignment = { horizontal: 'center' };

  if (questionIndex === 0) {
    sheet.getCell(`B${currentRow}`).value = domain.name;
    sheet.getCell(`B${currentRow}`).font = { bold: true, size: 10, color: { argb: `FF${RESCOR_BLUE}` } };
    sheet.getCell(`B${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  }

  sheet.getCell(`C${currentRow}`).value = question.text;
  sheet.getCell(`C${currentRow}`).alignment = { wrapText: true, vertical: 'top' };

  sheet.getCell(`D${currentRow}`).value = question.weightTier;
  sheet.getCell(`D${currentRow}`).font = { bold: true, size: 9 };
  sheet.getCell(`D${currentRow}`).alignment = { horizontal: 'center' };
  const weightFillColor = WEIGHT_FILLS[question.weightTier] || INFO_BG;
  sheet.getCell(`D${currentRow}`).fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${weightFillColor}` },
  };

  const choiceTexts = [...(question.choices || []), 'N/A'];
  sheet.getCell(`E${currentRow}`).dataValidation = {
    type: 'list',
    formulae: [`"${choiceTexts.join(',')}"`],
    showErrorMessage: true,
    errorTitle: `Q${questionNumber}`,
    error: 'Please select a valid answer.',
  };
  sheet.getCell(`E${currentRow}`).fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFDE7' },
  };
  sheet.getCell(`E${currentRow}`).alignment = { wrapText: true };

  const scores = [...(question.choiceScores || []), question.naScore ?? 1];
  let measurementExpression = String(scores[scores.length - 1]);
  for (let scoreIndex = scores.length - 2; scoreIndex >= 0; scoreIndex--) {
    const escapedChoice = choiceTexts[scoreIndex].replace(/"/g, '""');
    measurementExpression = `IF(E${currentRow}="${escapedChoice}",${scores[scoreIndex]},${measurementExpression})`;
  }
  const formula = `IF(E${currentRow}="",0,INT(${measurementExpression}/100*${weightValue}/100*$H$2))`;
  sheet.getCell(`F${currentRow}`).value = { formula };
  sheet.getCell(`F${currentRow}`).numFmt = '0';
  sheet.getCell(`F${currentRow}`).alignment = { horizontal: 'center' };

  sheet.getCell(`G${currentRow}`).alignment = { wrapText: true };

  for (const column of ['A', 'B', 'C', 'G']) {
    sheet.getCell(`${column}${currentRow}`).fill = domainFill;
  }

  sheet.getRow(currentRow).height = 32;
}

function buildXlsxDomainRows(sheet, domains, tierValueMap) {
  let currentRow = 3;
  let questionNumber = 0;
  const domainRanges = [];

  for (let domainIndex = 0; domainIndex < domains.length; domainIndex++) {
    const domain = domains[domainIndex];
    const startRow = currentRow;
    const domainFillColor = DOMAIN_FILLS[domainIndex % DOMAIN_FILLS.length];
    const domainFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${domainFillColor}` } };

    for (let questionIndex = 0; questionIndex < domain.questions.length; questionIndex++) {
      const question = domain.questions[questionIndex];
      questionNumber++;
      buildXlsxQuestionRow(sheet, currentRow, question, questionNumber, domain, questionIndex, tierValueMap, domainFill);
      currentRow++;
    }

    const endRow = currentRow - 1;

    if (domain.questions.length > 1) {
      sheet.mergeCells(`B${startRow}:B${endRow}`);
    }

    domainRanges.push({
      name: domain.name,
      startRow,
      endRow,
      questionCount: domain.questions.length,
      policyRefs: domain.policyRefs.join(', '),
      csfRefs: domain.csfRefs.join(', '),
    });
  }

  return { domainRanges, lastQuestionRow: currentRow - 1 };
}

function buildXlsxSheetProtection(sheet, lastQuestionRow) {
  sheet.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatColumns: false,
    formatRows: false,
  });
  for (let row = 2; row <= lastQuestionRow; row++) {
    sheet.getCell(`E${row}`).protection = { locked: false };
    sheet.getCell(`G${row}`).protection = { locked: false };
  }
}

function buildXlsxSummaryHeader(summarySheet) {
  summarySheet.getColumn(1).width = 36;
  summarySheet.getColumn(2).width = 8;
  summarySheet.getColumn(3).width = 10;
  summarySheet.getColumn(4).width = 18;
  summarySheet.getColumn(5).width = 13;
  summarySheet.getColumn(6).width = 44;

  summarySheet.mergeCells('A1:F1');
  summarySheet.getCell('A1').value = 'ASR Questionnaire — Risk Assessment Summary';
  summarySheet.getCell('A1').font = { bold: true, size: 18, color: { argb: `FF${RESCOR_GREEN}` } };
  summarySheet.getCell('A1').alignment = { horizontal: 'center' };

  summarySheet.mergeCells('A2:F2');
  summarySheet.getCell('A2').value = `Generated ${new Date().toISOString().slice(0, 10)}`;
  summarySheet.getCell('A2').font = { italic: true, size: 10, color: { argb: `FF${RESCOR_GRAY}` } };
  summarySheet.getCell('A2').alignment = { horizontal: 'center' };
}

function buildXlsxSummaryAnsweredRow(summarySheet, lastQuestionRow, domains) {
  summarySheet.getCell('A4').value = 'Questions Answered:';
  summarySheet.getCell('A4').font = { bold: true };
  summarySheet.getCell('B4').value = { formula: `COUNTIF(Questionnaire!$F$3:$F$${lastQuestionRow},">0")` };
  summarySheet.getCell('C4').value = 'of';
  summarySheet.getCell('C4').font = { color: { argb: `FF${RESCOR_GRAY}` } };
  summarySheet.getCell('D4').value = domains.reduce((sum, domain) => sum + domain.questions.length, 0);
}

function buildXlsxSummaryHeaderRow(summarySheet, summaryHeaderRow) {
  const summaryHeaders = ['Domain', '# Q', 'Answered', 'Residual Risk (0–100)', 'Rating', 'Policy / CSF References'];
  summaryHeaders.forEach((text, index) => {
    const cell = summarySheet.getCell(summaryHeaderRow, index + 1);
    cell.value = text;
    cell.font = { bold: true, size: 11, color: { argb: `FF${WHITE}` } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF37474F' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
}

function buildXlsxSummaryDomainRow(summarySheet, row, range, index, dampingFactor, rawMax) {
  const domainFillColor = DOMAIN_FILLS[index % DOMAIN_FILLS.length];

  summarySheet.getCell(row, 1).value = range.name;
  summarySheet.getCell(row, 1).font = { bold: true, size: 10 };
  summarySheet.getCell(row, 2).value = range.questionCount;
  summarySheet.getCell(row, 2).alignment = { horizontal: 'center' };

  const measurementRange = `Questionnaire!$F$${range.startRow}:$F$${range.endRow}`;
  summarySheet.getCell(row, 3).value = { formula: `COUNTIF(${measurementRange},">0")` };
  summarySheet.getCell(row, 3).alignment = { horizontal: 'center' };

  const rskTerms = buildRskFormulaTerms(measurementRange, range.questionCount, dampingFactor);
  const rskFormula = `IF(SUM(${measurementRange})=0,0,MIN(100,ROUND(CEILING(${rskTerms},1)/${rawMax}*100,1)))`;
  summarySheet.getCell(row, 4).value = { formula: rskFormula };
  summarySheet.getCell(row, 4).numFmt = '0.0';
  summarySheet.getCell(row, 4).alignment = { horizontal: 'center' };

  const ratingFormula = `IF(D${row}=0,"",IF(D${row}<=25,"Low",IF(D${row}<=50,"Moderate",IF(D${row}<=75,"Elevated","Critical"))))`;
  summarySheet.getCell(row, 5).value = { formula: ratingFormula };
  summarySheet.getCell(row, 5).alignment = { horizontal: 'center' };

  summarySheet.getCell(row, 6).value = `${range.policyRefs}  |  ${range.csfRefs}`;
  summarySheet.getCell(row, 6).font = { size: 9, color: { argb: `FF${RESCOR_GRAY}` } };

  for (let column = 1; column <= 6; column++) {
    summarySheet.getCell(row, column).fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${domainFillColor}` },
    };
  }
}

function buildXlsxSummaryOverallRow(summarySheet, overallRow, domains, lastQuestionRow, dampingFactor, rawMax) {
  const totalQuestions = domains.reduce((sum, domain) => sum + domain.questions.length, 0);
  const allMeasurements = `Questionnaire!$F$3:$F$${lastQuestionRow}`;

  summarySheet.getCell(overallRow, 1).value = 'OVERALL';
  summarySheet.getCell(overallRow, 1).font = { bold: true, size: 12, color: { argb: `FF${GAP_RED}` } };
  summarySheet.getCell(overallRow, 2).value = totalQuestions;
  summarySheet.getCell(overallRow, 2).alignment = { horizontal: 'center' };
  summarySheet.getCell(overallRow, 3).value = { formula: `COUNTIF(${allMeasurements},">0")` };
  summarySheet.getCell(overallRow, 3).alignment = { horizontal: 'center' };

  const overallRskTerms = buildRskFormulaTerms(allMeasurements, Math.min(totalQuestions, 12), dampingFactor);
  const overallRskFormula = `IF(SUM(${allMeasurements})=0,0,MIN(100,ROUND(CEILING(${overallRskTerms},1)/${rawMax}*100,1)))`;
  summarySheet.getCell(overallRow, 4).value = { formula: overallRskFormula };
  summarySheet.getCell(overallRow, 4).numFmt = '0.0';
  summarySheet.getCell(overallRow, 4).alignment = { horizontal: 'center' };

  const overallRatingFormula = `IF(D${overallRow}=0,"",IF(D${overallRow}<=25,"Low",IF(D${overallRow}<=50,"Moderate",IF(D${overallRow}<=75,"Elevated","Critical"))))`;
  summarySheet.getCell(overallRow, 5).value = { formula: overallRatingFormula };
  summarySheet.getCell(overallRow, 5).alignment = { horizontal: 'center' };

  const overallFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } };
  for (let column = 1; column <= 6; column++) {
    summarySheet.getCell(overallRow, column).fill = overallFill;
  }
}

function buildXlsxSummarySheet(workbook, domainRanges, domains, scoringConfiguration, lastQuestionRow) {
  const summarySheet = workbook.addWorksheet('Summary', {
    properties: { tabColor: { argb: GAP_RED } },
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  buildXlsxSummaryHeader(summarySheet);
  buildXlsxSummaryAnsweredRow(summarySheet, lastQuestionRow, domains);

  const summaryHeaderRow = 6;
  buildXlsxSummaryHeaderRow(summarySheet, summaryHeaderRow);

  const dampingFactor = scoringConfiguration.dampingFactor || 4;
  const rawMax = scoringConfiguration.rawMax || 134;

  for (let index = 0; index < domainRanges.length; index++) {
    const range = domainRanges[index];
    const row = summaryHeaderRow + 1 + index;
    buildXlsxSummaryDomainRow(summarySheet, row, range, index, dampingFactor, rawMax);
  }

  const overallRow = summaryHeaderRow + 1 + domainRanges.length;
  buildXlsxSummaryOverallRow(summarySheet, overallRow, domains, lastQuestionRow, dampingFactor, rawMax);

  addRatingConditionalFormatting(summarySheet, summaryHeaderRow + 1, overallRow, 5);

  summarySheet.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
  });

  return summarySheet;
}

function buildXlsxScoringModelSheet(workbook, scoringConfiguration) {
  const scoringSheet = workbook.addWorksheet('Scoring Model', { properties: { tabColor: { argb: RESCOR_GRAY } } });
  scoringSheet.getColumn(1).width = 90;

  const dampingFactor = scoringConfiguration.dampingFactor || 4;
  const rawMax = scoringConfiguration.rawMax || 134;

  const scoringLines = [
    { text: 'ASR Scoring Model — Reference', font: { bold: true, size: 18, color: { argb: `FF${RESCOR_GREEN}` } } },
    {},
    { text: 'PER-QUESTION MEASUREMENT', font: { bold: true, size: 12 } },
    { text: '  measurement = INT( answer_score/100 × weight/100 × classification_factor )' },
    { text: `  Theoretical max = INT(85/100 × 100/100 × 100) = 85` },
    {},
    { text: 'AGGREGATE SCORING', font: { bold: true, size: 12 } },
    { text: `  Composite = CEILING( Σ sorted_measurements[j] / ${dampingFactor}^j , 1)` },
    { text: '  Highest finding dominates; lesser findings progressively discounted.' },
    {},
    { text: 'NORMALIZATION', font: { bold: true, size: 12 } },
    { text: `  norm% = MIN(100, raw_aggregate / ${rawMax} × 100)` },
    {},
    { text: 'RISK RATING THRESHOLDS', font: { bold: true, size: 12 } },
    { text: '  0–25%  Low      — Strong posture' },
    { text: '  26–50% Moderate — Adequate, minor gaps' },
    { text: '  51–75% Elevated — Material gaps' },
    { text: '  76–100% Critical — Fundamental gaps' },
  ];

  scoringLines.forEach((line, index) => {
    if (line.text) {
      const cell = scoringSheet.getCell(index + 1, 1);
      cell.value = line.text;
      if (line.font) cell.font = line.font;
      cell.alignment = { wrapText: true, vertical: 'top' };
    }
  });

  return scoringSheet;
}

function buildQuestionnaireXlsx(config) {
  const { scoringConfiguration, classification, domains, weightTiers } = config;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ASR Export';
  workbook.created = new Date();

  const tierValueMap = {};
  for (const tier of weightTiers) {
    tierValueMap[tier.name || tier.tierName] = tier.value;
  }

  buildXlsxInstructionsSheet(workbook, weightTiers, scoringConfiguration);

  const questionnaireSheet = workbook.addWorksheet('Questionnaire', {
    properties: { tabColor: { argb: RESCOR_BLUE } },
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  questionnaireSheet.columns = buildXlsxQuestionnaireColumns();

  const headerRowExcel = questionnaireSheet.getRow(1);
  headerRowExcel.font = { bold: true, size: 11, color: { argb: `FF${WHITE}` } };
  headerRowExcel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF37474F' } };
  headerRowExcel.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  buildXlsxClassificationRow(questionnaireSheet, classification);
  questionnaireSheet.views = [{ state: 'frozen', ySplit: 2, xSplit: 0 }];

  const { domainRanges, lastQuestionRow } = buildXlsxDomainRows(questionnaireSheet, domains, tierValueMap);
  buildXlsxSheetProtection(questionnaireSheet, lastQuestionRow);
  buildXlsxSummarySheet(workbook, domainRanges, domains, scoringConfiguration, lastQuestionRow);
  buildXlsxScoringModelSheet(workbook, scoringConfiguration);

  return workbook;
}

function buildRskFormulaTerms(range, itemCount, dampingFactor) {
  const terms = [];
  const effectiveCount = Math.min(itemCount, 12);
  for (let index = 0; index < effectiveCount; index++) {
    const divisor = Math.pow(dampingFactor, index);
    if (divisor === 1) {
      terms.push(`LARGE(${range},${index + 1})`);
    } else {
      terms.push(`LARGE(${range},${index + 1})/${divisor}`);
    }
  }
  return terms.join('+');
}

function addRatingConditionalFormatting(sheet, startRow, endRow, column) {
  const columnLetter = String.fromCharCode(64 + column);
  const range = `${columnLetter}${startRow}:${columnLetter}${endRow}`;

  const rules = [
    { value: '"Low"', fontColor: RESCOR_GREEN, fillColor: 'E8F5E9' },
    { value: '"Moderate"', fontColor: BLACK, fillColor: 'FFF3E0' },
    { value: '"Elevated"', fontColor: 'E65100', fillColor: 'FFE0B2' },
    { value: '"Critical"', fontColor: GAP_RED, fillColor: 'FFCDD2' },
  ];

  for (const rule of rules) {
    sheet.addConditionalFormatting({
      ref: range,
      rules: [{
        type: 'cellIs',
        operator: 'equal',
        formulae: [rule.value],
        style: {
          font: { bold: true, color: { argb: `FF${rule.fontColor}` } },
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: `FF${rule.fillColor}` } },
        },
      }],
    });
  }
}


// ════════════════════════════════════════════════════════════════════
// 4c. Review Report DOCX Builder (decomposed)
// ════════════════════════════════════════════════════════════════════

function buildReportTitleSection(review, scoringConfiguration) {
  const children = [
    new Paragraph({
      children: [new TextRun({ text: 'Application Security Review', bold: true, size: 48, color: RESCOR_GREEN })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [new TextRun({ text: 'Assessment Report', bold: true, size: 36, color: RESCOR_BLUE })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({ text: review.applicationName || 'Untitled Review', bold: true, size: 28 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
    new Paragraph({
      children: [new TextRun({
        text: `Assessor: ${review.assessor || 'N/A'}  |  Status: ${review.status || 'N/A'}  |  Date: ${review.created || 'N/A'}`,
        size: 20, color: RESCOR_GRAY,
      })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
  ];
  return children;
}

function buildReportScoringTable(review) {
  const children = [
    heading('Executive Summary', HeadingLevel.HEADING_1),
  ];
  const summaryRows = [
    headerRow(['Metric', 'Value']),
    metricRow('Application', review.applicationName || 'N/A'),
    metricRow('Risk Classification', review.classificationChoice || 'Not set'),
    metricRow('Classification Factor', String(review.classificationFactor ?? 'N/A')),
    metricRow('Source', review.sourceChoice || 'Not set'),
    metricRow('Environment', review.environmentChoice || 'Not set'),
    metricRow('Deployment Archetype', review.deploymentArchetype || 'Not set'),
    metricRow('RSK Raw Score', String(review.rskRaw ?? 0)),
    metricRow('Normalized Score', `${review.rskNormalized ?? 0}%`),
    metricRow('Overall Rating', review.rating || 'Low'),
    metricRow('Questionnaire Version', review.questionnaireVersion || 'N/A'),
  ];
  children.push(simpleTable(summaryRows));
  return children;
}

function buildReportGateSection(gates) {
  const answeredGates = gates.filter((gate) => gate.choiceIndex != null);
  const children = [];

  if (answeredGates.length > 0) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading('Preliminary Attestations', HeadingLevel.HEADING_1));
    const gateRows = [
      headerRow(['Function', 'Gate Question', 'Response', 'Respondent', 'Date']),
      ...answeredGates.map((gate) => {
        const choices = gate.choices || [];
        const choiceText = gate.choiceIndex != null && gate.choiceIndex < choices.length
          ? choices[gate.choiceIndex] : 'N/A';
        return new TableRow({
          children: [
            boldCell(gate.function || ''),
            textCell(gate.text || ''),
            textCell(choiceText),
            textCell(gate.respondedBy || ''),
            textCell(gate.respondedAt ? gate.respondedAt.slice(0, 10) : ''),
          ],
        });
      }),
    ];
    children.push(simpleTable(gateRows));
  }

  return children;
}

function buildReportAnswerMap(answers) {
  const answerMap = new Map();
  for (const item of answers) {
    const answer = item.answer || {};
    const key = `${answer.domainIndex}:${answer.questionIndex}`;
    answerMap.set(key, answer);
  }
  return answerMap;
}

function buildReportDomainAnswerTable(domain, answerMap) {
  const domainAnswerRows = [headerRow(['#', 'Question', 'Answer', 'Weight', 'Measurement', 'Notes'])];
  const domainMeasurements = [];
  let answeredCount = 0;

  for (let questionIndex = 0; questionIndex < domain.questions.length; questionIndex++) {
    const question = domain.questions[questionIndex];
    const key = `${domain.domainIndex}:${question.questionIndex}`;
    const answer = answerMap.get(key);

    if (answer) {
      answeredCount++;
      const measurement = answer.measurement ?? 0;
      domainMeasurements.push(measurement);
      domainAnswerRows.push(new TableRow({
        children: [
          textCell(`Q${question.questionIndex + 1}`),
          textCell(question.text),
          textCell(answer.choiceText || 'N/A'),
          textCell(question.weightTier),
          measurement > 25
            ? shadedCell(String(measurement), CRIT_BG)
            : textCell(String(measurement)),
          textCell(answer.notes || ''),
        ],
      }));
    }
  }

  return { rows: domainAnswerRows, measurements: domainMeasurements, answeredCount };
}

async function buildReportDomainSections(answers, domains, scoringConfiguration, stormService) {
  const children = [
    new Paragraph({ children: [new PageBreak()] }),
    heading('Domain Results', HeadingLevel.HEADING_1),
  ];
  const answerMap = buildReportAnswerMap(answers);
  const domainSummaryRows = [headerRow(['Domain', '# Answered', 'RSK Raw', 'Normalized', 'Rating'])];

  for (const domain of domains) {
    const domainData = buildReportDomainAnswerTable(domain, answerMap);
    const domainScore = await stormService.computeScore(domainData.measurements, scoringConfiguration);

    domainSummaryRows.push(new TableRow({
      children: [
        boldCell(`${domain.domainIndex}: ${domain.name}`),
        textCell(`${domainData.answeredCount} / ${domain.questions.length}`),
        textCell(String(domainScore.raw)),
        textCell(`${domainScore.normalized}%`),
        shadedCell(domainScore.rating, RATING_FILLS[domainScore.rating] || 'FFFFFF'),
      ],
    }));

    children.push(heading(`Domain ${domain.domainIndex}: ${domain.name}`, HeadingLevel.HEADING_2));
    children.push(paragraph(
      `Score: ${domainScore.normalized}% (${domainScore.rating})  |  Answered: ${domainData.answeredCount}/${domain.questions.length}`,
      { bold: true },
    ));
    if (domainData.answeredCount > 0) {
      children.push(simpleTable(domainData.rows));
    } else {
      children.push(paragraph('No answers recorded for this domain.', { italics: true, color: RESCOR_GRAY }));
    }
  }

  // Insert domain summary table right after the "Domain Results" heading
  children.splice(2, 0, simpleTable(domainSummaryRows));

  return children;
}

function buildReportRemediationRows(remediations) {
  const remediationRows = [
    headerRow(['Question', 'Measurement', 'Action', 'Function', 'Status', 'Response Type', 'Mitigation %', 'Target Date']),
  ];

  for (const item of remediations) {
    if (item.remediations.length === 0) {
      remediationRows.push(new TableRow({
        children: [
          textCell(item.questionText),
          shadedCell(String(item.measurement), CRIT_BG),
          textCell('No remediation proposed'),
          textCell(''), textCell('OPEN'), textCell(''), textCell('0'), textCell(''),
        ],
      }));
    } else {
      for (const remediation of item.remediations) {
        remediationRows.push(new TableRow({
          children: [
            textCell(item.questionText),
            shadedCell(String(item.measurement), CRIT_BG),
            textCell(remediation.proposedAction),
            textCell(remediation.assignedFunction),
            textCell(remediation.status),
            textCell(remediation.responseType),
            textCell(String(remediation.mitigationPercent)),
            textCell(remediation.targetDate),
          ],
        }));
      }
    }
  }

  return remediationRows;
}

function buildReportRemediationSection(remediations) {
  const children = [];

  if (remediations.length > 0) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(heading('Remediation Plan (POAM)', HeadingLevel.HEADING_1));
    children.push(paragraph(
      `${remediations.length} question(s) with measurement > 25 RU requiring remediation attention.`,
    ));
    children.push(simpleTable(buildReportRemediationRows(remediations)));
  }

  return children;
}

async function buildReviewReportDocx(reviewData, config, stormService) {
  const { review, answers, remediations, gates } = reviewData;
  const { scoringConfiguration, domains } = config;

  const domainSections = await buildReportDomainSections(answers, domains, scoringConfiguration, stormService);

  const children = [
    ...buildReportTitleSection(review, scoringConfiguration),
    ...buildReportScoringTable(review),
    ...buildReportGateSection(gates),
    ...domainSections,
    ...buildReportRemediationSection(remediations),
  ];

  if (review.notes) {
    children.push(heading('Assessment Notes', HeadingLevel.HEADING_1));
    children.push(paragraph(review.notes));
  }

  return new Document({
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 720, bottom: 720, left: 900, right: 900 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [new TextRun({
              text: `ASR Report — ${review.applicationName || 'Review'}`,
              size: 16, color: RESCOR_GRAY,
            })],
            alignment: AlignmentType.RIGHT,
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'Confidential — ', size: 16, color: RESCOR_GRAY }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, color: RESCOR_GRAY }),
            ],
            alignment: AlignmentType.CENTER,
          })],
        }),
      },
      children,
    }],
  });
}


// ════════════════════════════════════════════════════════════════════
// DOCX Utility Helpers (declarative docx API)
// ════════════════════════════════════════════════════════════════════

function heading(text, level) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true })],
    heading: level,
    spacing: { before: 200, after: 100 },
  });
}

function paragraph(text, options = {}) {
  return new Paragraph({
    children: [new TextRun({
      text,
      bold: options.bold || false,
      italics: options.italics || false,
      color: options.color || undefined,
      size: options.size || 20,
    })],
    spacing: { after: 80 },
  });
}

function simpleTable(rows) {
  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function headerRow(cells) {
  return new TableRow({
    tableHeader: true,
    children: cells.map((text) => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text, bold: true, size: 18, color: WHITE })],
        alignment: AlignmentType.CENTER,
      })],
      shading: { type: ShadingType.SOLID, color: '37474F' },
      borders: allBorders(),
    })),
  });
}

function textCell(text) {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text: text || '', size: 18 })],
    })],
    borders: allBorders(),
  });
}

function boldCell(text) {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text: text || '', bold: true, size: 18 })],
    })],
    borders: allBorders(),
  });
}

function shadedCell(text, fillColor) {
  return new TableCell({
    children: [new Paragraph({
      children: [new TextRun({ text: text || '', size: 18 })],
    })],
    shading: { type: ShadingType.SOLID, color: fillColor },
    borders: allBorders(),
  });
}

function metricRow(label, value) {
  return new TableRow({
    children: [boldCell(label), textCell(value)],
  });
}

function ratingRow(range, ratingLabel, description) {
  return new TableRow({
    children: [
      textCell(range),
      shadedCell(ratingLabel, RATING_FILLS[ratingLabel] || 'FFFFFF'),
      textCell(description),
    ],
  });
}

function tierPriority(name) {
  const map = { Critical: 'Highest', High: 'High', Medium: 'Moderate', Info: 'Low' };
  return map[name] || 'Unknown';
}

function tierEscalation(name) {
  const map = {
    Critical: 'CISO notification required',
    High: 'Security Architecture review',
    Medium: 'Risk acceptance option',
    Info: 'None',
  };
  return map[name] || 'None';
}
