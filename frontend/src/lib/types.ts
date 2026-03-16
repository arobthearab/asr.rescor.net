// ════════════════════════════════════════════════════════════════════
// Shared TypeScript types for ASR frontend
// ════════════════════════════════════════════════════════════════════

export interface ClassificationChoice {
  text: string;
  factor: number;
  sortOrder: number;
}

export interface ClassificationConfig {
  text: string;
  choices: ClassificationChoice[];
  naAllowed: boolean;
}

export interface QuestionConfig {
  questionId: string | null;
  domainIndex: number;
  questionIndex: number;
  text: string;
  weightTier: string;
  choices: string[];
  choiceScores: number[];
  naScore: number;
  applicability: string[];
  responsibleFunction: string | null;
}

export interface ComplianceRef {
  tag: string;         // NIST, FERPA, SOX, ISP, IISP
  code: string;        // GV.OC, §99.30, ISP 1.0, etc.
  tooltip?: string;    // Full name shown on hover
  action?: 'link' | 'dialog';  // Chip click behavior (undefined = tooltip only)
  url?: string;        // Target for action='link'
  description?: string; // Body text for action='dialog'
}

export interface DomainConfig {
  domainIndex: number;
  name: string;
  policyRefs: string[];
  csfRefs: string[];
  ferpaNote?: string;
  soxNote?: string;
  /** Enriched compliance references with tooltips — built by config route */
  complianceRefs?: ComplianceRef[];
  questions: QuestionConfig[];
}

export interface WeightTier {
  name: string;
  value: number;
}

export interface SourceChoice {
  text: string;
  source: string;
  sortOrder: number;
}

export interface SourceConfig {
  text: string;
  choices: SourceChoice[];
  naAllowed: boolean;
}

export interface EnvironmentChoice {
  text: string;
  environment: string;
  sortOrder: number;
}

export interface EnvironmentConfig {
  text: string;
  choices: EnvironmentChoice[];
  naAllowed: boolean;
}

export interface DeploymentArchetype {
  code: string;
  label: string;
  description: string;
  source: string;
  environment: string;
  sortOrder: number;
}

export interface AppConfiguration {
  scoringConfiguration: import('./scoring').ScoringConfiguration;
  questionnaireVersion: string | null;
  questionnaireLabel: string | null;
  classification: ClassificationConfig;
  source: SourceConfig;
  environment: EnvironmentConfig;
  archetypes: DeploymentArchetype[];
  domains: DomainConfig[];
  weightTiers: WeightTier[];
}

export interface QuestionnaireVersion {
  version: string;
  label: string;
  created: string;
  current: boolean;
  reviewCount: number;
}

export interface AnswerState {
  questionId: string | null;
  domainIndex: number;
  questionIndex: number;
  choiceIndex: number | null;    // null = unanswered, -1 = N/A
  choiceText: string;
  questionText?: string;         // snapshot from answer-time (version resilience)
  rawScore: number;
  weightTier: string;
  measurement: number;
  notes: string;
  gatedBy?: string | null;
}

export interface ReviewDetail {
  reviewId: string;
  applicationName: string;
  assessor: string;
  status: string;
  classificationChoice: string | null;
  classificationFactor: number | null;
  sourceChoice: string | null;
  environmentChoice: string | null;
  deploymentArchetype: string | null;
  questionnaireVersion: string | null;
  rskRaw: number;
  rskNormalized: number;
  rating: string;
  notes: string;
  created: string;
  updated: string;
}

// ════════════════════════════════════════════════════════════════════
// Remediation / POAM types
// ════════════════════════════════════════════════════════════════════

export type RemediationStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'RISK_ACCEPTED';

export type FunctionCode = 'LEGAL' | 'ERM' | 'EA' | 'SEPG' | 'SAE' | 'GENERAL';

export type ResponseType =
  | 'CUSTOM'
  | 'ACCEPT_RISK'
  | 'COMPENSATING_CONTROL'
  | 'REMEDIATION_SCHEDULED'
  | 'RISK_TRANSFER'
  | 'FALSE_POSITIVE';

export interface RemediationDetail {
  remediationId: string;
  proposedAction: string;
  assignedFunction: FunctionCode;
  assignedTo: string | null;
  status: RemediationStatus;
  responseType: ResponseType;
  mitigationPercent: number;
  riskAcceptedBy: string | null;
  riskAcceptedAt: string | null;
  completedAt: string | null;
  targetDate: string | null;
  notes: string;
  created: string | null;
  updated: string | null;
}

export interface RemediationItem {
  domainIndex: number;
  questionIndex: number;
  questionText: string;
  choiceText: string;
  rawScore: number;
  weightTier: string;
  measurement: number;
  responsibleFunction: FunctionCode;
  remediations: RemediationDetail[];
  combinedMitigation: number;
  residualRU: number;
}

// ════════════════════════════════════════════════════════════════════
// Questionnaire Draft types
// ════════════════════════════════════════════════════════════════════

export interface DraftSummary {
  draftId: string;
  label: string;
  status: 'DRAFT' | 'PUBLISHED';
  createdBy: string;
  created: string;
  updated: string;
}

export interface DraftQuestion {
  questionId: string | null;
  domainIndex: number;
  questionIndex: number;
  text: string;
  weightTier: string;
  choices: string[];
  choiceScores: number[];
  naScore: number;
  applicability: string[];
  guidance: string | null;
  responsibleFunction: string | null;
}

export interface DraftDomain {
  domainIndex: number;
  name: string;
  policyRefs: string[];
  csfRefs: string[];
  questions: DraftQuestion[];
}

export interface DraftData {
  domains: DraftDomain[];
  [key: string]: unknown;
}

export interface DraftDetail extends DraftSummary {
  data: DraftData;
}

// ════════════════════════════════════════════════════════════════════
// Gate Question types
// ════════════════════════════════════════════════════════════════════

export interface GateQuestion {
  gateId: string;
  function: string;
  text: string;
  choices: string[];
  sortOrder: number;
}

export interface GateAnswerData {
  choiceIndex: number;
  respondedBy: string;
  respondedAt: string;
  evidenceNotes: string;
}

export interface GateWithAnswer extends GateQuestion {
  answer: GateAnswerData | null;
}

export interface GatePreFillResult {
  gateId: string;
  choiceIndex: number;
  preFilledCount: number;
  preFilled: Array<{
    domainIndex: number;
    questionIndex: number;
    choiceText: string;
    rawScore: number;
  }>;
}
