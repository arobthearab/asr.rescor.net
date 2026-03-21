// ════════════════════════════════════════════════════════════════════
// TenantDataStore — export / import a tenant's entire dataset
// ════════════════════════════════════════════════════════════════════

import { randomUUID } from 'node:crypto';

// ────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────

function toNumber(value) {
  if (value === null || value === undefined) return null;
  return typeof value === 'object' && value.toNumber ? value.toNumber() : Number(value);
}

function toPlain(node) {
  if (!node) return null;
  const plain = { ...node };
  for (const [key, value] of Object.entries(plain)) {
    if (typeof value === 'object' && value !== null && value.toNumber) {
      plain[key] = value.toNumber();
    }
  }
  return plain;
}

// ────────────────────────────────────────────────────────────────────
// TenantDataStore
// ────────────────────────────────────────────────────────────────────

export class TenantDataStore {
  constructor(database) {
    this.database = database;
  }

  // ════════════════════════════════════════════════════════════════════
  // EXPORT
  // ════════════════════════════════════════════════════════════════════

  async exportTenantData(tenantId, exportedBy) {
    // Verify tenant
    const tenantRows = await this.database.query(
      `MATCH (t:Tenant {tenantId: $tenantId})
       RETURN t.name AS name`,
      { tenantId }
    );
    if (tenantRows.length === 0) return null;
    const tenantName = tenantRows[0].name;

    // Run all export queries in parallel
    const [
      scoringConfigs,
      questionnaireSnapshots,
      questionnaireDrafts,
      gateQuestions,
      complianceTagConfigs,
      reviews,
      users,
    ] = await Promise.all([
      this._exportScoringConfigs(tenantId),
      this._exportQuestionnaireSnapshots(tenantId),
      this._exportQuestionnaireDrafts(tenantId),
      this._exportGateQuestions(tenantId),
      this._exportComplianceTagConfigs(tenantId),
      this._exportReviews(tenantId),
      this._exportUsers(tenantId),
    ]);

    const answerCount = reviews.reduce((sum, r) => sum + r.answers.length, 0);
    const remediationCount = reviews.reduce((sum, r) => sum + r.remediationItems.length, 0);
    const proposedChangeCount = reviews.reduce((sum, r) => sum + r.proposedChanges.length, 0);
    const auditorCommentCount = reviews.reduce((sum, r) => sum + r.auditorComments.length, 0);
    const gateAnswerCount = reviews.reduce((sum, r) => sum + r.gateAnswers.length, 0);

    return {
      manifest: {
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        exportedBy: exportedBy || null,
        sourceTenantId: tenantId,
        sourceTenantName: tenantName,
        counts: {
          scoringConfigs: scoringConfigs.length,
          questionnaireSnapshots: questionnaireSnapshots.length,
          questionnaireDrafts: questionnaireDrafts.length,
          gateQuestions: gateQuestions.length,
          complianceTagConfigs: complianceTagConfigs.length,
          reviews: reviews.length,
          answers: answerCount,
          remediationItems: remediationCount,
          proposedChanges: proposedChangeCount,
          auditorComments: auditorCommentCount,
          gateAnswers: gateAnswerCount,
          users: users.length,
        },
      },
      scoringConfigs,
      questionnaireSnapshots,
      questionnaireDrafts,
      gateQuestions,
      complianceTagConfigs,
      users,
      reviews,
    };
  }

  async _exportScoringConfigs(tenantId) {
    const rows = await this.database.query(
      `MATCH (sc:ScoringConfig {tenantId: $tenantId})
       RETURN sc`,
      { tenantId }
    );
    return rows.map((r) => {
      const sc = toPlain(r.sc || r);
      delete sc.tenantId;
      return sc;
    });
  }

  async _exportQuestionnaireSnapshots(tenantId) {
    const rows = await this.database.query(
      `MATCH (snap:QuestionnaireSnapshot {tenantId: $tenantId})
       RETURN snap
       ORDER BY snap.created`,
      { tenantId }
    );
    return rows.map((r) => {
      const snap = toPlain(r.snap || r);
      delete snap.tenantId;
      return snap;
    });
  }

