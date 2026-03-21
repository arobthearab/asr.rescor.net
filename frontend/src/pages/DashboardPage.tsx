import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
  Paper,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ClearIcon from '@mui/icons-material/Clear';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import PeopleIcon from '@mui/icons-material/People';
import EditNoteIcon from '@mui/icons-material/EditNote';
import DescriptionIcon from '@mui/icons-material/Description';
import TableChartIcon from '@mui/icons-material/TableChart';
import { brandColors } from '../theme/theme';
import { fetchReviews, fetchVersions, fetchQuestionnaires, createReview, renameReview, deleteReview, downloadQuestionnaireDocx, downloadQuestionnaireXlsx, downloadTenantExport, importTenantData, fetchTenants } from '../lib/apiClient';
import type { TenantExportData, TenantImportResult, TenantSummary } from '../lib/apiClient';
import { useCurrentUser } from '../hooks/useCurrentUser';
import UserMenu from '../components/UserMenu';
import type { QuestionnaireTemplate } from '../lib/types';

// MUI extras for import dialog
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';

// ────────────────────────────────────────────────────────────────────
// Rating color map
// ────────────────────────────────────────────────────────────────────

const ratingColorMap: Record<string, string> = {
  Low: brandColors.ratingLow,
  Moderate: brandColors.ratingModerate,
  Elevated: brandColors.ratingElevated,
  Critical: brandColors.ratingCritical,
};

// ────────────────────────────────────────────────────────────────────
// Dashboard
// ────────────────────────────────────────────────────────────────────

interface ReviewSummary {
  reviewId: string;
  applicationName: string;
  assessor: string;
  status: string;
  rating: string | null;
  rskNormalized: number | null;
  questionnaireVersion: string | null;
  questionnaireName: string | null;
  created: string;
}

// ────────────────────────────────────────────────────────────────────
// Compact cell style
// ────────────────────────────────────────────────────────────────────

const compactCell = { py: 0.5, px: 1.5, fontSize: '0.8125rem' } as const;
const compactHeadCell = { ...compactCell, fontWeight: 700 } as const;

// ────────────────────────────────────────────────────────────────────
// Sort helpers
// ────────────────────────────────────────────────────────────────────

