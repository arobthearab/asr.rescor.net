// ════════════════════════════════════════════════════════════════════
// RemediationTab — POAM / Remedial Action Plan for a review
// ════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Tooltip,
  Typography,
  Paper,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import GavelIcon from '@mui/icons-material/Gavel';
import SaveIcon from '@mui/icons-material/Save';
import {
  fetchRemediation,
  generateRemediation,
  updateRemediationItem,
  updateRemediationStatus,
  acceptRisk,
} from '../lib/apiClient';
import { useCurrentUser } from '../hooks/useCurrentUser';
import type { RemediationItem, RemediationStatus, FunctionCode } from '../lib/types';

// ────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────

const FUNCTION_LABELS: Record<FunctionCode, string> = {
  LEGAL: 'Legal',
  ERM: 'Enterprise Risk Management',
  EA: 'Enterprise Architecture',
  SEPG: 'Security Engineering Process Group',
  SAE: 'Security Architecture / Engineering',
  GENERAL: 'General / Application Steward',
};

const STATUS_COLORS: Record<RemediationStatus, 'default' | 'warning' | 'success' | 'info'> = {
  OPEN: 'default',
  IN_PROGRESS: 'warning',
  COMPLETED: 'success',
  RISK_ACCEPTED: 'info',
};

const STATUS_LABELS: Record<RemediationStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  RISK_ACCEPTED: 'Risk Accepted',
};

const compactCell = { py: 0.5, px: 1, fontSize: '0.8125rem' } as const;
const compactHeadCell = { ...compactCell, fontWeight: 700 } as const;

type SortColumn = 'domain' | 'measurement' | 'function' | 'status';
type SortDirection = 'asc' | 'desc';

// ────────────────────────────────────────────────────────────────────
// Props
// ────────────────────────────────────────────────────────────────────

interface RemediationTabProps {
  reviewId: string;
  isReadOnly: boolean;
}

// ────────────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────────────

