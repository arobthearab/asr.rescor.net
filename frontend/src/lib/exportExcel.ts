// ════════════════════════════════════════════════════════════════════
// exportExcel — Generate a protected .xlsx workbook for distribution
// ════════════════════════════════════════════════════════════════════
// Uses ExcelJS in the browser to produce a downloadable Excel file
// with a Summary sheet and a detailed Questionnaire sheet.
// Color palette mirrors the standalone ASR Questionnaire Excel.
// Cells are content-locked; formatting is permitted.

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
// Color palette
// ────────────────────────────────────────────────────────────────────

const COLORS = {
  // Theme
  titleGreen:  'FF2E7D32',
  subtitleBlue:'FF1565C0',
  headerFill:  'FF37474F',
  headerFont:  'FFFFFFFF',

  // Borders
  thinBorder:  'FFBDBDBD',
  thickBorder: 'FF757575',

  // Domain row alternating fills (Material Design -50 tints, cycling)
  domainFills: [
    'FFE3F2FD',  // Blue-50
    'FFE8F5E9',  // Green-50
    'FFFFF3E0',  // Orange-50
    'FFF3E5F5',  // Purple-50
    'FFE0F7FA',  // Cyan-50
    'FFFBE9E7',  // DeepOrange-50
    'FFF1F8E9',  // LightGreen-50
  ],

  // Weight tier fills
  weightTier: {
    Critical: 'FFFFCDD2',  // Red-100
    High:     'FFFFE0B2',  // Orange-100
    Medium:   'FFC8E6C9',  // Green-100
    Info:     'FFF5F5F5',  // Grey-100
  } as Record<string, string>,

  // Measurement gradient stops (green → amber → red)
  gradientGreen: 'FF4CAF50',
  gradientAmber: 'FFFFC107',
  gradientRed:   'FFC62828',

  // Rating fills and fonts
  rating: {
    Low:      { fill: 'FFE8F5E9', font: 'FF2E7D32' },
    Moderate: { fill: 'FFFFF3E0', font: 'FF000000' },
    Elevated: { fill: 'FFFFE0B2', font: 'FFE65100' },
    Critical: { fill: 'FFFFCDD2', font: 'FFC62828' },
  } as Record<string, { fill: string; font: string }>,

  // Special
  overallRow:   'FFFFF9C4',  // Yellow-100
  zeroWhite:    'FFFFFFFF',
  footerGray:   'FF757575',

  // Tab colors
  summaryTab:       'C62828',
  questionnaireTab: '1565C0',
} as const;

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
  const sheet = workbook.addWorksheet('Summary', { properties: { tabColor: { argb: COLORS.summaryTab } } });

  // Column widths
  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 48;

  const titleRow = sheet.addRow(['Application Security Review']);
  titleRow.font = { bold: true, size: 16, color: { argb: COLORS.titleGreen } };
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

  // Apply rating color to Risk Rating value cell
  const ratingStyle = COLORS.rating[options.liveScore.rating];
  if (ratingStyle) {
    const ratingRowNumber = sheet.rowCount;
    const ratingCell = sheet.getRow(ratingRowNumber).getCell(2);
    ratingCell.font = { bold: true, color: { argb: ratingStyle.font } };
    ratingCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: ratingStyle.fill },
    };
  }

  // ── Domain section scores ──────────────────────────────────────
  sheet.addRow([]);
  const sectionHeaderRow = sheet.addRow(['Domain Scores']);
  sectionHeaderRow.font = { bold: true, size: 13, color: { argb: COLORS.subtitleBlue } };
  sheet.addRow(['Domain', 'Section Score (RU)']);
  const domainHeaderRow = sheet.getRow(sheet.rowCount);
  styleHeaderRow(domainHeaderRow);

  const dampingFactor = options.configuration.scoringConfiguration.dampingFactor;

  for (const domain of options.configuration.domains) {
    const sectionScore = computeSectionScore(domain, options.answers, dampingFactor);
    const row = sheet.addRow([`${domain.domainIndex}. ${domain.name}`, sectionScore]);
    applyMeasurementFill(row.getCell(2), sectionScore);
  }

  // Overall row
  const overallRow = sheet.addRow(['Overall', options.liveScore.raw]);
  overallRow.font = { bold: true };
  overallRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.overallRow },
    };
  });
  applyMeasurementFill(overallRow.getCell(2), options.liveScore.raw);

  // ── Rating scale reference ─────────────────────────────────────
  sheet.addRow([]);
  const scaleHeader = sheet.addRow(['Rating Scale']);
  scaleHeader.font = { bold: true, size: 13 };
  const scaleLabels: [string, string, string][] = [
    ['0–25%', 'Low', COLORS.rating.Low.fill],
    ['26–50%', 'Moderate', COLORS.rating.Moderate.fill],
    ['51–75%', 'Elevated', COLORS.rating.Elevated.fill],
    ['76–100%', 'Critical', COLORS.rating.Critical.fill],
  ];
  for (const [range, label, fillColor] of scaleLabels) {
    const row = sheet.addRow([range, label]);
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
    });
    const style = COLORS.rating[label];
    if (style) {
      row.getCell(2).font = { bold: true, color: { argb: style.font } };
    }
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
  const sheet = workbook.addWorksheet('Questionnaire', {
    properties: { tabColor: { argb: COLORS.questionnaireTab } },
  });

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
  styleHeaderRow(headerRow);

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

  // Cycling domain fill by index (Material Design -50 tints)
  const domainFill = COLORS.domainFills[(domain.domainIndex - 1) % COLORS.domainFills.length];
  const thinBorder: Partial<ExcelJS.Borders> = {
    top:    { style: 'thin', color: { argb: COLORS.thinBorder } },
    bottom: { style: 'thin', color: { argb: COLORS.thinBorder } },
    left:   { style: 'thin', color: { argb: COLORS.thinBorder } },
    right:  { style: 'thin', color: { argb: COLORS.thinBorder } },
  };

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

    // Domain tint on every row
    row.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: domainFill },
      };
      cell.border = thinBorder;
    });

    // Weight tier fill on the Weight Tier cell (col 5)
    const tierFill = COLORS.weightTier[question.weightTier];
    if (tierFill) {
      row.getCell(5).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: tierFill },
      };
    }

    // Measurement gradient on the Measurement cell (col 9)
    const measurement = answer?.measurement ?? 0;
    applyMeasurementFill(row.getCell(9), measurement);
  }
}

