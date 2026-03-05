import {
  Box,
  FormControl,
  FormControlLabel,
  Paper,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import type { ClassificationConfig, ClassificationChoice } from '../lib/types';

// ════════════════════════════════════════════════════════════════════
// ClassificationBanner
// ════════════════════════════════════════════════════════════════════
// Transcendental question — selected factor multiplies all scores.

interface ClassificationBannerProps {
  classification: ClassificationConfig;
  selectedChoice: string | null;
  onChoiceChange: (choice: ClassificationChoice) => void;
  disabled: boolean;
}

export default function ClassificationBanner({
  classification,
  selectedChoice,
  onChoiceChange,
  disabled,
}: ClassificationBannerProps) {
  const sorted = [...classification.choices].sort(
    (first, second) => first.sortOrder - second.sortOrder,
  );

  function handleChange(_event: React.ChangeEvent<HTMLInputElement>, value: string): void {
    const match = sorted.find((choice) => choice.text === value);
    if (match) {
      onChoiceChange(match);
    }
  }

  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        mb: 3,
        borderLeft: 4,
        borderColor: 'primary.main',
        backgroundColor: 'primary.50',
      }}
    >
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        {classification.text}
      </Typography>
      <FormControl component="fieldset" disabled={disabled}>
        <RadioGroup
          row
          value={selectedChoice ?? ''}
          onChange={handleChange}
        >
          {sorted.map((choice) => (
            <FormControlLabel
              key={choice.text}
              value={choice.text}
              control={<Radio size="small" />}
              label={
                <Box component="span">
                  {choice.text}
                  <Typography
                    component="span"
                    variant="caption"
                    sx={{ ml: 0.5, color: 'text.secondary' }}
                  >
                    ({choice.factor}%)
                  </Typography>
                </Box>
              }
            />
          ))}
        </RadioGroup>
      </FormControl>
    </Paper>
  );
}
