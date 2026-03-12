import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert,
  AppBar,
  Box,
  Button,
  CircularProgress,
  Container,
  Grid,
  Snackbar,
  Toolbar,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

import ClassificationBanner from '../components/ClassificationBanner';
import SourceBanner from '../components/SourceBanner';
import EnvironmentBanner from '../components/EnvironmentBanner';
import VersionBanner from '../components/VersionBanner';
import DomainSection from '../components/DomainSection';
import ScoreDashboard from '../components/ScoreDashboard';
import ReviewActions from '../components/ReviewActions';
import {
  fetchConfiguration,
  fetchConfigurationVersion,
  fetchReview,
  saveAnswers,
  submitReview,
  updateClassification,
  updateDeployment,
} from '../lib/apiClient';
import { computeScore } from '../lib/scoring';
import { exportReviewToExcel } from '../lib/exportExcel';
import { saveDraft, loadDraft } from '../lib/storage';
import type {
  AppConfiguration,
  AnswerState,
  ClassificationChoice,
  SourceChoice,
  EnvironmentChoice,
  ReviewDetail,
} from '../lib/types';
import type { ScoringConfiguration } from '../lib/scoring';

// ════════════════════════════════════════════════════════════════════
// ReviewPage — full questionnaire with live scoring
// ════════════════════════════════════════════════════════════════════

function answerKey(domainIndex: number, questionIndex: number): string {
  return `${domainIndex}:${questionIndex}`;
}