// ────────────────────────────────────────────────────────────────────
// Sheet Protection
// ────────────────────────────────────────────────────────────────────

function applySheetProtection(sheet: ExcelJS.Worksheet): void {
  sheet.protect('asr-readonly', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: true,
    formatColumns: true,
    formatRows: true,
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
// Shared styling helpers
// ────────────────────────────────────────────────────────────────────

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true, color: { argb: COLORS.headerFont } };
  row.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.headerFill },
    };
    cell.alignment = { wrapText: true, vertical: 'top' };
    cell.border = {
      bottom: { style: 'medium', color: { argb: COLORS.thickBorder } },
    };
  });
}

// ────────────────────────────────────────────────────────────────────
// Measurement gradient — green(4CAF50) → amber(FFC107) → red(C62828)
// Midpoint at 42, max at 85. Zero → white.
// ────────────────────────────────────────────────────────────────────

const GRADIENT_MIN = 1;
const GRADIENT_MID = 42;
const GRADIENT_MAX = 85;

function applyMeasurementFill(cell: ExcelJS.Cell, measurement: number): void {
  let fillArgb: string = COLORS.zeroWhite;

  if (measurement > 0) {
    fillArgb = interpolateGradientColor(measurement);
  }

  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: fillArgb },
  };
}

function interpolateGradientColor(value: number): string {
  const clamped = Math.max(GRADIENT_MIN, Math.min(GRADIENT_MAX, value));

  // Parse the three stops (strip leading 'FF' alpha prefix)
  const greenRgb = parseHexRgb(COLORS.gradientGreen.slice(2));
  const amberRgb = parseHexRgb(COLORS.gradientAmber.slice(2));
  const redRgb   = parseHexRgb(COLORS.gradientRed.slice(2));

  let red: number;
  let green: number;
  let blue: number;

  if (clamped <= GRADIENT_MID) {
    const ratio = (clamped - GRADIENT_MIN) / (GRADIENT_MID - GRADIENT_MIN);
    red   = Math.round(greenRgb[0] + (amberRgb[0] - greenRgb[0]) * ratio);
    green = Math.round(greenRgb[1] + (amberRgb[1] - greenRgb[1]) * ratio);
    blue  = Math.round(greenRgb[2] + (amberRgb[2] - greenRgb[2]) * ratio);
  } else {
    const ratio = (clamped - GRADIENT_MID) / (GRADIENT_MAX - GRADIENT_MID);
    red   = Math.round(amberRgb[0] + (redRgb[0] - amberRgb[0]) * ratio);
    green = Math.round(amberRgb[1] + (redRgb[1] - amberRgb[1]) * ratio);
    blue  = Math.round(amberRgb[2] + (redRgb[2] - amberRgb[2]) * ratio);
  }

  return `FF${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function parseHexRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

function toHex(value: number): string {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0').toUpperCase();
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
