import { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import QuestionCard from './QuestionCard';
import RskChip, {
  measurementColor,
  COMPLIANCE_CHIP_COLORS,
} from './RskChip';
import ComplianceDetailDialog from './ComplianceDetailDialog';
import { rskAggregate } from '../lib/scoring';
import type { ComplianceRef, DomainConfig, AnswerState } from '../lib/types';

// ════════════════════════════════════════════════════════════════════
// DomainSection
// ════════════════════════════════════════════════════════════════════
// Collapsible accordion containing all QuestionCards for one domain.
// Shows a Section score chip and compliance reference chips.

interface DomainSectionProps {
  domain: DomainConfig;
  answers: Map<string, AnswerState>;
  onAnswerChange: (answer: AnswerState) => void;
  weightTierMap: Record<string, number>;
  classificationFactor: number;
  disabled: boolean;
  dampingFactor: number;
  deploymentArchetype: string | null;
  gateLabelMap: Record<string, string>;
}

function answerKey(domainIndex: number, questionIndex: number): string {
  return `${domainIndex}:${questionIndex}`;
}

export default function DomainSection({
  domain,
  answers,
  onAnswerChange,
  weightTierMap,
  classificationFactor,
  disabled,
  dampingFactor,
  deploymentArchetype,
  gateLabelMap,
}: DomainSectionProps) {
  const [expanded, setExpanded] = useState(true);
  const [selectedChip, setSelectedChip] = useState<ComplianceRef | null>(null);

  // Filter questions by deployment applicability
  const visibleQuestions = domain.questions.filter((question) => {
    const applicability = (question as { applicability?: string[] }).applicability ?? [];
    if (applicability.length === 0) return true;
    if (!deploymentArchetype) return true;
    return applicability.includes(deploymentArchetype);
  });

  // Collect answered measurements for this section
  const sectionMeasurements: number[] = [];
  let answeredCount = 0;
  for (const question of visibleQuestions) {
    const state = answers.get(answerKey(question.domainIndex, question.questionIndex));
    if (state != null && state.choiceIndex !== null) {
      answeredCount++;
      sectionMeasurements.push(state.measurement);
    }
  }
  const totalCount = visibleQuestions.length;
  const sectionScore = rskAggregate(sectionMeasurements, dampingFactor);
  const hasSectionScore = answeredCount > 0;

  // Max possible measurement for color scaling
  const maxMeasurement = classificationFactor > 0 ? classificationFactor : 80;

  // Build compliance chips from domain data
  const complianceChips: ComplianceRef[] = domain.complianceRefs ?? buildComplianceRefs(domain);

  return (
    <Accordion
      expanded={expanded}
      onChange={() => setExpanded(!expanded)}
      sx={{ mb: 1 }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 0.5 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ flex: 1, minWidth: 200 }}>
            {domain.domainIndex}. {domain.name}
          </Typography>

          {/* Progress counter */}
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
            {answeredCount}/{totalCount}
          </Typography>

          {/* Section score chip */}
          <RskChip
            tag="Section"
            value={hasSectionScore ? `${sectionScore} RU` : '—'}
            color={hasSectionScore ? measurementColor(sectionScore, maxMeasurement) : '#BDBDBD'}
            dimmed={!hasSectionScore}
          />

          {/* Domain-level compliance chips */}
          {complianceChips.map((chip) => (
            <RskChip
              key={`${chip.tag}-${chip.code}`}
              tag={chip.tag}
              value={chip.code}
              color={COMPLIANCE_CHIP_COLORS[chip.tag] ?? '#546E7A'}
              tooltip={chip.tooltip}
              onClick={
                chip.action === 'dialog'
                  ? () => setSelectedChip(chip)
                  : chip.action === 'link' && chip.url
                    ? () => window.open(chip.url, '_blank', 'noopener')
                    : undefined
              }
            />
          ))}
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        {visibleQuestions.map((question) => {
          const key = answerKey(question.domainIndex, question.questionIndex);
          const answerState = answers.get(key) ?? createEmptyAnswer(question);
          const weightValue = weightTierMap[question.weightTier] ?? 0;

          return (
            <QuestionCard
              key={key}
              question={question}
              answer={answerState}
              onAnswerChange={onAnswerChange}
              disabled={disabled}
              weightValue={weightValue}
              classificationFactor={classificationFactor}
              maxMeasurement={maxMeasurement}
              gateLabelMap={gateLabelMap}
            />
          );
        })}
      </AccordionDetails>

      <ComplianceDetailDialog chip={selectedChip} onClose={() => setSelectedChip(null)} />
    </Accordion>
  );
}

// ────────────────────────────────────────────────────────────────────
// createEmptyAnswer
// ────────────────────────────────────────────────────────────────────

function createEmptyAnswer(question: { questionId?: string | null; domainIndex: number; questionIndex: number; weightTier: string }): AnswerState {
  return {
    questionId: question.questionId ?? null,
    domainIndex: question.domainIndex,
    questionIndex: question.questionIndex,
    choiceIndex: null,
    choiceText: '',
    rawScore: 0,
    weightTier: question.weightTier,
    measurement: 0,
    notes: '',
  };
}

// ────────────────────────────────────────────────────────────────────
// buildComplianceRefs — derive ComplianceRef[] from raw domain fields
// ────────────────────────────────────────────────────────────────────

function buildComplianceRefs(domain: DomainConfig): ComplianceRef[] {
  const refs: ComplianceRef[] = [];

  // NIST CSF subcategories
  for (const code of domain.csfRefs ?? []) {
    refs.push({ tag: 'NIST', code });
  }

  // FERPA — extract §-references from the note text
  if (domain.ferpaNote) {
    const sectionMatches = domain.ferpaNote.match(/§[\d.]+/g);
    if (sectionMatches) {
      for (const section of sectionMatches) {
        refs.push({ tag: 'FERPA', code: section, tooltip: domain.ferpaNote });
      }
    }
  }

  // SOX — extract §-references from the note text
  if (domain.soxNote) {
    const sectionMatches = domain.soxNote.match(/§[\d.]+/g);
    if (sectionMatches) {
      for (const section of sectionMatches) {
        refs.push({ tag: 'SOX', code: section, tooltip: domain.soxNote });
      }
    }
  }

  // Client-specific policies (ISP / IISP)
  for (const code of domain.policyRefs ?? []) {
    const tag = code.startsWith('IISP') ? 'IISP' : 'ISP';
    refs.push({ tag, code });
  }

  return refs;
}
