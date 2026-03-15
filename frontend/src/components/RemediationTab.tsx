// ════════════════════════════════════════════════════════════════════
// RemediationTab — POAM / Remedial Action Plan for a review
// ════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
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
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import GavelIcon from '@mui/icons-material/Gavel';
import SaveIcon from '@mui/icons-material/Save';
import {
  addRemediationItem,
  fetchRemediation,
  generateRemediation,
  updateRemediationItem,
  updateRemediationStatus,
  acceptRisk,
} from '../lib/apiClient';
import { useCurrentUser } from '../hooks/useCurrentUser';
import type { RemediationItem, RemediationDetail, RemediationStatus, FunctionCode, ResponseType } from '../lib/types';

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

const RESPONSE_TYPE_LABELS: Record<ResponseType, string> = {
  CUSTOM: 'Custom',
  ACCEPT_RISK: 'Accept Risk',
  COMPENSATING_CONTROL: 'Compensating Control',
  REMEDIATION_SCHEDULED: 'Remediation Scheduled',
  RISK_TRANSFER: 'Risk Transfer',
  FALSE_POSITIVE: 'False Positive',
};

const RESPONSE_TYPE_DEFAULTS: Record<ResponseType, number> = {
  CUSTOM: 0,
  ACCEPT_RISK: 0,
  COMPENSATING_CONTROL: 40,
  REMEDIATION_SCHEDULED: 50,
  RISK_TRANSFER: 30,
  FALSE_POSITIVE: 100,
};

const compactCell = { py: 0.5, px: 1, fontSize: '0.8125rem' } as const;
const compactHeadCell = { ...compactCell, fontWeight: 700 } as const;

