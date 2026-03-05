import {
  Box,
  Card,
  CardContent,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material';
import RskChip, {
  WEIGHT_CHIP_COLORS,
  measurementColor,
} from './RskChip';
import type { QuestionConfig, AnswerState } from '../lib/types';

// ════════════════════════════════════════════════════════════════════
// QuestionCard
// ════════════════════════════════════════════════════════════════════
// Individual question with choice radios, N/A option, notes,
// and uniform RskChip row for Weight + Question score + compliance.

interface QuestionCardProps {
  question: QuestionConfig;
  answer: AnswerState;
  onAnswerChange: (answer: AnswerState) => void;
  disabled: boolean;
  weightValue: number;
  classificationFactor: number;
  /** Max possible measurement for color scaling — classificationFactor itself */
  maxMeasurement: number;
}

export default function QuestionCard({
  question,
  answer,
  onAnswerChange,
  disabled,
  weightValue,
  classificationFactor,
  maxMeasurement,
}: QuestionCardProps) {
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

  return (
    <Card variant="outlined" sx={{ mb: 1.5 }}>
      <CardContent sx={{ pb: '12px !important' }}>
        {/* Header row */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 1 }}>
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

        {/* Chip row — Weight + Question score + compliance refs */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 0.5,
            ml: 4,
            mb: 1,
          }}
        >
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
        </Box>

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
      </CardContent>
    </Card>
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