  async _exportQuestionnaireDrafts(tenantId) {
    const rows = await this.database.query(
      `MATCH (draft:QuestionnaireDraft {tenantId: $tenantId})
       RETURN draft
       ORDER BY draft.created`,
      { tenantId }
    );
    return rows.map((r) => {
      const draft = toPlain(r.draft || r);
      delete draft.tenantId;
      return draft;
    });
  }

  async _exportGateQuestions(tenantId) {
    const rows = await this.database.query(
      `MATCH (gq:GateQuestion {tenantId: $tenantId})
       RETURN gq
       ORDER BY gq.sortOrder`,
      { tenantId }
    );
    return rows.map((r) => {
      const gq = toPlain(r.gq || r);
      delete gq.tenantId;
      return gq;
    });
  }

  async _exportComplianceTagConfigs(tenantId) {
    const rows = await this.database.query(
      `MATCH (ctc:ComplianceTagConfig {tenantId: $tenantId})
       RETURN ctc`,
      { tenantId }
    );
    return rows.map((r) => {
      const ctc = toPlain(r.ctc || r);
      delete ctc.tenantId;
      return ctc;
    });
  }

  async _exportUsers(tenantId) {
    const rows = await this.database.query(
      `MATCH (u:User)-[:BELONGS_TO]->(:Tenant {tenantId: $tenantId})
       RETURN u`,
      { tenantId }
    );
    return rows.map((r) => toPlain(r.u || r));
  }

  async _exportReviews(tenantId) {
    // Reviews
    const reviewRows = await this.database.query(
      `MATCH (review:Review)-[:SCOPED_TO]->(:Tenant {tenantId: $tenantId})
       RETURN review
       ORDER BY review.created`,
      { tenantId }
    );

    const reviews = reviewRows.map((r) => {
      const review = toPlain(r.review || r);
      return { ...review, answers: [], remediationItems: [], proposedChanges: [], auditorComments: [], gateAnswers: [] };
    });

    if (reviews.length === 0) return reviews;

    const reviewIds = reviews.map((r) => r.reviewId);

    // Answers
    const answerRows = await this.database.query(
      `MATCH (review:Review)-[:CONTAINS]->(a:Answer)
       WHERE review.reviewId IN $reviewIds
       RETURN review.reviewId AS reviewId, a`,
      { reviewIds }
    );
    for (const row of answerRows) {
      const review = reviews.find((r) => r.reviewId === row.reviewId);
      if (review) review.answers.push(toPlain(row.a || row));
    }

    // Remediation items (linked through answers)
    const remediationRows = await this.database.query(
      `MATCH (review:Review)-[:CONTAINS]->(a:Answer)-[:HAS_REMEDIATION]->(ri:RemediationItem)
       WHERE review.reviewId IN $reviewIds
       RETURN review.reviewId AS reviewId,
              a.domainIndex AS domainIndex,
              a.questionIndex AS questionIndex,
              ri`,
      { reviewIds }
    );
    for (const row of remediationRows) {
      const review = reviews.find((r) => r.reviewId === row.reviewId);
      if (review) {
        const ri = toPlain(row.ri || row);
        ri.answerKey = { domainIndex: toNumber(row.domainIndex), questionIndex: toNumber(row.questionIndex) };
        review.remediationItems.push(ri);
      }
    }

    // Proposed changes
    const proposedChangeRows = await this.database.query(
      `MATCH (review:Review)-[:HAS_PROPOSED_CHANGE]->(pc:ProposedChange)
       WHERE review.reviewId IN $reviewIds
       RETURN review.reviewId AS reviewId, pc`,
      { reviewIds }
    );
    for (const row of proposedChangeRows) {
      const review = reviews.find((r) => r.reviewId === row.reviewId);
      if (review) review.proposedChanges.push(toPlain(row.pc || row));
    }

    // Auditor comments
    const commentRows = await this.database.query(
      `MATCH (review:Review)-[:HAS_AUDITOR_COMMENT]->(ac:AuditorComment)
       WHERE review.reviewId IN $reviewIds
       RETURN review.reviewId AS reviewId, ac`,
      { reviewIds }
    );
    for (const row of commentRows) {
      const review = reviews.find((r) => r.reviewId === row.reviewId);
      if (review) review.auditorComments.push(toPlain(row.ac || row));
    }

    // Gate answers (standalone nodes matched by reviewId property)
    const gateAnswerRows = await this.database.query(
      `MATCH (ga:GateAnswer)
       WHERE ga.reviewId IN $reviewIds
       RETURN ga`,
      { reviewIds }
    );
    for (const row of gateAnswerRows) {
      const ga = toPlain(row.ga || row);
      const review = reviews.find((r) => r.reviewId === ga.reviewId);
      if (review) review.gateAnswers.push(ga);
    }

    return reviews;
  }