export default function ReviewPage() {
  const { reviewId } = useParams<{ reviewId: string }>();
  const navigate = useNavigate();

  // ── Loading / error state ─────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [snackMessage, setSnackMessage] = useState<string | null>(null);

  // ── Configuration (loaded once) ───────────────────────────────
  const [configuration, setConfiguration] = useState<AppConfiguration | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [isHistoricalVersion, setIsHistoricalVersion] = useState(false);

  // ── Review data ───────────────────────────────────────────────
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [classificationChoice, setClassificationChoice] = useState<string | null>(null);
  const [classificationFactor, setClassificationFactor] = useState<number>(0);

  // ── Deployment state (source × environment) ───────────────────
  const [sourceChoice, setSourceChoice] = useState<string | null>(null);
  const [environmentChoice, setEnvironmentChoice] = useState<string | null>(null);
  const deploymentArchetype = useMemo(() => {
    if (sourceChoice && environmentChoice) {
      return `${sourceChoice}_${environmentChoice}`;
    }
    return null;
  }, [sourceChoice, environmentChoice]);

  // ── Answer state ──────────────────────────────────────────────
  const [answers, setAnswers] = useState<Map<string, AnswerState>>(new Map());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // ── Weight tier map for measurements ──────────────────────────
  const weightTierMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (configuration) {
      for (const tier of configuration.weightTiers) {
        map[tier.name] = tier.value;
      }
    }
    return map;
  }, [configuration]);

  // ── Computed score (live, client-side advisory) ───────────────
  const liveScore = useMemo(() => {
    const measurements = Array.from(answers.values())
      .filter((answer) => answer.choiceIndex !== null)
      .map((answer) => answer.measurement);

    const scoringConfig: ScoringConfiguration = configuration?.scoringConfiguration ?? {
      dampingFactor: 4,
      rawMax: 134,
      ratingThresholds: [25, 50, 75],
      ratingLabels: ['Low', 'Moderate', 'Elevated', 'Critical'],
    };

    return computeScore(measurements, scoringConfig);
  }, [answers, configuration]);

  // ── Count answered questions ──────────────────────────────────
  const answeredCount = useMemo(() => {
    let count = 0;
    for (const answer of answers.values()) {
      if (answer.choiceIndex !== null) {
        count++;
      }
    }
    return count;
  }, [answers]);

  const totalQuestionCount = useMemo(() => {
    if (!configuration) return 0;
    let count = 0;
    for (const domain of configuration.domains) {
      for (const question of domain.questions) {
        const applicability = question.applicability ?? [];
        if (applicability.length === 0 || !deploymentArchetype || applicability.includes(deploymentArchetype)) {
          count++;
        }
      }
    }
    return count;
  }, [configuration, deploymentArchetype]);

  // ── Load configuration + review on mount ──────────────────────
  useEffect(() => {
    async function initialize(): Promise<void> {
      try {
        const [configData, reviewData] = await Promise.all([
          fetchConfiguration(),
          reviewId ? fetchReview(reviewId) : Promise.resolve(null),
        ]);

        const latestConfig = configData as AppConfiguration;
        setCurrentVersion(latestConfig.questionnaireVersion);

        // Determine the effective config — may differ if the review
        // was created on an older questionnaire version.
        let appConfig = latestConfig;

        if (reviewData && (reviewData as Record<string, unknown>).review) {
          const detail = reviewData as { review: Record<string, unknown>; answers: Array<{ answer: Record<string, unknown> | null; question: Record<string, unknown> | null }> };
          const pinnedVersion = (detail.review.questionnaireVersion as string) || null;

          if (pinnedVersion && pinnedVersion !== latestConfig.questionnaireVersion) {
            try {
              const historicalData = await fetchConfigurationVersion(pinnedVersion);
              appConfig = historicalData as AppConfiguration;
              setIsHistoricalVersion(true);
            } catch {
              // Snapshot not available — fall back to current config
            }
          }

          setConfiguration(appConfig);

          const reviewRecord: ReviewDetail = {
            reviewId: (detail.review.reviewId as string) || '',
            applicationName: (detail.review.applicationName as string) || '',
            assessor: (detail.review.assessor as string) || '',
            status: (detail.review.status as string) || 'DRAFT',
            classificationChoice: (detail.review.classificationChoice as string) || null,
            classificationFactor: (detail.review.classificationFactor as number) || null,
            sourceChoice: (detail.review.sourceChoice as string) || null,
            environmentChoice: (detail.review.environmentChoice as string) || null,
            deploymentArchetype: (detail.review.deploymentArchetype as string) || null,
            questionnaireVersion: (detail.review.questionnaireVersion as string) || null,
            rskRaw: (detail.review.rskRaw as number) || 0,
            rskNormalized: (detail.review.rskNormalized as number) || 0,
            rating: (detail.review.rating as string) || 'Low',
            notes: (detail.review.notes as string) || '',
            created: (detail.review.created as string) || '',
            updated: (detail.review.updated as string) || '',
          };
          setReview(reviewRecord);
          setClassificationChoice(reviewRecord.classificationChoice);
          setClassificationFactor(reviewRecord.classificationFactor ?? 0);
          setSourceChoice(reviewRecord.sourceChoice);
          setEnvironmentChoice(reviewRecord.environmentChoice);

          // Hydrate answers from server
          const answerMap = new Map<string, AnswerState>();
          for (const item of detail.answers) {
            if (item.answer && item.question) {
              const key = answerKey(
                item.answer.domainIndex as number,
                item.answer.questionIndex as number,
              );
              answerMap.set(key, {
                domainIndex: item.answer.domainIndex as number,
                questionIndex: item.answer.questionIndex as number,
                choiceIndex: findChoiceIndex(
                  appConfig,
                  item.answer.domainIndex as number,
                  item.answer.questionIndex as number,
                  item.answer.choiceText as string,
                ),
                choiceText: (item.answer.choiceText as string) || '',
                rawScore: (item.answer.rawScore as number) || 0,
                weightTier: (item.answer.weightTier as string) || '',
                measurement: (item.answer.measurement as number) || 0,
                notes: (item.answer.notes as string) || '',
              });
            }
          }

          // Check localStorage for a more recent draft
          const draft = loadDraft(reviewId!) as { answers?: Record<string, AnswerState>; classificationChoice?: string; classificationFactor?: number } | null;
          if (draft?.answers) {
            for (const [key, draftAnswer] of Object.entries(draft.answers)) {
              answerMap.set(key, draftAnswer);
            }
            if (draft.classificationChoice) {
              setClassificationChoice(draft.classificationChoice);
            }
            if (draft.classificationFactor) {
              setClassificationFactor(draft.classificationFactor);
            }
            setSnackMessage('Restored unsaved local draft');
          }

          setAnswers(answerMap);
        } else {
          setConfiguration(latestConfig);
        }
      } catch (error) {
        setErrorMessage((error as Error).message);
      } finally {
        setLoading(false);
      }
    }
    initialize();
  }, [reviewId]);

  // ── Classification change ─────────────────────────────────────
  const handleClassificationChange = useCallback(
    (choice: ClassificationChoice) => {
      setClassificationChoice(choice.text);
      setClassificationFactor(choice.factor);
      setHasUnsavedChanges(true);

      // Persist classification to server
      if (reviewId && review) {
        updateClassification(reviewId, choice.text, choice.factor, review.assessor).catch(
          (error) => setErrorMessage((error as Error).message),
        );
      }

      // Recompute all measurements with new factor
      setAnswers((previous) => {
        const updated = new Map(previous);
        for (const [key, answer] of updated) {
          if (answer.choiceIndex !== null) {
            const weightValue = weightTierMap[answer.weightTier] ?? 0;
            const measurement = computeMeasurement(answer.rawScore, weightValue, choice.factor);
            updated.set(key, { ...answer, measurement });
          }
        }
        return updated;
      });
    },
    [weightTierMap, reviewId, review],
  );

  // ── Source change ─────────────────────────────────────────────
  const handleSourceChange = useCallback(
    (choice: SourceChoice) => {
      setSourceChoice(choice.source);
      setHasUnsavedChanges(true);

      if (reviewId && review && environmentChoice) {
        updateDeployment(reviewId, choice.source, environmentChoice, review.assessor).catch(
          (error) => setErrorMessage((error as Error).message),
        );
      }
    },
    [reviewId, review, environmentChoice],
  );

  // ── Environment change ────────────────────────────────────────
  const handleEnvironmentChange = useCallback(
    (choice: EnvironmentChoice) => {
      setEnvironmentChoice(choice.environment);
      setHasUnsavedChanges(true);

      if (reviewId && review && sourceChoice) {
        updateDeployment(reviewId, sourceChoice, choice.environment, review.assessor).catch(
          (error) => setErrorMessage((error as Error).message),
        );
      }
    },
    [reviewId, review, sourceChoice],
  );

  // ── Answer change ─────────────────────────────────────────────
  const handleAnswerChange = useCallback((answer: AnswerState) => {
    const key = answerKey(answer.domainIndex, answer.questionIndex);
    setAnswers((previous) => {
      const updated = new Map(previous);
      updated.set(key, answer);
      return updated;
    });
    setHasUnsavedChanges(true);
  }, []);

  // ── Save draft to localStorage ────────────────────────────────
  const handleSaveDraft = useCallback(() => {
    if (!reviewId) return;
    const answersObject: Record<string, AnswerState> = {};
    for (const [key, answer] of answers) {
      answersObject[key] = answer;
    }
    saveDraft(reviewId, {
      answers: answersObject,
      classificationChoice,
      classificationFactor,
      applicationName: review?.applicationName,
    });
    setSnackMessage('Draft saved locally');
  }, [reviewId, answers, classificationChoice, classificationFactor, review]);

  // ── Save to server ────────────────────────────────────────────
  const handleSaveServer = useCallback(async () => {
    if (!reviewId || !review) return;
    setSaving(true);
    try {
      const answersPayload = Array.from(answers.values())
        .filter((answer) => answer.choiceIndex !== null)
        .map((answer) => ({
          domainIndex: answer.domainIndex,
          questionIndex: answer.questionIndex,
          choiceText: answer.choiceText,
          rawScore: answer.rawScore,
          weightTier: answer.weightTier,
          notes: answer.notes,
        }));

      await saveAnswers(
        reviewId,
        classificationFactor,
        answersPayload,
        review.assessor,
      );

      setHasUnsavedChanges(false);
      setSnackMessage('Saved to server');
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  }, [reviewId, review, answers, classificationFactor]);

  // ── Submit review ─────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!reviewId || !review) return;

    // Save first, then submit
    await handleSaveServer();

    setSubmitting(true);
    try {
      await submitReview(reviewId, review.assessor);
      setReview((previous) => previous ? { ...previous, status: 'SUBMITTED' } : previous);
      setSnackMessage('Review submitted successfully');
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [reviewId, review, handleSaveServer]);

  // ── Download Excel ────────────────────────────────────────────
  const handleDownloadExcel = useCallback(async () => {
    if (!configuration || !review) return;
    setExporting(true);
    try {
      const classificationLabel = classificationChoice ?? null;
      await exportReviewToExcel({
        applicationName: review.applicationName,
        assessor: review.assessor,
        status: review.status,
        classificationLabel,
        classificationFactor,
        configuration,
        answers,
        liveScore,
        reviewDate: review.created
          ? new Date(review.created).toLocaleDateString()
          : new Date().toLocaleDateString(),
      });
      setSnackMessage('Excel downloaded');
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setExporting(false);
    }
  }, [configuration, review, classificationChoice, classificationFactor, answers, liveScore]);

  // ── Render ────────────────────────────────────────────────────
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (errorMessage) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="error">{errorMessage}</Alert>
      </Container>
    );
  }

  if (!configuration || !review || !reviewId) {
    return (
      <Container maxWidth="md" sx={{ mt: 4 }}>
        <Alert severity="warning">Review not found</Alert>
      </Container>
    );
  }

  const isSubmitted = review.status === 'SUBMITTED';

  return (
    <Box>
      <AppBar position="sticky">
        <Toolbar>
          <Button
            color="inherit"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/')}
            sx={{ mr: 2 }}
          >
            Dashboard
          </Button>
          <Typography variant="h6" sx={{ flex: 1 }}>
            {review.applicationName}
          </Typography>
          <Typography variant="body2" color="inherit" sx={{ opacity: 0.8 }}>
            {review.assessor} · {review.status}
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 3, mb: 10 }}>
        <Grid container spacing={3}>
          {/* Left column — questionnaire */}
          <Grid size={{ xs: 12, md: 9 }}>
            {isHistoricalVersion && (
              <VersionBanner
                reviewLabel={configuration.questionnaireLabel}
                reviewVersion={configuration.questionnaireVersion}
                currentVersion={currentVersion}
              />
            )}

            <ClassificationBanner
              classification={configuration.classification}
              selectedChoice={classificationChoice}
              onChoiceChange={handleClassificationChange}
              disabled={isSubmitted}
            />

            <SourceBanner
              source={configuration.source}
              selectedSource={sourceChoice}
              onSourceChange={handleSourceChange}
              disabled={isSubmitted}
            />

            <EnvironmentBanner
              environment={configuration.environment}
              selectedEnvironment={environmentChoice}
              onEnvironmentChange={handleEnvironmentChange}
              disabled={isSubmitted}
            />

            {classificationFactor === 0 && (
              <Alert severity="info" sx={{ mb: 2 }}>
                Select a risk classification above to enable scoring.
              </Alert>
            )}

            {configuration.domains.map((domain) => (
              <DomainSection
                key={domain.domainIndex}
                domain={domain}
                answers={answers}
                onAnswerChange={handleAnswerChange}
                weightTierMap={weightTierMap}
                classificationFactor={classificationFactor}
                disabled={isSubmitted}
                dampingFactor={configuration.scoringConfiguration.dampingFactor}
                deploymentArchetype={deploymentArchetype}
              />
            ))}
          </Grid>

          {/* Right column — score dashboard */}
          <Grid size={{ xs: 12, md: 3 }}>
            <ScoreDashboard
              score={liveScore}
              scoringConfiguration={configuration.scoringConfiguration}
              answeredCount={answeredCount}
              totalCount={totalQuestionCount}
            />
          </Grid>
        </Grid>
      </Container>

      <ReviewActions
        onSaveDraft={handleSaveDraft}
        onSaveServer={handleSaveServer}
        onSubmit={handleSubmit}
        onDownloadExcel={handleDownloadExcel}
        saving={saving}
        submitting={submitting}
        exporting={exporting}
        isSubmitted={isSubmitted}
        hasUnsavedChanges={hasUnsavedChanges}
      />

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

// ════════════════════════════════════════════════════════════════════
// Helper functions
// ════════════════════════════════════════════════════════════════════

function findChoiceIndex(
  config: AppConfiguration,
  domainIndex: number,
  questionIndex: number,
  choiceText: string,
): number | null {
  let answer: number | null = null;

  if (choiceText === 'N/A') {
    answer = -1;
  } else {
    const domain = config.domains.find((d) => d.domainIndex === domainIndex);
    if (domain) {
      const question = domain.questions.find((q) => q.questionIndex === questionIndex);
      if (question) {
        const index = question.choices.indexOf(choiceText);
        if (index >= 0) {
          answer = index;
        }
      }
    }
  }

  return answer;
}

function computeMeasurement(
  rawScore: number,
  weightValue: number,
  classificationFactor: number,
): number {
  let answer = 0;

  if (rawScore > 0 && weightValue > 0 && classificationFactor > 0) {
    answer = Math.floor((rawScore / 100) * (weightValue / 100) * classificationFactor);
  }

  return answer;
}
