import { Box, Tooltip, type SxProps, type Theme } from '@mui/material';

// ════════════════════════════════════════════════════════════════════
// RskChip — unified fixed-width chip with two-line layout
// ════════════════════════════════════════════════════════════════════
//
// Layout:
//   ┌────────────┐
//   │  small(Tag) │
//   │   [Value]   │
//   └────────────┘
//
// All chips render at a standard width so they align in rows.
// Color is passed as a gradient-ready hex string.

export interface RskChipProps {
  /** Small upper label: Weight, Question, Section, NIST, FERPA, SOX, ISP, IISP */
  tag: string;
  /** Main display value: "High", "12 RU", "GV.OC", "§99.30", etc. */
  value: string;
  /** Background color (hex) */
  color: string;
  /** Optional tooltip on hover */
  tooltip?: string;
  /** Override chip width (default 80) */
  width?: number;
  /** Whether to dim the chip (unanswered state) */
  dimmed?: boolean;
  /** Extra sx overrides */
  sx?: SxProps<Theme>;
}

const STANDARD_WIDTH = 80;

export default function RskChip({
  tag,
  value,
  color,
  tooltip,
  width = STANDARD_WIDTH,
  dimmed = false,
  sx,
}: RskChipProps) {
  const chip = (
    <Box
      sx={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width,
        minHeight: 38,
        px: 0.5,
        py: 0.25,
        borderRadius: 1,
        backgroundColor: color,
        opacity: dimmed ? 0.35 : 1,
        color: '#fff',
        textAlign: 'center',
        lineHeight: 1.2,
        flexShrink: 0,
        userSelect: 'none',
        transition: 'opacity 0.2s',
        ...sx,
      }}
    >
      <Box
        component="span"
        sx={{
          fontSize: '0.55rem',
          fontWeight: 500,
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
          opacity: 0.85,
        }}
      >
        {tag}
      </Box>
      <Box
        component="span"
        sx={{
          fontSize: '0.72rem',
          fontWeight: 700,
          lineHeight: 1.15,
          mt: '1px',
        }}
      >
        {value}
      </Box>
    </Box>
  );

  if (tooltip) {
    return (
      <Tooltip title={tooltip} arrow placement="top">
        {chip}
      </Tooltip>
    );
  }

  return chip;
}

// ────────────────────────────────────────────────────────────────────
// Chip Color Palette — continuous gradient helpers
// ────────────────────────────────────────────────────────────────────

/** Weight tier colors */
export const WEIGHT_CHIP_COLORS: Record<string, string> = {
  Critical: '#B71C1C',
  High: '#E65100',
  Medium: '#F57F17',
  Info: '#78909C',
};

/** Question / Section measurement color based on RU value */
export function measurementColor(measurement: number, maxMeasurement: number): string {
  let result = '#78909C'; // neutral gray for zero

  if (measurement > 0 && maxMeasurement > 0) {
    const ratio = Math.min(measurement / maxMeasurement, 1);
    // Gradient: green (low risk) → amber → red (high risk)
    if (ratio < 0.33) {
      result = interpolateColor('#2E7D32', '#F9A825', ratio / 0.33);
    } else if (ratio < 0.66) {
      result = interpolateColor('#F9A825', '#EF6C00', (ratio - 0.33) / 0.33);
    } else {
      result = interpolateColor('#EF6C00', '#C62828', (ratio - 0.66) / 0.34);
    }
  }

  return result;
}

/** Compliance chip colors by framework */
export const COMPLIANCE_CHIP_COLORS: Record<string, string> = {
  NIST: '#1565C0',
  FERPA: '#6A1B9A',
  SOX: '#AD1457',
  ISP: '#00695C',
  IISP: '#2E7D32',
};

// ────────────────────────────────────────────────────────────────────
// Internal: linear color interpolation
// ────────────────────────────────────────────────────────────────────

function interpolateColor(startHex: string, endHex: string, ratio: number): string {
  const startRgb = hexToRgb(startHex);
  const endRgb = hexToRgb(endHex);
  const red = Math.round(startRgb.red + (endRgb.red - startRgb.red) * ratio);
  const green = Math.round(startRgb.green + (endRgb.green - startRgb.green) * ratio);
  const blue = Math.round(startRgb.blue + (endRgb.blue - startRgb.blue) * ratio);
  return `rgb(${red}, ${green}, ${blue})`;
}

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const clean = hex.replace('#', '');
  return {
    red: parseInt(clean.substring(0, 2), 16),
    green: parseInt(clean.substring(2, 4), 16),
    blue: parseInt(clean.substring(4, 6), 16),
  };
}
