import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HistoryIcon from '@mui/icons-material/History';
import PublishIcon from '@mui/icons-material/Publish';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/Upload';
import VisibilityIcon from '@mui/icons-material/Visibility';
import {
  createDraft,
  createQuestionnaire,
  deleteDraft,
  deleteQuestionnaireVersion,
  exportQuestionnaire,
  fetchConfigurationVersion,
  fetchDraft,
  fetchDrafts,
  fetchQuestionnaires,
  fetchVersions,
  importYaml,
  publishDraft,
  updateDraft,
} from '../lib/apiClient';
import type {
  DraftData,
  DraftDomain,
  DraftQuestion,
  DraftSummary,
  QuestionnaireTemplate,
  QuestionnaireVersion,
  WeightTier,
} from '../lib/types';
import { useCurrentUser } from '../hooks/useCurrentUser';
import UserMenu from '../components/UserMenu';

// ────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────

const WEIGHT_TIERS = ['Critical', 'High', 'Medium', 'Info'] as const;
const FUNCTIONS = ['LEGAL', 'ERM', 'EA', 'SEPG', 'SAE', 'GENERAL'] as const;

const compactField = { size: 'small' as const, variant: 'outlined' as const };

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function emptyQuestion(domainIndex: number, questionIndex: number): DraftQuestion {
  return {
    questionId: null,
    domainIndex,
    questionIndex,
    text: '',
    weightTier: 'Medium',
    choices: ['Yes', 'Partial', 'No'],
    choiceScores: [20, 50, 70],
    naScore: 1,
    applicability: [],
    guidance: null,
    responsibleFunction: 'GENERAL',
  };
}

function emptyDomain(domainIndex: number): DraftDomain {
  return {
    domainIndex,
    name: '',
    policyRefs: [],
    csfRefs: [],
    questions: [emptyQuestion(domainIndex, 0)],
  };
}

// ════════════════════════════════════════════════════════════════════
// QuestionnaireEditorPage
// ════════════════════════════════════════════════════════════════════

