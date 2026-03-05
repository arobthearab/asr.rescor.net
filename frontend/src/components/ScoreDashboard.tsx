import { Box, Chip, LinearProgress, Paper, Typography } from '@mui/material';
import { strideColors } from '../theme/theme';
import type { ScoringConfiguration, ScoreResult } from '../lib/scoring';

// ════════════════════════════════════════════════════════════════════
// ScoreDashboard
// ════════════════════════════════════════════════════════════════════
// Sticky panel showing live RSK score, normalized %, and rating chip.

interface ScoreDashboardProps {
  score: ScoreResult;
  scoringConfiguration: ScoringConfiguration;
  answeredCount: number;
  totalCount: number;
}

const RATING_COLORS: Record<string, string> = {
  Low: strideColors.ratingLow,
  Moderate: strideColors.ratingModerate,
  Elevated: strideColors.ratingElevated,
  Critical: strideColors.ratingCritical,
};

export default function ScoreDashboard({
  score,
  scoringConfiguration,
  answeredCount,
  totalCount,
}: ScoreDashboardProps) {
  const progressPercent = totalCount > 0 ? (answeredCount / totalCount) * 100 : 0;
  const ratingColor = RATING_COLORS[score.rating] || strideColors.gray;

  return (
    <Paper
      elevation={3}
      sx={{
        p: 2,
        position: 'sticky',
        top: 80,
      }}
    >
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Risk Score
      </Typography>

      {/* Rating chip */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <Chip
          label={score.rating}
          sx={{
            backgroundColor: ratingColor,
            color: '#fff',
            fontWeight: 700,
            fontSize: '1rem',
            height: 36,
            mr: 1,
          }}
        />
        <Typography variant="h5" fontWeight={700}>
          {Math.ceil(score.normalized)} RU
        </Typography>
      </Box>

      {/* Raw score */}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        Raw: {score.raw} / {scoringConfiguration.rawMax}
      </Typography>

      {/* Normalized bar */}
      <LinearProgress
        variant="determinate"
        value={Math.min(score.normalized, 100)}
        sx={{
          height: 8,
          borderRadius: 4,
          mb: 2,
          backgroundColor: '#e0e0e0',
          '& .MuiLinearProgress-bar': {
            backgroundColor: ratingColor,
            borderRadius: 4,
          },
        }}
      />

      {/* Progress */}
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Progress
      </Typography>
      <Typography variant="body2" sx={{ mb: 0.5 }}>
        {answeredCount} of {totalCount} questions
      </Typography>
      <LinearProgress
        variant="determinate"
        value={progressPercent}
        sx={{
          height: 6,
          borderRadius: 3,
          backgroundColor: '#e0e0e0',
          '& .MuiLinearProgress-bar': {
            borderRadius: 3,
          },
        }}
      />

      {/* Thresholds legend */}
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Thresholds
        </Typography>
        {scoringConfiguration.ratingLabels.map((label, index) => {
          const lower = index === 0 ? 0 : scoringConfiguration.ratingThresholds[index - 1];
          const upper = scoringConfiguration.ratingThresholds[index] ?? 100;
          const color = RATING_COLORS[label] || strideColors.gray;

          return (
            <Box
              key={label}
              sx={{ display: 'flex', alignItems: 'center', mt: 0.25 }}
            >
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: color,
                  mr: 1,
                  flexShrink: 0,
                }}
              />
              <Typography variant="caption">
                {label}: {lower}–{upper}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}
