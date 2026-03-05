// ════════════════════════════════════════════════════════════════════
// exportExcel — Generate a protected .xlsx workbook for distribution
// ════════════════════════════════════════════════════════════════════
// Uses ExcelJS in the browser to produce a downloadable Excel file
// with a Summary sheet and a detailed Questionnaire sheet.
// All cells are locked by default via sheet protection.

import ExcelJS from 'exceljs';
import type {
  AppConfiguration,
  AnswerState,
  DomainConfig,
  ComplianceRef,
} from './types';
import { rskAggregate } from './scoring';
import type { ScoreResult } from './scoring';

// ────────────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────────────

export interface ExportOptions {
  applicationName: string;
  assessor: string;
  status: string;
  classificationLabel: string | null;
  classificationFactor: number;
  configuration: AppConfiguration;
  answers: Map<string, AnswerState>;
  liveScore: ScoreResult;
  reviewDate: string;
}

export async function exportReviewToExcel(options: ExportOptions): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ASR — Application Security Review';
  workbook.created = new Date();

  buildSummarySheet(workbook, options);
  buildQuestionnaireSheet(workbook, options);

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer as ArrayBuffer, sanitizeFilename(options.applicationName));
}

// ────────────────────────────────────────────────────────────────────
// Summary Sheet
// ────────────────────────────────────────────────────────────────────

function buildSummarySheet(
  workbook: ExcelJS.Workbook,
  options: ExportOptions,
): void {
  const sheet = workbook.addWorksheet('Summary');

  // Column widths
  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 48;

  const titleRow = sheet.addRow(['Application Security Review']);
  titleRow.font = { bold: true, size: 16 };
  sheet.mergeCells('A1:B1');
  sheet.addRow([]);

  const summaryData: [string, string | number][] = [
    ['Application Name', options.applicationName],
    ['Assessor', options.assessor],
    ['Status', options.status],
    ['Review Date', options.reviewDate],
    ['Classification', options.classificationLabel ?? '(Not selected)'],
    ['Classification Factor', options.classificationFactor],
    ['', ''],
    ['RSK Raw Score', options.liveScore.raw],
    ['Normalized Score', `${Math.ceil(options.liveScore.normalized)} RU`],
    ['Risk Rating', options.liveScore.rating],
  ];

  for (const [label, value] of summaryData) {
    const row = sheet.addRow([label, value]);
    if (label !== '') {
      row.getCell(1).font = { bold: true };
    }
  }

  // Section scores
  sheet.addRow([]);
  const sectionHeaderRow = sheet.addRow(['Domain Scores']);
  sectionHeaderRow.font = { bold: true, size: 13 };
  sheet.addRow(['Domain', 'Section Score (RU)']);
  const domainHeaderRow = sheet.getRow(sheet.rowCount);
  domainHeaderRow.font = { bold: true };
  domainHeaderRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1565C0' },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });

  const dampingFactor = options.configuration.scoringConfiguration.dampingFactor;
  for (const domain of options.configuration.domains) {
    const sectionScore = computeSectionScore(domain, options.answers, dampingFactor);
    sheet.addRow([`${domain.domainIndex}. ${domain.name}`, sectionScore]);
  }

  applySheetProtection(sheet);
}

// ────────────────────────────────────────────────────────────────────
// Questionnaire Sheet
// ────────────────────────────────────────────────────────────────────

function buildQuestionnaireSheet(
  workbook: ExcelJS.Workbook,
  options: ExportOptions,
): void {
  const sheet = workbook.addWorksheet('Questionnaire');

  // Column widths
  const columns = [
    { header: 'Domain', width: 8 },
    { header: 'Domain Name', width: 30 },
    { header: '#', width: 6 },
    { header: 'Question', width: 60 },
    { header: 'Weight Tier', width: 14 },
    { header: 'Weight Value', width: 12 },
    { header: 'Answer', width: 22 },
    { header: 'Raw Score', width: 10 },
    { header: 'Measurement', width: 14 },
    { header: 'Notes', width: 40 },
    { header: 'Compliance', width: 36 },
  ];

  sheet.columns = columns.map((column) => ({
    width: column.width,
  }));

  // Header row
  const headerRow = sheet.addRow(columns.map((column) => column.header));
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1565C0' },
    };
    cell.alignment = { wrapText: true, vertical: 'top' };
  });

  // Freeze header row
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 0 }];

  const weightTierMap = buildWeightTierMap(options.configuration);

  for (const domain of options.configuration.domains) {
    addDomainRows(sheet, domain, options.answers, weightTierMap);
  }

  applySheetProtection(sheet);
}