export default function RemediationTab({ reviewId, isReadOnly }: RemediationTabProps) {
  const { isAdmin, isReviewer } = useCurrentUser();
  const canManage = isAdmin || isReviewer;

  const [items, setItems] = useState<RemediationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [snackMessage, setSnackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Inline editing state — keyed by remediationId
  const [editingAction, setEditingAction] = useState<Record<string, string>>({});
  const [editingFunction, setEditingFunction] = useState<Record<string, FunctionCode>>({});

  // Sort state
  const [sortColumn, setSortColumn] = useState<SortColumn>('measurement');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // ── Load data ─────────────────────────────────────────────────
  const loadItems = useCallback(async () => {
    try {
      const data = await fetchRemediation(reviewId);
      setItems(data);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // ── Generate plan items ───────────────────────────────────────
  async function handleGenerate(): Promise<void> {
    try {
      const result = await generateRemediation(reviewId);
      setSnackMessage(`Generated ${result.created} remediation item(s)`);
      await loadItems();
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  }

  // ── Save inline edits for a single item ───────────────────────
  async function handleSaveItem(item: RemediationItem): Promise<void> {
    if (!item.remediation) return;
    const { remediationId } = item.remediation;
    try {
      await updateRemediationItem(reviewId, remediationId, {
        proposedAction: editingAction[remediationId] ?? item.remediation.proposedAction,
        assignedFunction: editingFunction[remediationId] ?? item.remediation.assignedFunction,
      });
      setSnackMessage('Saved');
      await loadItems();
      // Clear editing state for this item
      setEditingAction((previous) => { const next = { ...previous }; delete next[remediationId]; return next; });
      setEditingFunction((previous) => { const next = { ...previous }; delete next[remediationId]; return next; });
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  }

  // ── Status change ─────────────────────────────────────────────
  async function handleStatusChange(remediationId: string, newStatus: RemediationStatus): Promise<void> {
    try {
      await updateRemediationStatus(reviewId, remediationId, newStatus);
      setSnackMessage(`Status updated to ${STATUS_LABELS[newStatus]}`);
      await loadItems();
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  }

  // ── Accept risk ───────────────────────────────────────────────
  async function handleAcceptRisk(remediationId: string): Promise<void> {
    try {
      await acceptRisk(reviewId, remediationId);
      setSnackMessage('Risk accepted');
      await loadItems();
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  }

  // ── Sort logic ────────────────────────────────────────────────
  function handleSort(column: SortColumn): void {
    if (sortColumn === column) {
      setSortDirection((previous) => (previous === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDirection(column === 'measurement' ? 'desc' : 'asc');
    }
  }

  const sortedItems = useMemo(() => {
    const compare = (a: RemediationItem, b: RemediationItem): number => {
      let result = 0;
      switch (sortColumn) {
        case 'domain':
          result = a.domainIndex - b.domainIndex || a.questionIndex - b.questionIndex;
          break;
        case 'measurement':
          result = a.measurement - b.measurement;
          break;
        case 'function':
          result = a.responsibleFunction.localeCompare(b.responsibleFunction);
          break;
        case 'status': {
          const statusA = a.remediation?.status || 'OPEN';
          const statusB = b.remediation?.status || 'OPEN';
          result = statusA.localeCompare(statusB);
          break;
        }
      }
      return sortDirection === 'asc' ? result : -result;
    };
    return [...items].sort(compare);
  }, [items, sortColumn, sortDirection]);

  // ── Derived counts ────────────────────────────────────────────
  const openCount = items.filter((item) => !item.remediation || item.remediation.status === 'OPEN' || item.remediation.status === 'IN_PROGRESS').length;
  const hasUnplanned = items.some((item) => !item.remediation);

  // ── Check if current user is the review assessor (for accept-risk guard) ─
  // The API enforces the policy; this is just for UX disabling.

  // ── Detect unsaved edits ──────────────────────────────────────
  function hasEdits(remediationId: string): boolean {
    return remediationId in editingAction || remediationId in editingFunction;
  }

  // ── Render ────────────────────────────────────────────────────

  if (loading) {
    return <Typography sx={{ py: 4, textAlign: 'center' }} color="text.secondary">Loading remediation plan…</Typography>;
  }

  if (errorMessage) {
    return <Alert severity="error" sx={{ mb: 2 }}>{errorMessage}</Alert>;
  }

  return (
    <Box>
      {/* ── Header bar ──────────────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography variant="h6" component="div">
          Remedial Action Plan
        </Typography>
        <Chip label={`${openCount} open`} size="small" color={openCount > 0 ? 'warning' : 'success'} />
        <Typography variant="body2" color="text.secondary">
          {items.length} item{items.length !== 1 ? 's' : ''} above 25 RU threshold
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        {canManage && !isReadOnly && hasUnplanned && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<AutoFixHighIcon />}
            onClick={handleGenerate}
          >
            Generate Plan
          </Button>
        )}
      </Box>

      {items.length === 0 ? (
        <Alert severity="success" sx={{ mb: 2 }}>
          No questions exceed the 25 RU threshold. No remediation required.
        </Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={compactHeadCell}>
                  <TableSortLabel
                    active={sortColumn === 'domain'}
                    direction={sortColumn === 'domain' ? sortDirection : 'asc'}
                    onClick={() => handleSort('domain')}
                  >
                    Question
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={compactHeadCell}>Answer</TableCell>
                <TableCell sx={compactHeadCell} align="right">
                  <TableSortLabel
                    active={sortColumn === 'measurement'}
                    direction={sortColumn === 'measurement' ? sortDirection : 'desc'}
                    onClick={() => handleSort('measurement')}
                  >
                    RU
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={compactHeadCell}>
                  <TableSortLabel
                    active={sortColumn === 'function'}
                    direction={sortColumn === 'function' ? sortDirection : 'asc'}
                    onClick={() => handleSort('function')}
                  >
                    Function
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={compactHeadCell}>Proposed Action</TableCell>
                <TableCell sx={compactHeadCell}>
                  <TableSortLabel
                    active={sortColumn === 'status'}
                    direction={sortColumn === 'status' ? sortDirection : 'asc'}
                    onClick={() => handleSort('status')}
                  >
                    Status
                  </TableSortLabel>
                </TableCell>
                {canManage && !isReadOnly && <TableCell sx={compactHeadCell}>Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedItems.map((item) => {
                const remediationId = item.remediation?.remediationId;
                const currentStatus = item.remediation?.status || 'OPEN';
                const actionValue = remediationId && remediationId in editingAction
                  ? editingAction[remediationId]
                  : item.remediation?.proposedAction || '';
                const functionValue = remediationId && remediationId in editingFunction
                  ? editingFunction[remediationId]
                  : (item.remediation?.assignedFunction || item.responsibleFunction);

                return (
                  <TableRow key={`${item.domainIndex}:${item.questionIndex}`} sx={{ '& td': compactCell }}>
                    {/* Question */}
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        D{item.domainIndex}Q{item.questionIndex}
                      </Typography>
                      <Typography variant="body2" sx={{ fontSize: '0.8125rem', lineHeight: 1.3 }}>
                        {item.questionText}
                      </Typography>
                    </TableCell>

                    {/* Current answer */}
                    <TableCell sx={{ maxWidth: 160 }}>
                      <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
                        {item.choiceText}
                      </Typography>
                    </TableCell>

                    {/* Measurement (RU) */}
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 700, fontFamily: 'monospace', color: item.measurement > 50 ? 'error.main' : 'warning.main' }}
                      >
                        {item.measurement}
                      </Typography>
                    </TableCell>

                    {/* Function — inline editable */}
                    <TableCell>
                      {canManage && !isReadOnly && remediationId ? (
                        <FormControl size="small" variant="standard" sx={{ minWidth: 90 }}>
                          <Select
                            value={functionValue}
                            onChange={(event) => {
                              setEditingFunction((previous) => ({
                                ...previous,
                                [remediationId]: event.target.value as FunctionCode,
                              }));
                            }}
                            sx={{ fontSize: '0.8125rem' }}
                          >
                            {Object.entries(FUNCTION_LABELS).map(([code, label]) => (
                              <MenuItem key={code} value={code}>
                                <Tooltip title={label} placement="right" arrow>
                                  <span>{code}</span>
                                </Tooltip>
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      ) : (
                        <Tooltip title={FUNCTION_LABELS[functionValue as FunctionCode] || functionValue} arrow>
                          <Chip label={functionValue} size="small" variant="outlined" />
                        </Tooltip>
                      )}
                    </TableCell>

                    {/* Proposed Action — inline editable */}
                    <TableCell sx={{ minWidth: 200 }}>
                      {canManage && !isReadOnly && remediationId ? (
                        <TextField
                          size="small"
                          variant="standard"
                          fullWidth
                          multiline
                          maxRows={3}
                          placeholder="Describe remediation…"
                          value={actionValue}
                          onChange={(event) => {
                            setEditingAction((previous) => ({
                              ...previous,
                              [remediationId]: event.target.value,
                            }));
                          }}
                          slotProps={{ input: { sx: { fontSize: '0.8125rem' } } }}
                        />
                      ) : (
                        <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
                          {actionValue || '—'}
                        </Typography>
                      )}
                    </TableCell>

                    {/* Status chip */}
                    <TableCell>
                      <Chip
                        label={STATUS_LABELS[currentStatus as RemediationStatus] || currentStatus}
                        size="small"
                        color={STATUS_COLORS[currentStatus as RemediationStatus] || 'default'}
                      />
                      {currentStatus === 'RISK_ACCEPTED' && item.remediation?.riskAcceptedBy && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          by {item.remediation.riskAcceptedBy}
                        </Typography>
                      )}
                    </TableCell>

                    {/* Actions */}
                    {canManage && !isReadOnly && (
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {remediationId ? (
                          <>
                            {hasEdits(remediationId) && (
                              <Tooltip title="Save changes">
                                <IconButton size="small" onClick={() => handleSaveItem(item)} color="primary">
                                  <SaveIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {(currentStatus === 'OPEN' || currentStatus === 'IN_PROGRESS') && (
                              <Tooltip title="Mark completed">
                                <IconButton
                                  size="small"
                                  onClick={() => handleStatusChange(remediationId, 'COMPLETED')}
                                  color="success"
                                >
                                  <CheckCircleIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {currentStatus !== 'RISK_ACCEPTED' && (
                              <Tooltip title="Accept risk">
                                <span>
                                  <IconButton
                                    size="small"
                                    onClick={() => handleAcceptRisk(remediationId)}
                                    color="info"
                                    disabled={!canManage}
                                  >
                                    <GavelIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            )}
                            {currentStatus === 'COMPLETED' && (
                              <Tooltip title="Reopen">
                                <Button size="small" onClick={() => handleStatusChange(remediationId, 'OPEN')}>
                                  Reopen
                                </Button>
                              </Tooltip>
                            )}
                          </>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            Generate plan first
                          </Typography>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Snackbar
        open={snackMessage !== null}
        autoHideDuration={3000}
        onClose={() => setSnackMessage(null)}
        message={snackMessage}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