  // ════════════════════════════════════════════════════════════════════
  // IMPORT
  // ════════════════════════════════════════════════════════════════════

  async importTenantData(tenantId, exportData, { conflictStrategy = 'reject', regenerateIds = false, importedBy = 'system' } = {}) {
    // Verify tenant exists and is active
    const tenantRows = await this.database.query(
      `MATCH (t:Tenant {tenantId: $tenantId, active: true})
       RETURN t.name AS name`,
      { tenantId }
    );
    if (tenantRows.length === 0) {
      const error = new Error('Target tenant not found or inactive');
      error.statusCode = 404;
      throw error;
    }

    // Conflict check
    if (conflictStrategy === 'reject') {
      const existing = await this.database.query(
        `MATCH (r:Review)-[:SCOPED_TO]->(:Tenant {tenantId: $tenantId})
         RETURN count(r) AS count`,
        { tenantId }
      );
      const count = toNumber(existing[0]?.count);
      if (count > 0) {
        const error = new Error(`Target tenant already has ${count} review(s). Use conflictStrategy=merge or conflictStrategy=replace.`);
        error.statusCode = 409;
        throw error;
      }
    }

    // Wipe for replace strategy
    if (conflictStrategy === 'replace') {
      await this._wipeTenantData(tenantId);
    }

    // Build ID map for regeneration
    const idMap = regenerateIds ? this._buildIdMap(exportData) : null;
    const mapId = (originalId) => idMap ? (idMap.get(originalId) || originalId) : originalId;

    const warnings = [];
    const counts = {
      scoringConfigs: 0,
      questionnaireSnapshots: 0,
      questionnaireDrafts: 0,
      gateQuestions: 0,
      complianceTagConfigs: 0,
      users: 0,
      reviews: 0,
      answers: 0,
      remediationItems: 0,
      proposedChanges: 0,
      auditorComments: 0,
      gateAnswers: 0,
      skipped: 0,
    };

    // 1. ScoringConfigs
    for (const sc of (exportData.scoringConfigs || [])) {
      await this.database.query(
        `MERGE (sc:ScoringConfig {tenantId: $tenantId})
         SET sc.configId         = $configId,
             sc.dampingFactor    = $dampingFactor,
             sc.rawMax           = $rawMax,
             sc.ratingThresholds = $ratingThresholds,
             sc.ratingLabels     = $ratingLabels,
             sc.updated          = $now`,
        { tenantId, configId: sc.configId || tenantId, dampingFactor: sc.dampingFactor, rawMax: sc.rawMax, ratingThresholds: sc.ratingThresholds, ratingLabels: sc.ratingLabels, now: new Date().toISOString() }
      );
      counts.scoringConfigs++;
    }

    // 2. QuestionnaireSnapshots
    for (const snap of (exportData.questionnaireSnapshots || [])) {
      const existing = await this.database.query(
        `MATCH (snap:QuestionnaireSnapshot {version: $version, tenantId: $tenantId}) RETURN snap`,
        { version: snap.version, tenantId }
      );
      if (existing.length > 0 && conflictStrategy === 'merge') {
        counts.skipped++;
        continue;
      }
      await this.database.query(
        `MERGE (snap:QuestionnaireSnapshot {version: $version, tenantId: $tenantId})
         SET snap.label   = $label,
             snap.data    = $data,
             snap.created = $created`,
        { version: snap.version, tenantId, label: snap.label, data: snap.data, created: snap.created }
      );
      counts.questionnaireSnapshots++;
    }

    // 3. QuestionnaireDrafts
    for (const draft of (exportData.questionnaireDrafts || [])) {
      const draftId = mapId(draft.draftId);
      await this.database.query(
        `CREATE (d:QuestionnaireDraft {
           draftId:   $draftId,
           tenantId:  $tenantId,
           label:     $label,
           status:    $status,
           data:      $data,
           createdBy: $createdBy,
           created:   $created,
           updated:   $updated
         })`,
        { draftId, tenantId, label: draft.label, status: draft.status, data: draft.data, createdBy: draft.createdBy || importedBy, created: draft.created, updated: draft.updated }
      );
      counts.questionnaireDrafts++;
    }

    // 4. GateQuestions
    for (const gq of (exportData.gateQuestions || [])) {
      await this.database.query(
        `MERGE (gq:GateQuestion {gateId: $gateId})
         SET gq.tenantId     = $tenantId,
             gq.function     = $function,
             gq.text         = $text,
             gq.choices      = $choices,
             gq.prefillRules = $prefillRules,
             gq.sortOrder    = $sortOrder,
             gq.active       = $active,
             gq.updated      = $now`,
        { gateId: gq.gateId, tenantId, function: gq.function, text: gq.text, choices: gq.choices, prefillRules: gq.prefillRules, sortOrder: gq.sortOrder, active: gq.active ?? true, now: new Date().toISOString() }
      );
      counts.gateQuestions++;
    }

    // 5. ComplianceTagConfigs
    for (const ctc of (exportData.complianceTagConfigs || [])) {
      await this.database.query(
        `MERGE (ctc:ComplianceTagConfig {tag: $tag, tenantId: $tenantId})
         SET ctc.action  = $action,
             ctc.baseUrl = $baseUrl`,
        { tag: ctc.tag, tenantId, action: ctc.action, baseUrl: ctc.baseUrl }
      );
      counts.complianceTagConfigs++;
    }

    // 6. Users
    for (const user of (exportData.users || [])) {
      await this.database.query(
        `MERGE (u:User {sub: $sub})
         ON CREATE SET u.username    = $username,
                       u.email       = $email,
                       u.displayName = $displayName,
                       u.roles       = $roles,
                       u.firstSeen   = $firstSeen,
                       u.lastSeen    = $lastSeen
         WITH u
         MATCH (t:Tenant {tenantId: $tenantId})
         MERGE (u)-[:BELONGS_TO]->(t)`,
        { sub: user.sub, username: user.username, email: user.email, displayName: user.displayName, roles: user.roles, firstSeen: user.firstSeen, lastSeen: user.lastSeen, tenantId }
      );
      counts.users++;
    }

    // 7-12. Reviews with children
    for (const review of (exportData.reviews || [])) {
      const reviewId = mapId(review.reviewId);

      // Check for existing review in merge mode
      if (conflictStrategy === 'merge') {
        const existing = await this.database.query(
          `MATCH (r:Review {reviewId: $reviewId}) RETURN r`,
          { reviewId }
        );
        if (existing.length > 0) {
          counts.skipped++;
          continue;
        }
      }

      // Create review + SCOPED_TO + USES_QUESTIONNAIRE
      await this.database.query(
        `CREATE (review:Review {
           reviewId:              $reviewId,
           applicationName:       $applicationName,
           assessor:              $assessor,
           status:                $status,
           classificationChoice:  $classificationChoice,
           classificationFactor:  $classificationFactor,
           sourceChoice:          $sourceChoice,
           environmentChoice:     $environmentChoice,
           deploymentArchetype:   $deploymentArchetype,
           questionnaireVersion:  $questionnaireVersion,
           rskRaw:               $rskRaw,
           rskNormalized:        $rskNormalized,
           rating:               $rating,
           notes:                $notes,
           active:               $active,
           created:              $created,
           createdBy:            $createdBy,
           updated:              $updated,
           updatedBy:            $updatedBy,
           submittedTimestamp:    $submittedTimestamp,
           previousNames:        $previousNames
         })
         WITH review
         MATCH (tenant:Tenant {tenantId: $tenantId})
         MERGE (review)-[:SCOPED_TO]->(tenant)
         WITH review
         OPTIONAL MATCH (q:Questionnaire)-[:CURRENT_VERSION]->(snap:QuestionnaireSnapshot)
         WHERE snap.version = $questionnaireVersion
         FOREACH (_ IN CASE WHEN q IS NOT NULL THEN [1] ELSE [] END |
           MERGE (review)-[:USES_QUESTIONNAIRE]->(q)
         )`,
        {
          reviewId,
          applicationName: review.applicationName,
          assessor: review.assessor,
          status: review.status,
          classificationChoice: review.classificationChoice ?? null,
          classificationFactor: review.classificationFactor ?? null,
          sourceChoice: review.sourceChoice ?? null,
          environmentChoice: review.environmentChoice ?? null,
          deploymentArchetype: review.deploymentArchetype ?? null,
          questionnaireVersion: review.questionnaireVersion ?? null,
          rskRaw: review.rskRaw ?? 0,
          rskNormalized: review.rskNormalized ?? 0,
          rating: review.rating ?? null,
          notes: review.notes ?? '',
          active: review.active ?? true,
          created: review.created,
          createdBy: review.createdBy,
          updated: review.updated,
          updatedBy: review.updatedBy ?? null,
          submittedTimestamp: review.submittedTimestamp ?? null,
          previousNames: review.previousNames ?? null,
          tenantId,
        }
      );
      counts.reviews++;

      // Answers
      for (const answer of (review.answers || [])) {
        await this.database.query(
          `MATCH (review:Review {reviewId: $reviewId})
           CREATE (review)-[:CONTAINS]->(a:Answer {
             domainIndex:   $domainIndex,
             questionIndex: $questionIndex,
             questionId:    $questionId,
             choiceText:    $choiceText,
             questionText:  $questionText,
             rawScore:      $rawScore,
             weightTier:    $weightTier,
             measurement:   $measurement,
             notes:         $notes,
             gatedBy:       $gatedBy,
             created:       $created,
             createdBy:     $createdBy,
             updated:       $updated,
             updatedBy:     $updatedBy
           })
           WITH a
           OPTIONAL MATCH (q:Question {domainIndex: $domainIndex, questionIndex: $questionIndex})
           FOREACH (_ IN CASE WHEN q IS NOT NULL THEN [1] ELSE [] END |
             MERGE (a)-[:ANSWERS]->(q)
           )`,
          {
            reviewId,
            domainIndex: answer.domainIndex,
            questionIndex: answer.questionIndex,
            questionId: answer.questionId ?? null,
            choiceText: answer.choiceText ?? null,
            questionText: answer.questionText ?? null,
            rawScore: answer.rawScore ?? 0,
            weightTier: answer.weightTier ?? null,
            measurement: answer.measurement ?? 0,
            notes: answer.notes ?? '',
            gatedBy: answer.gatedBy ?? null,
            created: answer.created ?? null,
            createdBy: answer.createdBy ?? null,
            updated: answer.updated ?? null,
            updatedBy: answer.updatedBy ?? null,
          }
        );
        counts.answers++;
      }

      // Remediation items
      for (const ri of (review.remediationItems || [])) {
        const remediationId = mapId(ri.remediationId);
        const answerKey = ri.answerKey || {};
        await this.database.query(
          `MATCH (review:Review {reviewId: $reviewId})-[:CONTAINS]->(a:Answer)
           WHERE a.domainIndex = $domainIndex AND a.questionIndex = $questionIndex
           CREATE (a)-[:HAS_REMEDIATION]->(ri:RemediationItem {
             remediationId:    $remediationId,
             proposedAction:   $proposedAction,
             assignedFunction: $assignedFunction,
             assignedTo:       $assignedTo,
             status:           $status,
             responseType:     $responseType,
             mitigationPercent: $mitigationPercent,
             riskAcceptedBy:   $riskAcceptedBy,
             riskAcceptedAt:   $riskAcceptedAt,
             completedAt:      $completedAt,
             targetDate:       $targetDate,
             notes:            $notes,
             created:          $created,
             createdBy:        $createdBy,
             updated:          $updated,
             updatedBy:        $updatedBy
           })`,
          {
            reviewId,
            domainIndex: answerKey.domainIndex ?? ri.domainIndex,
            questionIndex: answerKey.questionIndex ?? ri.questionIndex,
            remediationId,
            proposedAction: ri.proposedAction ?? null,
            assignedFunction: ri.assignedFunction ?? null,
            assignedTo: ri.assignedTo ?? null,
            status: ri.status ?? 'OPEN',
            responseType: ri.responseType ?? null,
            mitigationPercent: ri.mitigationPercent ?? null,
            riskAcceptedBy: ri.riskAcceptedBy ?? null,
            riskAcceptedAt: ri.riskAcceptedAt ?? null,
            completedAt: ri.completedAt ?? null,
            targetDate: ri.targetDate ?? null,
            notes: ri.notes ?? '',
            created: ri.created ?? null,
            createdBy: ri.createdBy ?? null,
            updated: ri.updated ?? null,
            updatedBy: ri.updatedBy ?? null,
          }
        );
        counts.remediationItems++;
      }

      // Proposed changes
      for (const pc of (review.proposedChanges || [])) {
        const changeId = mapId(pc.changeId);
        await this.database.query(
          `MATCH (review:Review {reviewId: $reviewId})
           CREATE (review)-[:HAS_PROPOSED_CHANGE]->(pc:ProposedChange {
             changeId:       $changeId,
             domainIndex:    $domainIndex,
             questionIndex:  $questionIndex,
             choiceText:     $choiceText,
             rawScore:       $rawScore,
             notes:          $notes,
             proposedBy:     $proposedBy,
             proposedAt:     $proposedAt,
             status:         $status,
             resolvedBy:     $resolvedBy,
             resolvedAt:     $resolvedAt
           })
           WITH pc
           OPTIONAL MATCH (q:Question {domainIndex: $domainIndex, questionIndex: $questionIndex})
           FOREACH (_ IN CASE WHEN q IS NOT NULL THEN [1] ELSE [] END |
             MERGE (pc)-[:FOR_QUESTION]->(q)
           )`,
          {
            reviewId,
            changeId,
            domainIndex: pc.domainIndex,
            questionIndex: pc.questionIndex,
            choiceText: pc.choiceText ?? null,
            rawScore: pc.rawScore ?? 0,
            notes: pc.notes ?? '',
            proposedBy: pc.proposedBy ?? null,
            proposedAt: pc.proposedAt ?? null,
            status: pc.status ?? 'PENDING',
            resolvedBy: pc.resolvedBy ?? null,
            resolvedAt: pc.resolvedAt ?? null,
          }
        );
        counts.proposedChanges++;
      }

      // Auditor comments
      for (const ac of (review.auditorComments || [])) {
        const commentId = mapId(ac.commentId);
        await this.database.query(
          `MATCH (review:Review {reviewId: $reviewId})
           CREATE (review)-[:HAS_AUDITOR_COMMENT]->(ac:AuditorComment {
             commentId:   $commentId,
             text:        $text,
             author:      $author,
             created:     $created,
             resolved:    $resolved,
             resolvedBy:  $resolvedBy,
             resolvedAt:  $resolvedAt
           })`,
          {
            reviewId,
            commentId,
            text: ac.text ?? '',
            author: ac.author ?? null,
            created: ac.created ?? null,
            resolved: ac.resolved ?? false,
            resolvedBy: ac.resolvedBy ?? null,
            resolvedAt: ac.resolvedAt ?? null,
          }
        );
        counts.auditorComments++;
      }

      // Gate answers (standalone nodes)
      for (const ga of (review.gateAnswers || [])) {
        await this.database.query(
          `CREATE (ga:GateAnswer {
             reviewId:      $reviewId,
             gateId:        $gateId,
             choiceIndex:   $choiceIndex,
             respondedBy:   $respondedBy,
             respondedAt:   $respondedAt,
             evidenceNotes: $evidenceNotes
           })`,
          {
            reviewId,
            gateId: ga.gateId,
            choiceIndex: ga.choiceIndex,
            respondedBy: ga.respondedBy ?? null,
            respondedAt: ga.respondedAt ?? null,
            evidenceNotes: ga.evidenceNotes ?? '',
          }
        );
        counts.gateAnswers++;
      }
    }

    return { success: true, targetTenantId: tenantId, counts, warnings };
  }