// ────────────────────────────────────────────────────────────────────
// addDomainRows
// ────────────────────────────────────────────────────────────────────

function addDomainRows(
  sheet: ExcelJS.Worksheet,
  domain: DomainConfig,
  answers: Map<string, AnswerState>,
  weightTierMap: Record<string, number>,
): void {
  const complianceRefs = domain.complianceRefs ?? buildComplianceRefs(domain);
  const complianceText = complianceRefs
    .map((ref) => `${ref.tag}: ${ref.code}`)
    .join(', ');

  for (const question of domain.questions) {
    const key = `${question.domainIndex}:${question.questionIndex}`;
    const answer = answers.get(key);
    const weightValue = weightTierMap[question.weightTier] ?? 0;

    const row = sheet.addRow([
      question.domainIndex,
      domain.name,
      question.questionIndex,
      question.text,
      question.weightTier,
      weightValue,
      answer?.choiceText || '',
      answer?.rawScore ?? '',
      answer?.measurement ?? '',
      answer?.notes || '',
      complianceText,
    ]);

    row.alignment = { wrapText: true, vertical: 'top' };

    // Light alternating fill based on domain index
    if (question.domainIndex % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF5F5F5' },
        };
      });
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// Sheet Protection
// ────────────────────────────────────────────────────────────────────

function applySheetProtection(sheet: ExcelJS.Worksheet): void {
  sheet.protect('asr-readonly', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertRows: false,
    insertColumns: false,
    insertHyperlinks: false,
    deleteRows: false,
    deleteColumns: false,
    sort: true,
    autoFilter: true,
  });
}

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function computeSectionScore(
  domain: DomainConfig,
  answers: Map<string, AnswerState>,
  dampingFactor: number,
): number {
  const measurements: number[] = [];

  for (const question of domain.questions) {
    const key = `${question.domainIndex}:${question.questionIndex}`;
    const answer = answers.get(key);
    if (answer != null && answer.choiceIndex !== null) {
      measurements.push(answer.measurement);
    }
  }

  return rskAggregate(measurements, dampingFactor);
}

function buildWeightTierMap(configuration: AppConfiguration): Record<string, number> {
  const map: Record<string, number> = {};

  for (const tier of configuration.weightTiers) {
    map[tier.name] = tier.value;
  }

  return map;
}

function buildComplianceRefs(domain: DomainConfig): ComplianceRef[] {
  const refs: ComplianceRef[] = [];

  for (const code of domain.csfRefs ?? []) {
    refs.push({ tag: 'NIST', code });
  }

  if (domain.ferpaNote) {
    const sectionMatches = domain.ferpaNote.match(/§[\d.]+/g);
    if (sectionMatches) {
      for (const section of sectionMatches) {
        refs.push({ tag: 'FERPA', code: section });
      }
    }
  }

  if (domain.soxNote) {
    const sectionMatches = domain.soxNote.match(/§[\d.]+/g);
    if (sectionMatches) {
      for (const section of sectionMatches) {
        refs.push({ tag: 'SOX', code: section });
      }
    }
  }

  for (const code of domain.policyRefs ?? []) {
    const tag = code.startsWith('IISP') ? 'IISP' : 'ISP';
    refs.push({ tag, code });
  }

  return refs;
}

function sanitizeFilename(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'ASR-Review';
  return `ASR_${sanitized}_${formatDate(new Date())}`;
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}${month}${day}`;
}

function triggerDownload(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
