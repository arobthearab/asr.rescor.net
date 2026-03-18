import { Box, Chip, LinearProgress, Paper, Typography } from '@mui/material';
import { brandColors } from '../theme/theme';
import type { ScoringConfiguration, ScoreResult } from '../lib/scoring';

// ════════════════════════════════════════════════════════════════════
// ScoreDashboard
// ════════════════════════════════════════════════════════════════════
// Sticky panel showing live RSK score, normalized %, and rating chip.

interface DomainProgress {
  name: string;
  answered: number;
  total: number;
}

interface ScoreDashboardProps {
  score: ScoreResult;
  residualScore: ScoreResult | null;
  scoringConfiguration: ScoringConfiguration;
  answeredCount: number;
  totalCount: number;
  domainProgress?: DomainProgress[];
}

const RATING_COLORS: Record<string, string> = {
  Low: brandColors.ratingLow,
  Moderate: brandColors.ratingModerate,
  Elevated: brandColors.ratingElevated,
  Critical: brandColors.ratingCritical,
};

export default function ScoreDashboard({
  score,
  residualScore,
  scoringConfiguration,
  answeredCount,
  totalCount,
  domainProgress,
}: ScoreDashboardProps) {
  const progressPercent = totalCount > 0 ? (answeredCount / totalCount) * 100 : 0;
  const ratingColor = RATING_COLORS[score.rating] || brandColors.gray;
  const hasResidual = residualScore !== null && residualScore.normalized < score.normalized;
  const residualColor = hasResidual ? (RATING_COLORS[residualScore!.rating] || brandColors.gray) : ratingColor;

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
        {hasResidual ? 'Inherent Risk' : 'Risk Score'}
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
          mb: hasResidual ? 3 : 2,
          backgroundColor: '#e0e0e0',
          '& .MuiLinearProgress-bar': {
            backgroundColor: ratingColor,
            borderRadius: 4,
          },
        }}
      />

      {/* Residual risk (after remediation) */}
      {hasResidual && (
        <>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Residual Risk
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Chip
              label={residualScore!.rating}
              sx={{
                backgroundColor: residualColor,
                color: '#fff',
                fontWeight: 700,
                fontSize: '1rem',
                height: 36,
                mr: 1,
              }}
            />
            <Typography variant="h5" fontWeight={700}>
              {Math.ceil(residualScore!.normalized)} RU
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Raw: {residualScore!.raw} / {scoringConfiguration.rawMax}
          </Typography>
          <LinearProgress
            variant="determinate"
            value={Math.min(residualScore!.normalized, 100)}
            sx={{
              height: 8,
              borderRadius: 4,
              mb: 2,
              backgroundColor: '#e0e0e0',
              '& .MuiLinearProgress-bar': {
                backgroundColor: residualColor,
                borderRadius: 4,
              },
            }}
          />
        </>
      )}

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

      {/* Per-domain progress */}
      {domainProgress && domainProgress.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          {domainProgress.map((domain) => {
            return (
              <Box key={domain.name} sx={{ display: 'flex', alignItems: 'center', mb: 0.25 }}>
                <Typography
                  variant="caption"
                  sx={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', mr: 0.5 }}
                  title={domain.name}
                >
                  {domain.name}
                </Typography>
                <Typography variant="caption" color={domain.answered === domain.total ? 'success.main' : 'text.secondary'} sx={{ flexShrink: 0 }}>
                  {domain.answered}/{domain.total}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Thresholds legend */}
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Thresholds
        </Typography>
        {scoringConfiguration.ratingLabels.map((label, index) => {
          const lower = index === 0 ? 0 : scoringConfiguration.ratingThresholds[index - 1];
          const upper = scoringConfiguration.ratingThresholds[index] ?? 100;
          const color = RATING_COLORS[label] || brandColors.gray;

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