type SortColumn = 'applicationName' | 'assessor' | 'status' | 'rating' | 'rskNormalized' | 'questionnaire' | 'version' | 'created';
type SortDirection = 'asc' | 'desc';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState<ReviewSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [applicationName, setApplicationName] = useState('');
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireTemplate[]>([]);
  const [selectedQuestionnaireId, setSelectedQuestionnaireId] = useState('');
  const { canCreate, canEdit, isAdmin, user } = useCurrentUser();

  // Filter state
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [ratingFilter, setRatingFilter] = useState<string>('');
  const [assessorFilter, setAssessorFilter] = useState<string>('');

  // Sort state
  const [sortColumn, setSortColumn] = useState<SortColumn>('created');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Version hash → display map (e.g. "e54c6e3711d9" → { number: "v1", label: "..." })
  const [versionMap, setVersionMap] = useState<Record<string, { number: string; label: string; ordinal: number }>>({});

  // Rename dialog
  const [renameTarget, setRenameTarget] = useState<ReviewSummary | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<ReviewSummary | null>(null);

  // Tenant export/import state
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importData, setImportData] = useState<TenantExportData | null>(null);
  const [importTargetTenantId, setImportTargetTenantId] = useState('');
  const [importConflictStrategy, setImportConflictStrategy] = useState('reject');
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<TenantImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    fetchReviews()
      .then((data) => setReviews(data as ReviewSummary[]))
      .catch((error) => console.error('[asr] fetchReviews failed:', error))
      .finally(() => setLoading(false));
    fetchVersions().then((data) => {
      const payload = data as { versions: { version: string; label: string | null; created: string }[] };
      const sorted = [...payload.versions].sort(
        (a, b) => new Date(a.created).getTime() - new Date(b.created).getTime(),
      );
      const map: Record<string, { number: string; label: string; ordinal: number }> = {};
      sorted.forEach((snapshot, index) => {
        map[snapshot.version] = {
          number: `v${index + 1}`,
          label: snapshot.label || snapshot.version,
          ordinal: index + 1,
        };
      });
      setVersionMap(map);
    }).catch(() => { /* versions endpoint unavailable — fall back to hash */ });
    fetchQuestionnaires()
      .then((data) => {
        setQuestionnaires(data);
        const active = data.filter((q) => q.active);
        if (active.length === 1) setSelectedQuestionnaireId(active[0].questionnaireId);
      })
      .catch(() => { /* questionnaires endpoint unavailable */ });
  }, []);

  // Fetch tenants for admin export/import controls
  useEffect(() => {
    if (isAdmin) {
      fetchTenants()
        .then((data) => {
          setTenants(data);
          const defaultTenantId = user?.tenantId || (data.length === 1 ? data[0].tenantId : '');
          if (defaultTenantId) setImportTargetTenantId(defaultTenantId);
        })
        .catch(() => { /* tenants endpoint unavailable */ });
    }
  }, [isAdmin, user?.tenantId]);

  // ── Version display helper ──────────────────────────────────────

  const versionDisplay = useCallback(
    (hash: string | null): { text: string; tooltip: string; ordinal: number } => {
      if (!hash) return { text: 'v0', tooltip: 'Pre-versioning', ordinal: 0 };
      const entry = versionMap[hash];
      if (entry) return { text: entry.number, tooltip: entry.label, ordinal: entry.ordinal };
      return { text: hash.slice(0, 8), tooltip: hash, ordinal: -1 };
    },
    [versionMap],
  );

  // ── Derived values for filter dropdowns ─────────────────────────

  const assessors = useMemo(
    () => [...new Set(reviews.map((review) => review.assessor))].sort(),
    [reviews],
  );
  const statuses = useMemo(
    () => [...new Set(reviews.map((review) => review.status))].sort(),
    [reviews],
  );
  const ratings = useMemo(
    () => [...new Set(reviews.map((review) => review.rating).filter(Boolean) as string[])].sort(),
    [reviews],
  );

  // ── Filtered + sorted reviews ───────────────────────────────────

  const filteredReviews = useMemo(() => {
    const lowerSearch = searchText.toLowerCase();
    const filtered = reviews.filter((review) => {
      if (searchText && !review.applicationName.toLowerCase().includes(lowerSearch)) return false;
      if (statusFilter && review.status !== statusFilter) return false;
      if (ratingFilter && review.rating !== ratingFilter) return false;
      if (assessorFilter && review.assessor !== assessorFilter) return false;
      return true;
    });

    const comparator = (a: ReviewSummary, b: ReviewSummary): number => {
      let result = 0;
      switch (sortColumn) {
        case 'applicationName':
          result = a.applicationName.localeCompare(b.applicationName);
          break;
        case 'assessor':
          result = a.assessor.localeCompare(b.assessor);
          break;
        case 'status':
          result = a.status.localeCompare(b.status);
          break;
        case 'rating':
          result = (a.rating || '').localeCompare(b.rating || '');
          break;
        case 'rskNormalized':
          result = (a.rskNormalized ?? -1) - (b.rskNormalized ?? -1);
          break;
        case 'questionnaire':
          result = (a.questionnaireName || '').localeCompare(b.questionnaireName || '');
          break;
        case 'version':
          result = versionDisplay(a.questionnaireVersion).ordinal - versionDisplay(b.questionnaireVersion).ordinal;
          break;
        case 'created':
          result = new Date(a.created).getTime() - new Date(b.created).getTime();
          break;
      }
      return sortDirection === 'asc' ? result : -result;
    };

    return [...filtered].sort(comparator);
  }, [reviews, searchText, statusFilter, ratingFilter, assessorFilter, sortColumn, sortDirection, versionDisplay]);

  const hasActiveFilters = searchText || statusFilter || ratingFilter || assessorFilter;

  function clearFilters(): void {
    setSearchText('');
    setStatusFilter('');
    setRatingFilter('');
    setAssessorFilter('');
  }

  function handleSort(column: SortColumn): void {
    if (sortColumn === column) {
      setSortDirection((previous) => (previous === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }

  // ── Create ──────────────────────────────────────────────────────

  async function handleCreate(): Promise<void> {
    if (applicationName.trim()) {
      const questionnaireId = selectedQuestionnaireId || undefined;
      const result = (await createReview(applicationName.trim(), '', questionnaireId)) as Record<string, unknown>;
      const created = (result.review ?? result) as ReviewSummary;
      setDialogOpen(false);
      setApplicationName('');
      navigate(`/review/${created.reviewId}`);
    }
  }

  // ── Rename ──────────────────────────────────────────────────────

  function openRename(event: React.MouseEvent, review: ReviewSummary): void {
    event.stopPropagation();
    setRenameTarget(review);
    setRenameValue(review.applicationName);
  }

  async function handleRename(): Promise<void> {
    if (!renameTarget || !renameValue.trim()) return;
    await renameReview(renameTarget.reviewId, renameValue.trim());
    setReviews((previous) =>
      previous.map((review) =>
        review.reviewId === renameTarget.reviewId
          ? { ...review, applicationName: renameValue.trim() }
          : review,
      ),
    );
    setRenameTarget(null);
  }

  // ── Delete ──────────────────────────────────────────────────────

  function openDelete(event: React.MouseEvent, review: ReviewSummary): void {
    event.stopPropagation();
    setDeleteTarget(review);
  }

  async function handleDelete(): Promise<void> {
    if (!deleteTarget) return;
    await deleteReview(deleteTarget.reviewId);
    setReviews((previous) => previous.filter((review) => review.reviewId !== deleteTarget.reviewId));
    setDeleteTarget(null);
  }

  // ── Export/Import ─────────────────────────────────────────────

  async function handleExport(): Promise<void> {
    const tenantId = user?.tenantId || tenants[0]?.tenantId;
    if (!tenantId) return;
    setExportLoading(true);
    try {
      await downloadTenantExport(tenantId);
    } catch (error) {
      console.error('[asr] export failed:', error);
    } finally {
      setExportLoading(false);
    }
  }

  function handleImportFileSelect(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as TenantExportData;
        if (!parsed?.manifest?.formatVersion) {
          setImportError('Invalid export file: missing manifest');
        } else {
          setImportData(parsed);
          setImportError(null);
          setImportResult(null);
        }
      } catch {
        setImportError('Invalid JSON file');
        setImportData(null);
      }
    };
    reader.readAsText(file);
  }

  function openImportDialog(): void {
    setImportDialogOpen(true);
    setImportData(null);
    setImportResult(null);
    setImportError(null);
    setImportConflictStrategy('reject');
  }

  function closeImportDialog(): void {
    setImportDialogOpen(false);
    setImportData(null);
    setImportResult(null);
    setImportError(null);
  }

  async function handleImport(): Promise<void> {
    if (!importData || !importTargetTenantId) return;
    setImportLoading(true);
    setImportError(null);
    try {
      const result = await importTenantData(importTargetTenantId, importData, {
        conflictStrategy: importConflictStrategy,
      });
      setImportResult(result);
      // Refresh reviews after successful import
      fetchReviews()
        .then((data) => setReviews(data as ReviewSummary[]))
        .catch(() => {});
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setImportLoading(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div">
            Application Security Review
          </Typography>
          {canCreate && (
            <Button
              variant="outlined"
              color="inherit"
              startIcon={<AddIcon />}
              onClick={() => setDialogOpen(true)}
              sx={{ ml: 2 }}
            >
              New Review
            </Button>
          )}
          <Tooltip title="Download Questionnaire (Word)">
            <IconButton color="inherit" onClick={() => downloadQuestionnaireDocx()}>
              <DescriptionIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Download Questionnaire (Excel)">
            <IconButton color="inherit" onClick={() => downloadQuestionnaireXlsx()}>
              <TableChartIcon />
            </IconButton>
          </Tooltip>
          <Box sx={{ flexGrow: 1 }} />
          {isAdmin && (
            <Tooltip title="Questionnaire Editor">
              <IconButton color="inherit" onClick={() => navigate('/admin/questionnaire')}>
                <EditNoteIcon />
              </IconButton>
            </Tooltip>
          )}
          {isAdmin && (
            <Tooltip title="Manage Users">
              <IconButton color="inherit" onClick={() => navigate('/admin/users')}>
                <PeopleIcon />
              </IconButton>
            </Tooltip>
          )}
          {isAdmin && (
            <Tooltip title="Export Tenant Data">
              <span>
                <IconButton color="inherit" onClick={handleExport} disabled={exportLoading || tenants.length === 0}>
                  <FileDownloadIcon />
                </IconButton>
              </span>
            </Tooltip>
          )}
          {isAdmin && (
            <Tooltip title="Import Tenant Data">
              <IconButton color="inherit" onClick={openImportDialog}>
                <FileUploadIcon />
              </IconButton>
            </Tooltip>
          )}
          <UserMenu />
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 3 }}>
        {/* ── Filter bar ──────────────────────────────────────────── */}
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} alignItems="center" flexWrap="wrap" useFlexGap>
          <TextField
            size="small"
            placeholder="Search application…"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            slotProps={{
              input: {
                endAdornment: searchText ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchText('')}><ClearIcon fontSize="small" /></IconButton>
                  </InputAdornment>
                ) : undefined,
              },
            }}
            sx={{ minWidth: 200 }}
          />
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} label="Status" onChange={(event) => setStatusFilter(event.target.value)}>
              <MenuItem value="">All</MenuItem>
              {statuses.map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Rating</InputLabel>
            <Select value={ratingFilter} label="Rating" onChange={(event) => setRatingFilter(event.target.value)}>
              <MenuItem value="">All</MenuItem>
              {ratings.map((rating) => <MenuItem key={rating} value={rating}>{rating}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Assessor</InputLabel>
            <Select value={assessorFilter} label="Assessor" onChange={(event) => setAssessorFilter(event.target.value)}>
              <MenuItem value="">All</MenuItem>
              {assessors.map((assessor) => <MenuItem key={assessor} value={assessor}>{assessor}</MenuItem>)}
            </Select>
          </FormControl>
          {hasActiveFilters && (
            <Button size="small" onClick={clearFilters}>Clear</Button>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
            {filteredReviews.length} of {reviews.length}
          </Typography>
        </Stack>

        {/* ── Reviews table ───────────────────────────────────────── */}
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {([
                  ['applicationName', 'Application'],
                  ['assessor', 'Assessor'],
                  ['questionnaire', 'Questionnaire'],
                  ['status', 'Status'],
                  ['rating', 'Rating'],
                  ['rskNormalized', 'Score'],
                  ['version', 'Version'],
                  ['created', 'Created'],
                ] as [SortColumn, string][]).map(([column, label]) => (
                  <TableCell key={column} sx={compactHeadCell} sortDirection={sortColumn === column ? sortDirection : false}>
                    <TableSortLabel
                      active={sortColumn === column}
                      direction={sortColumn === column ? sortDirection : 'asc'}
                      onClick={() => handleSort(column)}
                    >
                      {label}
                    </TableSortLabel>
                  </TableCell>
                ))}
                {canEdit && <TableCell sx={compactHeadCell} />}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredReviews.map((review) => {
                const version = versionDisplay(review.questionnaireVersion);
                return (
                  <TableRow
                    key={review.reviewId}
                    hover
                    sx={{ cursor: 'pointer', '& td': compactCell }}
                    onClick={() => navigate(`/review/${review.reviewId}`)}
                  >
                    <TableCell>{review.applicationName}</TableCell>
                    <TableCell>{review.assessor}</TableCell>
                    <TableCell>
                      <Typography variant="caption" noWrap sx={{ maxWidth: 160, display: 'block' }}>
                        {review.questionnaireName || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={review.status}
                        size="small"
                        color={review.status === 'SUBMITTED' ? 'success' : 'default'}
                      />
                    </TableCell>
                    <TableCell>
                      {review.rating ? (
                        <Chip
                          label={review.rating}
                          size="small"
                          sx={{
                            minWidth: 80,
                            fontWeight: 700,
                            backgroundColor: ratingColorMap[review.rating] || brandColors.gray,
                            color: '#fff',
                          }}
                        />
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell>
                      {review.rskNormalized != null
                        ? `${review.rskNormalized.toFixed(1)}%`
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Tooltip title={version.tooltip} arrow>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', cursor: 'help' }}>
                          {version.text}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      {new Date(review.created).toLocaleDateString()}
                    </TableCell>
                    {canEdit && (
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <IconButton size="small" onClick={(event) => openRename(event, review)} title="Rename">
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={(event) => openDelete(event, review)} title="Delete">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {filteredReviews.length === 0 && (
                <TableRow>
                  <TableCell colSpan={canEdit ? 9 : 8} align="center">
                    <Typography color="text.secondary" sx={{ py: 3, fontSize: '0.875rem' }}>
                      {loading
                        ? 'Loading assessments…'
                        : reviews.length === 0
                          ? 'No reviews yet. Click "New Review" to begin.'
                          : 'No reviews match the current filters.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Container>

      {/* ── New Review Dialog ──────────────────────────────────────── */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>New Application Security Review</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Application Name"
            value={applicationName}
            onChange={(event) => setApplicationName(event.target.value)}
          />
          {questionnaires.filter((q) => q.active).length > 1 && (
            <FormControl fullWidth margin="dense">
              <InputLabel>Questionnaire</InputLabel>
              <Select
                value={selectedQuestionnaireId}
                label="Questionnaire"
                onChange={(event) => setSelectedQuestionnaireId(event.target.value)}
              >
                {questionnaires.filter((q) => q.active).map((q) => (
                  <MenuItem key={q.questionnaireId} value={q.questionnaireId}>{q.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          {questionnaires.filter((q) => q.active).length === 1 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Questionnaire: {questionnaires.find((q) => q.active)?.name}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Rename Dialog ──────────────────────────────────────────── */}
      <Dialog open={renameTarget !== null} onClose={() => setRenameTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Rename Assessment</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label="Application Name"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameTarget(null)}>Cancel</Button>
          <Button variant="contained" onClick={handleRename} disabled={!renameValue.trim()}>
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Confirmation Dialog ─────────────────────────────── */}
      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Delete Assessment</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete <strong>{deleteTarget?.applicationName}</strong>?
            This assessment will be archived and removed from the active list.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Import Tenant Data Dialog ──────────────────────────────── */}
      <Dialog open={importDialogOpen} onClose={closeImportDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Import Tenant Data</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {/* File picker */}
            <Button variant="outlined" component="label">
              Select Export File (.json)
              <input type="file" accept=".json" hidden onChange={handleImportFileSelect} />
            </Button>

            {/* Manifest preview */}
            {importData && (
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Typography variant="subtitle2" gutterBottom>Export Manifest</Typography>
                <Typography variant="body2">Source: <strong>{importData.manifest.sourceTenantName}</strong> ({importData.manifest.sourceTenantId})</Typography>
                <Typography variant="body2">Exported: {new Date(importData.manifest.exportedAt).toLocaleString()}</Typography>
                <Typography variant="body2">By: {importData.manifest.exportedBy || 'unknown'}</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Counts: {Object.entries(importData.manifest.counts).map(([key, value]) => `${key}: ${value}`).join(', ')}
                </Typography>
              </Paper>
            )}

            {/* Target tenant selector */}
            {tenants.length > 1 && (
              <FormControl fullWidth size="small">
                <InputLabel>Target Tenant</InputLabel>
                <Select
                  value={importTargetTenantId}
                  label="Target Tenant"
                  onChange={(event) => setImportTargetTenantId(event.target.value)}
                >
                  {tenants.map((tenant) => (
                    <MenuItem key={tenant.tenantId} value={tenant.tenantId}>
                      {tenant.name} ({tenant.tenantId})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {tenants.length === 1 && (
              <Typography variant="body2" color="text.secondary">
                Target: <strong>{tenants[0].name}</strong> ({tenants[0].tenantId})
              </Typography>
            )}

            {/* Conflict strategy */}
            <FormControl>
              <FormLabel>Conflict Strategy</FormLabel>
              <RadioGroup
                value={importConflictStrategy}
                onChange={(event) => setImportConflictStrategy(event.target.value)}
              >
                <FormControlLabel value="reject" control={<Radio size="small" />} label="Reject — fail if target has existing data" />
                <FormControlLabel value="merge" control={<Radio size="small" />} label="Merge — skip entities that already exist" />
                <FormControlLabel value="replace" control={<Radio size="small" />} label="Replace — wipe target data, then import" />
              </RadioGroup>
            </FormControl>

            {/* Result / error */}
            {importResult && (
              <Alert severity="success">
                Import successful. {Object.entries(importResult.counts).map(([key, value]) => `${key}: ${value}`).join(', ')}
                {importResult.warnings.length > 0 && (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    Warnings: {importResult.warnings.join('; ')}
                  </Typography>
                )}
              </Alert>
            )}
            {importError && <Alert severity="error">{importError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeImportDialog}>
            {importResult ? 'Close' : 'Cancel'}
          </Button>
          {!importResult && (
            <Button
              variant="contained"
              onClick={handleImport}
              disabled={!importData || !importTargetTenantId || importLoading}
              startIcon={importLoading ? <CircularProgress size={16} /> : undefined}
            >
              {importLoading ? 'Importing…' : 'Import'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
