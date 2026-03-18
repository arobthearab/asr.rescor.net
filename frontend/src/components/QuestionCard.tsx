import { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LockIcon from '@mui/icons-material/Lock';
import RskChip, {
  WEIGHT_CHIP_COLORS,
  measurementColor,
} from './RskChip';
import type { QuestionConfig, AnswerState } from '../lib/types';

// ════════════════════════════════════════════════════════════════════
// QuestionCard
// ════════════════════════════════════════════════════════════════════
// Collapsible question with choice radios, N/A option, notes,
// and uniform RskChip row for Weight + Question score + compliance.
// Gated (pre-filled) questions default to collapsed; all others
// default to expanded. Any question can be toggled by the user.

/** Humanize a raw gateId like LEGAL_FERPA → "Legal — FERPA" */
function humanizeGateId(gateId: string): string {
  const parts = gateId.split('_');
  if (parts.length < 2) return gateId;
  const func = parts[0].charAt(0) + parts[0].slice(1).toLowerCase();
  const rest = parts.slice(1).map((p) => p.charAt(0) + p.slice(1).toLowerCase()).join(' ');
  return `${func} — ${rest}`;
}

interface QuestionCardProps {
  question: QuestionConfig;
  answer: AnswerState;
  onAnswerChange: (answer: AnswerState) => void;
  disabled: boolean;
  weightValue: number;
  classificationFactor: number;
  /** Max possible measurement for color scaling — classificationFactor itself */
  maxMeasurement: number;
  /** Friendly labels for gate IDs (gateId → label). Falls back to humanized gateId. */
  gateLabelMap?: Record<string, string>;
}

export default function QuestionCard({
  question,
  answer,
  onAnswerChange,
  disabled,
  weightValue,
  classificationFactor,
  maxMeasurement,
  gateLabelMap,
}: QuestionCardProps) {
  const isGated = Boolean(answer.gatedBy);
  const [expanded, setExpanded] = useState(!isGated);

  function handleChoiceChange(
    _event: React.ChangeEvent<HTMLInputElement>,
    value: string,
  ): void {
    const choiceIndex = parseInt(value, 10);
    let rawScore = 0;
    let choiceText = '';

    if (choiceIndex === -1) {
      rawScore = question.naScore;
      choiceText = 'N/A';
    } else {
      rawScore = question.choiceScores[choiceIndex] ?? 0;
      choiceText = question.choices[choiceIndex] ?? '';
    }

    const measurement = computeMeasurement(rawScore, weightValue, classificationFactor);

    onAnswerChange({
      ...answer,
      choiceIndex,
      choiceText,
      rawScore,
      measurement,
    });
  }

  function handleNotesChange(event: React.ChangeEvent<HTMLInputElement>): void {
    onAnswerChange({ ...answer, notes: event.target.value });
  }

  const questionNumber = `${question.domainIndex}.${question.questionIndex + 1}`;
  const weightColor = WEIGHT_CHIP_COLORS[question.weightTier] || '#78909C';
  const isAnswered = answer.choiceIndex !== null;
  const displayMeasurement = isAnswered ? Math.ceil(answer.measurement) : 0;
  const gateLabel = isGated
    ? (gateLabelMap?.[answer.gatedBy!] ?? humanizeGateId(answer.gatedBy!))
    : '';

  return (
    <Accordion
      variant="outlined"
      expanded={expanded}
      onChange={() => setExpanded(!expanded)}
      disableGutters
      sx={{ mb: 1.5, '&:before': { display: 'none' } }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{ minHeight: 40, '& .MuiAccordionSummary-content': { my: 0.5, flexWrap: 'wrap', gap: 0.5, alignItems: 'center' } }}
      >
        {/* Question number + text */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', flex: 1, minWidth: 200, mr: 1 }}>
          <Typography
            variant="body2"
            fontWeight={700}
            sx={{ mr: 1, minWidth: 32, color: 'text.secondary' }}
          >
            {questionNumber}
          </Typography>
          <Typography variant="body2" sx={{ flex: 1 }}>
            {question.text}
          </Typography>
        </Box>

        {/* Chip row — Weight + Question score + gated indicator + answer preview */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
          <RskChip
            tag="Weight"
            value={question.weightTier}
            color={weightColor}
          />
          <RskChip
            tag="Question"
            value={isAnswered ? `${displayMeasurement} RU` : '—'}
            color={isAnswered ? measurementColor(displayMeasurement, maxMeasurement) : '#BDBDBD'}
            dimmed={!isAnswered}
          />
          {isGated && (
            <Chip
              icon={<LockIcon sx={{ fontSize: '0.8rem' }} />}
              label={`Auto-answered by ${gateLabel}`}
              size="small"
              variant="outlined"
              color="info"
              sx={{ fontSize: '0.7rem', height: 22 }}
            />
          )}
          {isAnswered && !expanded && (
            <Chip
              label={answer.choiceText}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.7rem', height: 22, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}
            />
          )}
        </Box>
      </AccordionSummary>

      <AccordionDetails sx={{ pt: 0, pb: 1.5, px: 2 }}>
        {/* Info alert for gated questions */}
        {isGated && (
          <Alert severity="info" sx={{ mb: 1, ml: 4 }}>
            This answer was pre-filled by <strong>{gateLabel}</strong>. You may select a different answer to override.
          </Alert>
        )}

        {/* Choice radios */}
        <RadioGroup
          value={answer.choiceIndex !== null ? String(answer.choiceIndex) : ''}
          onChange={handleChoiceChange}
        >
          {question.choices.map((choice, index) => (
            <FormControlLabel
              key={index}
              value={String(index)}
              disabled={disabled}
              control={<Radio size="small" sx={{ py: 0.25 }} />}
              label={
                <Typography variant="body2">
                  {choice}
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ ml: 0.5, color: 'text.disabled' }}
                  >
                    [{question.choiceScores[index]}]
                  </Typography>
                </Typography>
              }
              sx={{ mx: 0, ml: 4 }}
            />
          ))}
          <FormControlLabel
            value="-1"
            disabled={disabled}
            control={<Radio size="small" sx={{ py: 0.25 }} />}
            label={
              <Typography variant="body2" color="text.secondary">
                N/A
                <Typography
                  component="span"
                  variant="caption"
                  sx={{ ml: 0.5, color: 'text.disabled' }}
                >
                  [{question.naScore}]
                </Typography>
              </Typography>
            }
            sx={{ mx: 0, ml: 4 }}
          />
        </RadioGroup>

        {/* Notes */}
        <TextField
          size="small"
          placeholder="Notes (optional)"
          value={answer.notes}
          onChange={handleNotesChange}
          disabled={disabled}
          fullWidth
          multiline
          maxRows={3}
          sx={{ mt: 1, ml: 4, width: 'calc(100% - 32px)' }}
          slotProps={{ input: { sx: { fontSize: '0.8rem' } } }}
        />
      </AccordionDetails>
    </Accordion>
  );
}

// ────────────────────────────────────────────────────────────────────
// computeMeasurement — local helper (mirrors scoring.ts)
// ────────────────────────────────────────────────────────────────────

function computeMeasurement(
  rawScore: number,
  weightValue: number,
  classificationFactor: number,
): number {
  let answer = 0;

  if (rawScore > 0 && weightValue > 0 && classificationFactor > 0) {
    answer = Math.floor((rawScore / 100) * (weightValue / 100) * classificationFactor);
  }

  return answer;
}