type SortColumn = 'domain' | 'measurement' | 'residual' | 'function' | 'status';
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

  // Expanded rows — keyed by "domainIndex:questionIndex"
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Inline editing state — keyed by remediationId
  const [editingAction, setEditingAction] = useState<Record<string, string>>({});
  const [editingFunction, setEditingFunction] = useState<Record<string, FunctionCode>>({});
  const [editingResponseType, setEditingResponseType] = useState<Record<string, ResponseType>>({});
  const [editingMitigation, setEditingMitigation] = useState<Record<string, number>>({});

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

  // ── Toggle row expansion ──────────────────────────────────────
  function toggleRow(key: string): void {
    setExpandedRows((previous) => {
      const next = new Set(previous);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

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

  // ── Add additional proposal to an answer ──────────────────────
  async function handleAddProposal(item: RemediationItem): Promise<void> {
    try {
      await addRemediationItem(reviewId, {
        domainIndex: item.domainIndex,
        questionIndex: item.questionIndex,
      });
      setSnackMessage('Added proposal');
      const key = `${item.domainIndex}:${item.questionIndex}`;
      setExpandedRows((previous) => new Set(previous).add(key));
      await loadItems();
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  }

  // ── Save inline edits for a single remediation ────────────────
  async function handleSaveRemediation(remediation: RemediationDetail): Promise<void> {
    const { remediationId } = remediation;
    try {
      await updateRemediationItem(reviewId, remediationId, {
        proposedAction: editingAction[remediationId] ?? remediation.proposedAction,
        assignedFunction: editingFunction[remediationId] ?? remediation.assignedFunction,
        responseType: editingResponseType[remediationId] ?? remediation.responseType,
        mitigationPercent: editingMitigation[remediationId] ?? remediation.mitigationPercent,
      });
      setSnackMessage('Saved');
      await loadItems();
      setEditingAction((previous) => { const next = { ...previous }; delete next[remediationId]; return next; });
      setEditingFunction((previous) => { const next = { ...previous }; delete next[remediationId]; return next; });
      setEditingResponseType((previous) => { const next = { ...previous }; delete next[remediationId]; return next; });
      setEditingMitigation((previous) => { const next = { ...previous }; delete next[remediationId]; return next; });
    } catch (error) {
      setErrorMessage((error as Error).message);
    }
  }

  // ── Response type change — auto-fill mitigation ───────────────
  function handleResponseTypeChange(remediationId: string, newType: ResponseType): void {
    setEditingResponseType((previous) => ({ ...previous, [remediationId]: newType }));
    if (newType !== 'CUSTOM') {
      setEditingMitigation((previous) => ({ ...previous, [remediationId]: RESPONSE_TYPE_DEFAULTS[newType] }));
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
      setSortDirection(column === 'measurement' || column === 'residual' ? 'desc' : 'asc');
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
        case 'residual':
          result = a.residualRU - b.residualRU;
          break;
        case 'function':
          result = a.responsibleFunction.localeCompare(b.responsibleFunction);
          break;
        case 'status': {
          const statusA = a.remediations[0]?.status || 'OPEN';
          const statusB = b.remediations[0]?.status || 'OPEN';
          result = statusA.localeCompare(statusB);
          break;
        }
      }
      return sortDirection === 'asc' ? result : -result;
    };
    return [...items].sort(compare);
  }, [items, sortColumn, sortDirection]);

  // ── Derived counts ────────────────────────────────────────────
  const openCount = items.filter((item) =>
    item.remediations.length === 0
    || item.remediations.some((r) => r.status === 'OPEN' || r.status === 'IN_PROGRESS')
  ).length;
  const hasUnplanned = items.some((item) => item.remediations.length === 0);

  // ── Detect unsaved edits ──────────────────────────────────────
  function hasEdits(remediationId: string): boolean {
    return remediationId in editingAction
      || remediationId in editingFunction
      || remediationId in editingResponseType
      || remediationId in editingMitigation;
  }

  // ── Render a single remediation sub-row ───────────────────────
  function renderRemediationRow(remediation: RemediationDetail, isFirst: boolean, _item: RemediationItem): React.ReactNode {
    const { remediationId, status: currentStatus } = remediation;
    const actionValue = remediationId in editingAction
      ? editingAction[remediationId]
      : remediation.proposedAction;
    const functionValue = remediationId in editingFunction
      ? editingFunction[remediationId]
      : remediation.assignedFunction;
    const responseTypeValue = remediationId in editingResponseType
      ? editingResponseType[remediationId]
      : remediation.responseType;
    const mitigationValue = remediationId in editingMitigation
      ? editingMitigation[remediationId]
      : remediation.mitigationPercent;

    return (
      <TableRow key={remediationId} sx={{ '& td': compactCell, backgroundColor: isFirst ? undefined : 'action.hover' }}>
        {/* Function */}
        <TableCell>
          {canManage && !isReadOnly ? (
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

        {/* Response Type */}
        <TableCell>
          {canManage && !isReadOnly ? (
            <FormControl size="small" variant="standard" sx={{ minWidth: 100 }}>
              <Select
                value={responseTypeValue}
                onChange={(event) => handleResponseTypeChange(remediationId, event.target.value as ResponseType)}
                sx={{ fontSize: '0.8125rem' }}
              >
                {Object.entries(RESPONSE_TYPE_LABELS).map(([code, label]) => (
                  <MenuItem key={code} value={code}>{label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
              {RESPONSE_TYPE_LABELS[responseTypeValue as ResponseType] || responseTypeValue}
            </Typography>
          )}
        </TableCell>

        {/* Proposed Action */}
        <TableCell sx={{ minWidth: 180 }}>
          {canManage && !isReadOnly ? (
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

        {/* Mitigation % */}
        <TableCell align="right">
          {canManage && !isReadOnly ? (
            <TextField
              size="small"
              variant="standard"
              type="number"
              slotProps={{ htmlInput: { min: 0, max: 100, style: { textAlign: 'right', fontSize: '0.8125rem', width: 48 } } }}
              value={mitigationValue}
              onChange={(event) => {
                const value = Math.max(0, Math.min(100, Number(event.target.value) || 0));
                setEditingMitigation((previous) => ({ ...previous, [remediationId]: value }));
              }}
            />
          ) : (
            <Typography variant="body2" sx={{ fontSize: '0.8125rem', fontFamily: 'monospace' }}>
              {mitigationValue}%
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
          {currentStatus === 'RISK_ACCEPTED' && remediation.riskAcceptedBy && (
            <Typography variant="caption" display="block" color="text.secondary">
              by {remediation.riskAcceptedBy}
            </Typography>
          )}
        </TableCell>

        {/* Actions */}
        {canManage && !isReadOnly && (
          <TableCell sx={{ whiteSpace: 'nowrap' }}>
            {hasEdits(remediationId) && (
              <Tooltip title="Save changes">
                <IconButton size="small" onClick={() => handleSaveRemediation(remediation)} color="primary">
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
          </TableCell>
        )}
      </TableRow>
    );
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
                <TableCell sx={compactHeadCell} padding="checkbox" />
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
                <TableCell sx={compactHeadCell} align="right">
                  <TableSortLabel
                    active={sortColumn === 'residual'}
                    direction={sortColumn === 'residual' ? sortDirection : 'desc'}
                    onClick={() => handleSort('residual')}
                  >
                    Residual
                  </TableSortLabel>
                </TableCell>
                <TableCell sx={compactHeadCell}>Mitigation</TableCell>
                <TableCell sx={{ ...compactHeadCell, width: 60 }}>Plans</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sortedItems.map((item) => {
                const rowKey = `${item.domainIndex}:${item.questionIndex}`;
                const isExpanded = expandedRows.has(rowKey);
                const remediationCount = item.remediations.length;

                return (
                  <React.Fragment key={rowKey}>
                    {/* ── Answer summary row ───────────────── */}
                    <TableRow
                      hover
                      sx={{ '& td': compactCell, cursor: remediationCount > 0 ? 'pointer' : undefined }}
                      onClick={() => { if (remediationCount > 0) toggleRow(rowKey); }}
                    >
                      {/* Expand/collapse */}
                      <TableCell padding="checkbox">
                        {remediationCount > 0 ? (
                          <IconButton size="small" onClick={(event) => { event.stopPropagation(); toggleRow(rowKey); }}>
                            {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                          </IconButton>
                        ) : null}
                      </TableCell>

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

                      {/* Residual RU */}
                      <TableCell align="right">
                        <Tooltip title={`${item.combinedMitigation}% combined mitigation`} arrow>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              color: item.residualRU > 50 ? 'error.main' : item.residualRU > 25 ? 'warning.main' : 'success.main',
                            }}
                          >
                            {item.residualRU}
                          </Typography>
                        </Tooltip>
                      </TableCell>

                      {/* Combined Mitigation */}
                      <TableCell>
                        {item.combinedMitigation > 0 ? (
                          <Chip label={`${item.combinedMitigation}%`} size="small" color="success" variant="outlined" />
                        ) : (
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8125rem' }}>—</Typography>
                        )}
                      </TableCell>

                      {/* Plan count + add button */}
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Chip
                            label={remediationCount}
                            size="small"
                            variant="outlined"
                            color={remediationCount === 0 ? 'default' : 'primary'}
                          />
                          {canManage && !isReadOnly && (
                            <Tooltip title="Add proposal">
                              <IconButton size="small" onClick={(event) => { event.stopPropagation(); handleAddProposal(item); }}>
                                <AddCircleOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>

                    {/* ── Expanded remediation sub-rows ────────── */}
                    {remediationCount > 0 && (
                      <TableRow>
                        <TableCell colSpan={7} sx={{ p: 0, borderBottom: isExpanded ? undefined : 'none' }}>
                          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell sx={compactHeadCell}>
                                    <TableSortLabel
                                      active={sortColumn === 'function'}
                                      direction={sortColumn === 'function' ? sortDirection : 'asc'}
                                      onClick={() => handleSort('function')}
                                    >
                                      Function
                                    </TableSortLabel>
                                  </TableCell>
                                  <TableCell sx={compactHeadCell}>Response Type</TableCell>
                                  <TableCell sx={compactHeadCell}>Proposed Action</TableCell>
                                  <TableCell sx={compactHeadCell} align="right">Mitig %</TableCell>
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
                                {item.remediations.map((remediation, index) =>
                                  renderRemediationRow(remediation, index === 0, item)
                                )}
                              </TableBody>
                            </Table>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
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
