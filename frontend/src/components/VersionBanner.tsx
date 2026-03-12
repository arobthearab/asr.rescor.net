import { Alert, AlertTitle } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

// ════════════════════════════════════════════════════════════════════
// VersionBanner — shown when a review uses a historical checklist
// ════════════════════════════════════════════════════════════════════

interface VersionBannerProps {
  reviewLabel: string | null;
  reviewVersion: string | null;
  currentVersion: string | null;
}

export default function VersionBanner({
  reviewLabel,
  reviewVersion,
  currentVersion,
}: VersionBannerProps) {
  const displayLabel = reviewLabel || reviewVersion || 'unknown';
  const displayCurrent = currentVersion || 'unknown';

  return (
    <Alert
      severity="info"
      icon={<InfoOutlinedIcon />}
      sx={{ mb: 2 }}
    >
      <AlertTitle>Historical checklist version</AlertTitle>
      This review uses checklist <strong>{displayLabel}</strong>.
      The current checklist version is <strong>{displayCurrent}</strong>.
    </Alert>
  );
}