  // ── Wipe all tenant data (for replace strategy) ──────────────────

  async _wipeTenantData(tenantId) {
    // Delete review children first: remediation → answers → proposed changes → comments
    await this.database.query(
      `MATCH (review:Review)-[:SCOPED_TO]->(:Tenant {tenantId: $tenantId})
       MATCH (review)-[:CONTAINS]->(a:Answer)-[:HAS_REMEDIATION]->(ri:RemediationItem)
       DETACH DELETE ri`,
      { tenantId }
    );
    await this.database.query(
      `MATCH (review:Review)-[:SCOPED_TO]->(:Tenant {tenantId: $tenantId})
       MATCH (review)-[:CONTAINS]->(a:Answer)
       DETACH DELETE a`,
      { tenantId }
    );
    await this.database.query(
      `MATCH (review:Review)-[:SCOPED_TO]->(:Tenant {tenantId: $tenantId})
       MATCH (review)-[:HAS_PROPOSED_CHANGE]->(pc:ProposedChange)
       DETACH DELETE pc`,
      { tenantId }
    );
    await this.database.query(
      `MATCH (review:Review)-[:SCOPED_TO]->(:Tenant {tenantId: $tenantId})
       MATCH (review)-[:HAS_AUDITOR_COMMENT]->(ac:AuditorComment)
       DETACH DELETE ac`,
      { tenantId }
    );
    // Gate answers (standalone nodes — match via review IDs)
    await this.database.query(
      `MATCH (review:Review)-[:SCOPED_TO]->(:Tenant {tenantId: $tenantId})
       WITH collect(review.reviewId) AS reviewIds
       MATCH (ga:GateAnswer) WHERE ga.reviewId IN reviewIds
       DELETE ga`,
      { tenantId }
    );
    // Reviews themselves
    await this.database.query(
      `MATCH (review:Review)-[:SCOPED_TO]->(:Tenant {tenantId: $tenantId})
       DETACH DELETE review`,
      { tenantId }
    );
    // Config nodes
    await this.database.query(`MATCH (n:ScoringConfig {tenantId: $tenantId}) DETACH DELETE n`, { tenantId });
    await this.database.query(`MATCH (n:QuestionnaireSnapshot {tenantId: $tenantId}) DETACH DELETE n`, { tenantId });
    await this.database.query(`MATCH (n:QuestionnaireDraft {tenantId: $tenantId}) DETACH DELETE n`, { tenantId });
    await this.database.query(`MATCH (n:GateQuestion {tenantId: $tenantId}) DETACH DELETE n`, { tenantId });
    await this.database.query(`MATCH (n:ComplianceTagConfig {tenantId: $tenantId}) DETACH DELETE n`, { tenantId });
    // Remove user BELONGS_TO edges (but keep the User nodes — they may belong to other tenants)
    await this.database.query(
      `MATCH (u:User)-[rel:BELONGS_TO]->(:Tenant {tenantId: $tenantId})
       DELETE rel`,
      { tenantId }
    );
  }

  // ── Build ID regeneration map ────────────────────────────────────

  _buildIdMap(exportData) {
    const map = new Map();
    for (const draft of (exportData.questionnaireDrafts || [])) {
      map.set(draft.draftId, randomUUID());
    }
    for (const review of (exportData.reviews || [])) {
      map.set(review.reviewId, randomUUID());
      for (const ri of (review.remediationItems || [])) {
        map.set(ri.remediationId, randomUUID());
      }
      for (const pc of (review.proposedChanges || [])) {
        map.set(pc.changeId, randomUUID());
      }
      for (const ac of (review.auditorComments || [])) {
        map.set(ac.commentId, randomUUID());
      }
    }
    return map;
  }
}
