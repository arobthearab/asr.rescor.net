import { Box, Button, CircularProgress } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import SendIcon from '@mui/icons-material/Send';
import DraftsIcon from '@mui/icons-material/Drafts';
import FileDownloadIcon from '@mui/icons-material/FileDownload';

// ════════════════════════════════════════════════════════════════════
// ReviewActions
// ════════════════════════════════════════════════════════════════════
// Save draft (localStorage + server), submit (lock), status display,
// and Excel export download.

interface ReviewActionsProps {
  onSaveDraft: () => void;
  onSaveServer: () => void;
  onSubmit: () => void;
  onDownloadExcel: () => void;
  saving: boolean;
  submitting: boolean;
  exporting: boolean;
  isSubmitted: boolean;
  hasUnsavedChanges: boolean;
}

export default function ReviewActions({
  onSaveDraft,
  onSaveServer,
  onSubmit,
  onDownloadExcel,
  saving,
  submitting,
  exporting,
  isSubmitted,
  hasUnsavedChanges,
}: ReviewActionsProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1.5,
        mt: 3,
        p: 2,
        borderTop: 1,
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        position: 'sticky',
        bottom: 0,
        zIndex: 10,
      }}
    >
      <Button
        variant="outlined"
        startIcon={<DraftsIcon />}
        onClick={onSaveDraft}
        disabled={isSubmitted}
      >
        Save Draft (Local)
      </Button>
      <Button
        variant="contained"
        startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveIcon />}
        onClick={onSaveServer}
        disabled={saving || isSubmitted}
      >
        {saving ? 'Saving…' : 'Save to Server'}
      </Button>
      <Button
        variant="outlined"
        color="secondary"
        startIcon={exporting ? <CircularProgress size={18} color="inherit" /> : <FileDownloadIcon />}
        onClick={onDownloadExcel}
        disabled={exporting}
      >
        {exporting ? 'Exporting…' : 'Download Excel'}
      </Button>
      <Box sx={{ flex: 1 }} />
      <Button
        variant="contained"
        color="success"
        startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
        onClick={onSubmit}
        disabled={submitting || isSubmitted}
      >
        {isSubmitted ? 'Submitted' : submitting ? 'Submitting…' : 'Submit Review'}
      </Button>
      {hasUnsavedChanges && !isSubmitted && (
        <Box
          sx={{
            alignSelf: 'center',
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: 'warning.main',
          }}
          title="Unsaved changes"
        />
      )}
    </Box>
  );
}