export default function QuestionnaireEditorPage() {
  const navigate = useNavigate();
  const { isAdmin } = useCurrentUser();

  // Draft list / picker
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftStatus, setDraftStatus] = useState<'DRAFT' | 'PUBLISHED'>('DRAFT');

  // Editor state
  const [domains, setDomains] = useState<DraftDomain[]>([]);
  const [dirty, setDirty] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [newDraftOpen, setNewDraftOpen] = useState(false);
  const [newDraftLabel, setNewDraftLabel] = useState('');

  // Version history
  const [versions, setVersions] = useState<QuestionnaireVersion[]>([]);
  const [deleteVersionTarget, setDeleteVersionTarget] = useState<QuestionnaireVersion | null>(null);

  // Delete draft confirmation
  const [deleteDraftTarget, setDeleteDraftTarget] = useState<DraftSummary | null>(null);

  // Questionnaire templates
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireTemplate[]>([]);
  const [newDraftQuestionnaireId, setNewDraftQuestionnaireId] = useState('');
  const [newQuestionnaireName, setNewQuestionnaireName] = useState('');

  // Questionnaire viewer
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerLabel, setViewerLabel] = useState('');
  const [viewerDomains, setViewerDomains] = useState<DraftDomain[]>([]);
  const [viewerWeightTiers, setViewerWeightTiers] = useState<WeightTier[]>([]);

  // ── Load drafts on mount ──────────────────────────────────────

  const loadDrafts = useCallback(async () => {
    try {
      const list = await fetchDrafts();
      setDrafts(list);
    } catch (error) {
      setToast({ message: (error as Error).message, severity: 'error' });
    }
  }, []);

  const loadVersions = useCallback(async () => {
    try {
      const data = (await fetchVersions()) as { versions: QuestionnaireVersion[] };
      setVersions(data.versions || []);
    } catch {
      // versions endpoint unavailable — leave empty
    }
  }, []);

  const loadQuestionnaires = useCallback(async () => {
    try {
      const data = await fetchQuestionnaires();
      setQuestionnaires(data);
      const active = data.filter((q) => q.active);
      if (active.length === 1) setNewDraftQuestionnaireId(active[0].questionnaireId);
    } catch {
      // questionnaires endpoint unavailable
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadDrafts();
    loadVersions();
    loadQuestionnaires();
  }, [isAdmin, loadDrafts, loadVersions, loadQuestionnaires]);

  // ── Open a draft for editing ──────────────────────────────────

  async function openDraft(draftId: string): Promise<void> {
    setLoading(true);
    try {
      const detail = await fetchDraft(draftId);
      setActiveDraftId(detail.draftId);
      setDraftLabel(detail.label);
      setDraftStatus(detail.status);
      setDomains(detail.data.domains || []);
      setDirty(false);
    } catch (error) {
      setToast({ message: (error as Error).message, severity: 'error' });
    } finally {
      setLoading(false);
    }
  }

  // ── Create new draft ──────────────────────────────────────────

  async function handleCreateDraft(): Promise<void> {
    setLoading(true);
    try {
      let questionnaireId = newDraftQuestionnaireId || undefined;
      const activeQuestionnaires = questionnaires.filter((q) => q.active);

      // No questionnaires exist — create one first
      if (activeQuestionnaires.length === 0) {
        const name = newQuestionnaireName.trim() || 'ASR Questionnaire';
        const created = await createQuestionnaire(name);
        questionnaireId = created.questionnaireId;
        await loadQuestionnaires();
      }

      const detail = await createDraft(newDraftLabel || undefined, questionnaireId);
      setActiveDraftId(detail.draftId);
      setDraftLabel(detail.label);
      setDraftStatus(detail.status);
      const loadedDomains = detail.data?.domains || [];
      setDomains(loadedDomains.length > 0 ? loadedDomains : [emptyDomain(0)]);
      setDirty(loadedDomains.length === 0);
      await loadDrafts();
      const message = loadedDomains.length > 0
        ? 'Draft created from live questionnaire.'
        : 'Empty draft created. Add domains and questions to build your questionnaire.';
      setToast({ message, severity: 'success' });
    } catch (error) {
      setToast({ message: (error as Error).message, severity: 'error' });
    } finally {
      setNewDraftOpen(false);
      setNewDraftLabel('');
      setNewQuestionnaireName('');
      setLoading(false);
    }
  }

  // ── Save draft ────────────────────────────────────────────────

  async function handleSave(): Promise<void> {
    if (!activeDraftId) return;
    setLoading(true);
    try {
      const data: DraftData = { domains };
      await updateDraft(activeDraftId, { label: draftLabel, data });
      setDirty(false);
      setToast({ message: 'Draft saved.', severity: 'success' });
    } catch (error) {
      setToast({ message: (error as Error).message, severity: 'error' });
    } finally {
      setLoading(false);
    }
  }

  // ── Publish draft ─────────────────────────────────────────────

  async function handlePublish(): Promise<void> {
    if (!activeDraftId) return;
    setConfirmPublish(false);
    setLoading(true);
    try {
      // Save first if dirty
      if (dirty) {
        const data: DraftData = { domains };
        await updateDraft(activeDraftId, { label: draftLabel, data });
      }
      await publishDraft(activeDraftId);
      setDraftStatus('PUBLISHED');
      setDirty(false);
      await loadDrafts();
      await loadVersions();
      setToast({ message: 'Questionnaire published to live!', severity: 'success' });
    } catch (error) {
      setToast({ message: (error as Error).message, severity: 'error' });
    } finally {
      setLoading(false);
    }
  }

  // ── Delete draft ──────────────────────────────────────────────

  async function handleDeleteDraft(): Promise<void> {
    if (!deleteDraftTarget) return;
    const draftId = deleteDraftTarget.draftId;
    setDeleteDraftTarget(null);
    setLoading(true);
    try {
      await deleteDraft(draftId);
      if (activeDraftId === draftId) {
        setActiveDraftId(null);
        setDomains([]);
        setDraftLabel('');
      }
      await loadDrafts();
      setToast({ message: 'Draft deleted.', severity: 'success' });
    } catch (error) {
      setToast({ message: (error as Error).message, severity: 'error' });
    } finally {
      setLoading(false);
    }
  }

  // ── Delete questionnaire version ──────────────────────────────

  async function handleDeleteVersion(): Promise<void> {
    if (!deleteVersionTarget) return;
    setDeleteVersionTarget(null);
    setLoading(true);
    try {
      await deleteQuestionnaireVersion(deleteVersionTarget.version);
      await loadVersions();
      setToast({ message: 'Version deleted.', severity: 'success' });
    } catch (error) {
      setToast({ message: (error as Error).message, severity: 'error' });
    } finally {
      setLoading(false);
    }
  }

  // ── View published version ──────────────────────────────────

  async function handleViewVersion(version: QuestionnaireVersion): Promise<void> {
    setLoading(true);
    try {
      const data = (await fetchConfigurationVersion(version.version)) as DraftData & { weightTiers?: WeightTier[] };
      setViewerLabel(version.label || version.version);
      setViewerDomains(data.domains || []);
      setViewerWeightTiers(data.weightTiers || []);
      setViewerOpen(true);
    } catch (error) {
      setToast({ message: (error as Error).message, severity: 'error' });
    } finally {
      setLoading(false);
    }
  }

  // ── Import YAML ───────────────────────────────────────────────

  async function handleImport(): Promise<void> {
    setLoading(true);
    try {
      const detail = await importYaml(importText);
      setActiveDraftId(detail.draftId);
      setDraftLabel(detail.label);
      setDraftStatus(detail.status);
      setDomains(detail.data.domains || []);
      setDirty(false);
      setImportOpen(false);
      setImportText('');
      await loadDrafts();
      setToast({ message: 'YAML imported as new draft.', severity: 'success' });
    } catch (error) {
      setToast({ message: (error as Error).message, severity: 'error' });
    } finally {
      setLoading(false);
    }
  }

  // ── Export ────────────────────────────────────────────────────

  async function handleExport(format: 'yaml' | 'json'): Promise<void> {
    try {
      const content = await exportQuestionnaire(format);
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `questionnaire.${format === 'yaml' ? 'yaml' : 'json'}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setToast({ message: (error as Error).message, severity: 'error' });
    }
  }

  // ── Domain mutations ──────────────────────────────────────────

  function addDomain(): void {
    setDomains((previous) => [...previous, emptyDomain(previous.length)]);
    setDirty(true);
  }

  function updateDomainField(domainIndex: number, field: keyof DraftDomain, value: unknown): void {
    setDomains((previous) =>
      previous.map((domain, index) =>
        index === domainIndex ? { ...domain, [field]: value } : domain,
      ),
    );
    setDirty(true);
  }

  function removeDomain(domainIndex: number): void {
    setDomains((previous) =>
      previous
        .filter((_, index) => index !== domainIndex)
        .map((domain, index) => ({
          ...domain,
          domainIndex: index,
          questions: domain.questions.map((question) => ({ ...question, domainIndex: index })),
        })),
    );
    setDirty(true);
  }

  // ── Question mutations ────────────────────────────────────────

  function addQuestion(domainIndex: number): void {
    setDomains((previous) =>
      previous.map((domain, index) =>
        index === domainIndex
          ? {
              ...domain,
              questions: [
                ...domain.questions,
                emptyQuestion(domainIndex, domain.questions.length),
              ],
            }
          : domain,
      ),
    );
    setDirty(true);
  }

  function updateQuestionField(
    domainIndex: number,
    questionIndex: number,
    field: keyof DraftQuestion,
    value: unknown,
  ): void {
    setDomains((previous) =>
      previous.map((domain, dIndex) =>
        dIndex === domainIndex
          ? {
              ...domain,
              questions: domain.questions.map((question, qIndex) =>
                qIndex === questionIndex ? { ...question, [field]: value } : question,
              ),
            }
          : domain,
      ),
    );
    setDirty(true);
  }

  function removeQuestion(domainIndex: number, questionIndex: number): void {
    setDomains((previous) =>
      previous.map((domain, dIndex) =>
        dIndex === domainIndex
          ? {
              ...domain,
              questions: domain.questions
                .filter((_, qIndex) => qIndex !== questionIndex)
                .map((question, qIndex) => ({ ...question, questionIndex: qIndex })),
            }
          : domain,
      ),
    );
    setDirty(true);
  }

  // ── Choice mutations ──────────────────────────────────────────

  function updateChoice(
    domainIndex: number,
    questionIndex: number,
    choiceIndex: number,
    text: string,
  ): void {
    setDomains((previous) =>
      previous.map((domain, dIndex) =>
        dIndex === domainIndex
          ? {
              ...domain,
              questions: domain.questions.map((question, qIndex) =>
                qIndex === questionIndex
                  ? {
                      ...question,
                      choices: question.choices.map((choice, cIndex) =>
                        cIndex === choiceIndex ? text : choice,
                      ),
                    }
                  : question,
              ),
            }
          : domain,
      ),
    );
    setDirty(true);
  }

  function updateChoiceScore(
    domainIndex: number,
    questionIndex: number,
    choiceIndex: number,
    score: number,
  ): void {
    setDomains((previous) =>
      previous.map((domain, dIndex) =>
        dIndex === domainIndex
          ? {
              ...domain,
              questions: domain.questions.map((question, qIndex) =>
                qIndex === questionIndex
                  ? {
                      ...question,
                      choiceScores: question.choiceScores.map((existing, cIndex) =>
                        cIndex === choiceIndex ? score : existing,
                      ),
                    }
                  : question,
              ),
            }
          : domain,
      ),
    );
    setDirty(true);
  }

  function addChoice(domainIndex: number, questionIndex: number): void {
    setDomains((previous) =>
      previous.map((domain, dIndex) =>
        dIndex === domainIndex
          ? {
              ...domain,
              questions: domain.questions.map((question, qIndex) =>
                qIndex === questionIndex
                  ? {
                      ...question,
                      choices: [...question.choices, ''],
                      choiceScores: [...question.choiceScores, 50],
                    }
                  : question,
              ),
            }
          : domain,
      ),
    );
    setDirty(true);
  }

  function removeChoice(
    domainIndex: number,
    questionIndex: number,
    choiceIndex: number,
  ): void {
    setDomains((previous) =>
      previous.map((domain, dIndex) =>
        dIndex === domainIndex
          ? {
              ...domain,
              questions: domain.questions.map((question, qIndex) =>
                qIndex === questionIndex
                  ? {
                      ...question,
                      choices: question.choices.filter((_, cIndex) => cIndex !== choiceIndex),
                      choiceScores: question.choiceScores.filter((_, cIndex) => cIndex !== choiceIndex),
                    }
                  : question,
              ),
            }
          : domain,
      ),
    );
    setDirty(true);
  }

  // ── Guard ─────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <Container sx={{ mt: 4 }}>
        <Typography color="error">Admin access required.</Typography>
      </Container>
    );
  }

  // ── Draft Picker (no active draft) ────────────────────────────

  const isEditing = activeDraftId !== null;
  const isPublished = draftStatus === 'PUBLISHED';

  if (!isEditing) {
    return (
      <Box>
        <AppBar position="static">
          <Toolbar>
            <IconButton color="inherit" edge="start" aria-label="Back to dashboard" onClick={() => navigate('/')} sx={{ mr: 1 }}>
              <ArrowBackIcon />
            </IconButton>
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              Questionnaire Editor
            </Typography>
            <UserMenu />
          </Toolbar>
        </AppBar>

        <Container maxWidth="md" sx={{ mt: 3 }}>
          <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewDraftOpen(true)}>
              New Draft
            </Button>
            <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => setImportOpen(true)}>
              Import YAML
            </Button>
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => handleExport('yaml')}>
              Export YAML
            </Button>
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={() => handleExport('json')}>
              Export JSON
            </Button>
          </Stack>

          {drafts.length === 0 && !loading && (
            <Typography color="text.secondary" sx={{ mt: 4, textAlign: 'center' }}>
              No drafts yet. Create one to start editing the questionnaire.
            </Typography>
          )}

          <Stack spacing={1}>
            {drafts.map((draft) => (
              <Paper
                key={draft.draftId}
                sx={{ p: 2, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                onClick={() => openDraft(draft.draftId)}
              >
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography variant="subtitle1" fontWeight={600}>
                      {draft.label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {draft.createdBy} &middot; Updated {new Date(draft.updated).toLocaleString()}
                      {draft.questionnaireName ? ` \u00b7 ${draft.questionnaireName}` : ''}
                    </Typography>
                  </Box>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Chip
                      label={draft.status}
                      size="small"
                      color={draft.status === 'PUBLISHED' ? 'success' : 'warning'}
                    />
                    {draft.status === 'DRAFT' && (
                      <IconButton
                        size="small"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteDraftTarget(draft);
                        }}
                        title="Delete draft"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>

          {/* Published Versions */}
          {versions.length > 0 && (
            <>
              <Divider sx={{ my: 3 }} />
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <HistoryIcon color="action" />
                <Typography variant="h6">Published Versions</Typography>
              </Stack>
              <Stack spacing={1}>
                {versions.map((versionItem) => {
                  const canDelete = !versionItem.current && versionItem.reviewCount === 0;
                  return (
                    <Paper key={versionItem.version} variant="outlined" sx={{ p: 2 }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Box>
                          <Typography variant="subtitle1" fontWeight={600}>
                            {versionItem.label || versionItem.version}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {versionItem.version.slice(0, 12)} &middot; {new Date(versionItem.created).toLocaleString()}
                            {versionItem.reviewCount > 0
                              ? ` \u00b7 ${versionItem.reviewCount} assessment${versionItem.reviewCount !== 1 ? 's' : ''}`
                              : ''}
                          </Typography>
                        </Box>
                        <Stack direction="row" alignItems="center" spacing={1}>
                          {versionItem.current && (
                            <Chip label="Current" size="small" color="primary" />
                          )}
                          <Tooltip title="View questionnaire">
                            <IconButton
                              size="small"
                              onClick={() => handleViewVersion(versionItem)}
                            >
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {canDelete && (
                            <Tooltip title="Delete version (no assessments)">
                              <IconButton
                                size="small"
                                onClick={() => setDeleteVersionTarget(versionItem)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      </Stack>
                    </Paper>
                  );
                })}
              </Stack>
            </>
          )}
        </Container>

        {/* Delete version confirmation */}
        <Dialog
          open={deleteVersionTarget !== null}
          onClose={() => setDeleteVersionTarget(null)}
        >
          <DialogTitle>Delete Version?</DialogTitle>
          <DialogContent>
            <Typography>
              This version has no assessments and will be permanently deleted.
              This cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteVersionTarget(null)}>Cancel</Button>
            <Button variant="contained" color="error" onClick={handleDeleteVersion} disabled={loading}>
              Delete
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete draft confirmation */}
        <Dialog
          open={deleteDraftTarget !== null}
          onClose={() => setDeleteDraftTarget(null)}
        >
          <DialogTitle>Delete Draft?</DialogTitle>
          <DialogContent>
            <Typography>
              Draft <strong>{deleteDraftTarget?.label || 'Untitled'}</strong> will be permanently deleted.
              This cannot be undone.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDraftTarget(null)}>Cancel</Button>
            <Button variant="contained" color="error" onClick={handleDeleteDraft} disabled={loading}>
              Delete
            </Button>
          </DialogActions>
        </Dialog>

        {/* New draft dialog */}
        <Dialog open={newDraftOpen} onClose={() => setNewDraftOpen(false)} maxWidth="xs" fullWidth>
          <DialogTitle>Create Draft</DialogTitle>
          <DialogContent>
            {questionnaires.filter((q) => q.active).length === 0 && (
              <>
                <Alert severity="info" sx={{ mb: 2 }}>
                  No questionnaire exists yet. One will be created automatically.
                </Alert>
                <TextField
                  fullWidth
                  label="Questionnaire Name"
                  placeholder="e.g. ASR Questionnaire"
                  value={newQuestionnaireName}
                  onChange={(event) => setNewQuestionnaireName(event.target.value)}
                  sx={{ mb: 1 }}
                />
              </>
            )}
            <TextField
              autoFocus
              fullWidth
              label="Draft Label"
              placeholder="e.g. Q3 2026 Updates"
              value={newDraftLabel}
              onChange={(event) => setNewDraftLabel(event.target.value)}
              sx={{ mt: 1 }}
            />
            {questionnaires.filter((q) => q.active).length > 1 && (
              <FormControl fullWidth sx={{ mt: 2 }}>
                <InputLabel>Questionnaire</InputLabel>
                <Select
                  value={newDraftQuestionnaireId}
                  label="Questionnaire"
                  onChange={(event: SelectChangeEvent) => setNewDraftQuestionnaireId(event.target.value)}
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
            {questionnaires.filter((q) => q.active).length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                An empty draft will be created. Add domains and questions, then publish.
              </Typography>
            )}
            {questionnaires.filter((q) => q.active).length > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Creates a copy of the current live questionnaire for editing.
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setNewDraftOpen(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleCreateDraft} disabled={loading}>
              Create
            </Button>
          </DialogActions>
        </Dialog>

        {/* Import YAML dialog */}
        <ImportDialog
          open={importOpen}
          loading={loading}
          importText={importText}
          onClose={() => setImportOpen(false)}
          onTextChange={setImportText}
          onImport={handleImport}
        />

        {/* Questionnaire Viewer */}
        <QuestionnaireViewer
          open={viewerOpen}
          label={viewerLabel}
          domains={viewerDomains}
          weightTiers={viewerWeightTiers}
          onClose={() => setViewerOpen(false)}
        />

        {/* Toast */}
        <Snackbar
          open={toast !== null}
          autoHideDuration={4000}
          onClose={() => setToast(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}
        </Snackbar>
      </Box>
    );
  }

  // ── Editor View ───────────────────────────────────────────────

  const totalQuestions = domains.reduce((sum, domain) => sum + domain.questions.length, 0);

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => {
              setActiveDraftId(null);
              setDomains([]);
              setDraftLabel('');
              setDirty(false);
              setConfirmPublish(false);
              loadDrafts();
            }}
            sx={{ mr: 1 }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            {draftLabel || 'Untitled Draft'}
            {dirty ? ' *' : ''}
          </Typography>
          <Chip
            label={draftStatus}
            size="small"
            color={isPublished ? 'success' : 'warning'}
            sx={{ mr: 2 }}
          />
          <Typography variant="body2" sx={{ mr: 2, opacity: 0.8 }}>
            {domains.length} domains &middot; {totalQuestions} questions
          </Typography>
          {!isPublished && (
            <>
              <Button
                color="inherit"
                startIcon={<SaveIcon />}
                onClick={handleSave}
                disabled={loading || !dirty}
                sx={{ mr: 1 }}
              >
                Save
              </Button>
              <Button
                color="inherit"
                startIcon={<PublishIcon />}
                onClick={() => setConfirmPublish(true)}
                disabled={loading}
              >
                Publish
              </Button>
            </>
          )}
          <UserMenu />
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 2, mb: 6 }}>
        {/* Draft label */}
        {!isPublished && (
          <TextField
            label="Draft Label"
            value={draftLabel}
            onChange={(event) => {
              setDraftLabel(event.target.value);
              setDirty(true);
            }}
            {...compactField}
            sx={{ mb: 2, width: 400 }}
          />
        )}

        {/* Domains */}
        {domains.map((domain, domainIndex) => (
          <Accordion key={domainIndex} defaultExpanded={domainIndex === 0}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ width: '100%' }}>
                <Chip label={`D${domainIndex}`} size="small" />
                <Typography fontWeight={600} sx={{ flexGrow: 1 }}>
                  {domain.name || '(unnamed domain)'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {domain.questions.length} question{domain.questions.length !== 1 ? 's' : ''}
                </Typography>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              {/* Domain fields */}
              <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                <TextField
                  label="Domain Name"
                  value={domain.name}
                  onChange={(event) => updateDomainField(domainIndex, 'name', event.target.value)}
                  {...compactField}
                  sx={{ flexGrow: 1 }}
                  disabled={isPublished}
                />
                {!isPublished && (
                  <Tooltip title="Remove domain">
                    <IconButton
                      color="error"
                      onClick={() => removeDomain(domainIndex)}
                      disabled={domains.length <= 1}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>

              {/* Questions */}
              {domain.questions.map((question, questionIndex) => (
                <Paper
                  key={questionIndex}
                  variant="outlined"
                  sx={{ p: 2, mb: 1.5 }}
                >
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Chip label={`Q${questionIndex}`} size="small" sx={{ mt: 0.5 }} />
                    <Box sx={{ flexGrow: 1 }}>
                      {/* Question text */}
                      <TextField
                        label="Question Text"
                        value={question.text}
                        onChange={(event) =>
                          updateQuestionField(domainIndex, questionIndex, 'text', event.target.value)
                        }
                        fullWidth
                        multiline
                        minRows={2}
                        {...compactField}
                        disabled={isPublished}
                        sx={{ mb: 1.5 }}
                      />

                      {/* Weight + Function */}
                      <Stack direction="row" spacing={2} sx={{ mb: 1.5 }}>
                        <FormControl {...compactField} sx={{ minWidth: 140 }}>
                          <InputLabel>Weight Tier</InputLabel>
                          <Select
                            label="Weight Tier"
                            value={question.weightTier}
                            onChange={(event: SelectChangeEvent) =>
                              updateQuestionField(domainIndex, questionIndex, 'weightTier', event.target.value)
                            }
                            disabled={isPublished}
                          >
                            {WEIGHT_TIERS.map((tier) => (
                              <MenuItem key={tier} value={tier}>{tier}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        <FormControl {...compactField} sx={{ minWidth: 140 }}>
                          <InputLabel>Function</InputLabel>
                          <Select
                            label="Function"
                            value={question.responsibleFunction || 'GENERAL'}
                            onChange={(event: SelectChangeEvent) =>
                              updateQuestionField(domainIndex, questionIndex, 'responsibleFunction', event.target.value)
                            }
                            disabled={isPublished}
                          >
                            {FUNCTIONS.map((code) => (
                              <MenuItem key={code} value={code}>{code}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>

                        <TextField
                          label="N/A Score"
                          type="number"
                          value={question.naScore}
                          onChange={(event) =>
                            updateQuestionField(domainIndex, questionIndex, 'naScore', Number(event.target.value))
                          }
                          {...compactField}
                          sx={{ width: 100 }}
                          disabled={isPublished}
                        />
                      </Stack>

                      {/* Guidance */}
                      <TextField
                        label="Guidance"
                        value={question.guidance || ''}
                        onChange={(event) =>
                          updateQuestionField(
                            domainIndex, questionIndex, 'guidance',
                            event.target.value || null,
                          )
                        }
                        fullWidth
                        multiline
                        minRows={1}
                        {...compactField}
                        disabled={isPublished}
                        sx={{ mb: 1.5 }}
                      />

                      {/* Choices */}
                      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Choices</Typography>
                      {question.choices.map((choiceText, choiceIndex) => (
                        <Stack key={choiceIndex} direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                          <TextField
                            label={`Choice ${choiceIndex + 1}`}
                            value={choiceText}
                            onChange={(event) =>
                              updateChoice(domainIndex, questionIndex, choiceIndex, event.target.value)
                            }
                            {...compactField}
                            sx={{ flexGrow: 1 }}
                            disabled={isPublished}
                          />
                          <TextField
                            label="Score"
                            type="number"
                            value={question.choiceScores[choiceIndex] ?? 50}
                            onChange={(event) =>
                              updateChoiceScore(domainIndex, questionIndex, choiceIndex, Number(event.target.value))
                            }
                            {...compactField}
                            sx={{ width: 90 }}
                            disabled={isPublished}
                          />
                          {!isPublished && question.choices.length > 2 && (
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => removeChoice(domainIndex, questionIndex, choiceIndex)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Stack>
                      ))}
                      {!isPublished && (
                        <Button
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={() => addChoice(domainIndex, questionIndex)}
                          sx={{ mt: 0.5 }}
                        >
                          Add Choice
                        </Button>
                      )}
                    </Box>

                    {/* Remove question */}
                    {!isPublished && (
                      <Tooltip title="Remove question">
                        <IconButton
                          color="error"
                          size="small"
                          onClick={() => removeQuestion(domainIndex, questionIndex)}
                          disabled={domain.questions.length <= 1}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                </Paper>
              ))}

              {/* Add question button */}
              {!isPublished && (
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => addQuestion(domainIndex)}
                  sx={{ mt: 1 }}
                >
                  Add Question
                </Button>
              )}
            </AccordionDetails>
          </Accordion>
        ))}

        {/* Add domain button */}
        {!isPublished && (
          <>
            <Divider sx={{ my: 2 }} />
            <Button variant="outlined" startIcon={<AddIcon />} onClick={addDomain}>
              Add Domain
            </Button>
          </>
        )}
      </Container>

      {/* Publish confirmation */}
      <Dialog open={confirmPublish} onClose={() => setConfirmPublish(false)}>
        <DialogTitle>Publish Questionnaire?</DialogTitle>
        <DialogContent>
          <Typography>
            This will apply all changes to the live questionnaire. A snapshot will be created
            for version tracking. Existing reviews are not affected.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmPublish(false)}>Cancel</Button>
          <Button variant="contained" color="warning" onClick={handlePublish} disabled={loading}>
            Publish
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import YAML dialog */}
      <ImportDialog
        open={importOpen}
        loading={loading}
        importText={importText}
        onClose={() => setImportOpen(false)}
        onTextChange={setImportText}
        onImport={handleImport}
      />

      {/* Toast */}
      <Snackbar
        open={toast !== null}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? <Alert severity={toast.severity} onClose={() => setToast(null)}>{toast.message}</Alert> : undefined}
      </Snackbar>
    </Box>
  );
}

// ════════════════════════════════════════════════════════════════════
// ImportDialog — shared between picker and editor views
// ════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════
// QuestionnaireViewer — read-only snapshot of a published version
// ════════════════════════════════════════════════════════════════════

function QuestionnaireViewer({
  open,
  label,
  domains,
  weightTiers,
  onClose,
}: {
  open: boolean;
  label: string;
  domains: DraftDomain[];
  weightTiers: WeightTier[];
  onClose: () => void;
}) {
  const tierMap = Object.fromEntries(weightTiers.map((tier) => [tier.name, tier.value]));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth scroll="paper">
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="h6">{label}</Typography>
          <Chip label={`${domains.length} domain${domains.length !== 1 ? 's' : ''}`} size="small" />
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {weightTiers.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Weight Tiers
            </Typography>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              {weightTiers.map((tier) => (
                <Chip key={tier.name} label={`${tier.name}: ${tier.value}`} size="small" variant="outlined" />
              ))}
            </Stack>
          </Box>
        )}

        {domains.map((domain) => (
          <Accordion key={domain.domainIndex} defaultExpanded={domains.length <= 5}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography fontWeight={600}>
                {domain.domainIndex + 1}. {domain.name}
              </Typography>
              {(domain.policyRefs.length > 0 || domain.csfRefs.length > 0) && (
                <Stack direction="row" spacing={0.5} sx={{ ml: 2 }} alignItems="center">
                  {domain.policyRefs.map((ref) => (
                    <Chip key={ref} label={ref} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                  ))}
                  {domain.csfRefs.map((ref) => (
                    <Chip key={ref} label={ref} size="small" variant="outlined" color="info" sx={{ fontSize: '0.7rem' }} />
                  ))}
                </Stack>
              )}
            </AccordionSummary>
            <AccordionDetails>
              <Stack spacing={2}>
                {domain.questions.map((question) => (
                  <Paper key={`${domain.domainIndex}-${question.questionIndex}`} variant="outlined" sx={{ p: 2 }}>
                    <Typography variant="body1" fontWeight={500} gutterBottom>
                      Q{question.questionIndex + 1}. {question.text}
                    </Typography>

                    <Stack direction="row" spacing={1} sx={{ mb: 1 }} flexWrap="wrap">
                      <Chip
                        label={question.weightTier}
                        size="small"
                        color={
                          question.weightTier === 'Critical' ? 'error'
                          : question.weightTier === 'High' ? 'warning'
                          : question.weightTier === 'Medium' ? 'info'
                          : 'default'
                        }
                      />
                      {tierMap[question.weightTier] !== undefined && (
                        <Chip label={`Weight: ${tierMap[question.weightTier]}`} size="small" variant="outlined" />
                      )}
                      {question.responsibleFunction && (
                        <Chip label={question.responsibleFunction} size="small" variant="outlined" />
                      )}
                      <Chip label={`N/A Score: ${question.naScore}`} size="small" variant="outlined" />
                    </Stack>

                    <Box sx={{ ml: 2 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>Choices:</Typography>
                      {question.choices.map((choice, choiceIndex) => (
                        <Typography key={choiceIndex} variant="body2" sx={{ ml: 1 }}>
                          {choice} — score: {question.choiceScores[choiceIndex] ?? '?'}
                        </Typography>
                      ))}
                    </Box>

                    {question.guidance && (
                      <Box sx={{ mt: 1, ml: 2, pl: 1, borderLeft: '3px solid', borderColor: 'info.light' }}>
                        <Typography variant="body2" color="text.secondary" fontStyle="italic">
                          {question.guidance}
                        </Typography>
                      </Box>
                    )}

                    {question.applicability && question.applicability.length > 0 && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" color="text.secondary">
                          Applicability: {question.applicability.join(', ')}
                        </Typography>
                      </Box>
                    )}
                  </Paper>
                ))}
              </Stack>
            </AccordionDetails>
          </Accordion>
        ))}

        {domains.length === 0 && (
          <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            No domain data available for this version.
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ════════════════════════════════════════════════════════════════════
// ImportDialog — shared between picker and editor views
// ════════════════════════════════════════════════════════════════════

function ImportDialog({
  open,
  loading,
  importText,
  onClose,
  onTextChange,
  onImport,
}: {
  open: boolean;
  loading: boolean;
  importText: string;
  onClose: () => void;
  onTextChange: (text: string) => void;
  onImport: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Import YAML</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Paste the contents of an asr_questions.yaml file. A new draft will be created.
        </Typography>
        <TextField
          fullWidth
          multiline
          minRows={12}
          maxRows={24}
          placeholder="Paste YAML here..."
          value={importText}
          onChange={(event) => onTextChange(event.target.value)}
          sx={{ fontFamily: 'monospace' }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={onImport}
          disabled={loading || !importText.trim()}
        >
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
}
