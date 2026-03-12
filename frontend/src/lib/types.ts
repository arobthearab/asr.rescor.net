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
  domainIndex: number;
  questionIndex: number;
  text: string;
  weightTier: string;
  choices: string[];
  choiceScores: number[];
  naScore: number;
  applicability: string[];
}

export interface ComplianceRef {
  tag: string;      // NIST, FERPA, SOX, ISP, IISP
  code: string;     // GV.OC, §99.30, ISP 1.0, etc.
  tooltip?: string; // Full name shown on hover
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
}

export interface AnswerState {
  domainIndex: number;
  questionIndex: number;
  choiceIndex: number | null;    // null = unanswered, -1 = N/A
  choiceText: string;
  questionText?: string;         // snapshot from answer-time (version resilience)
  rawScore: number;
  weightTier: string;
  measurement: number;
  notes: string;
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
