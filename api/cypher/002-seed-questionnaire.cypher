// ════════════════════════════════════════════════════════════════════
// ASR Neo4j Schema — Seed Questionnaire Data
// ════════════════════════════════════════════════════════════════════
// Seeds the static questionnaire structure from asr_questions.yaml.
// MERGE ensures idempotency — safe to re-run.
//
// Tuning dials (all admin-adjustable, zero code deployment):
//   1. ClassificationChoice.factor   — global multiplier per review
//   2. WeightTier.value              — per-tier weight across questions
//   3. Question.choiceScores         — per-question score override
//   4. ScoringConfig.*               — damping, thresholds, labels
// ════════════════════════════════════════════════════════════════════

// ─── Scoring Configuration ───────────────────────────────────────

MERGE (config:ScoringConfig {configId: 'default'})
  SET config.dampingFactor    = 4,
      config.rawMax           = 134,
      config.ratingThresholds = [25, 50, 75],
      config.ratingLabels     = ['Low', 'Moderate', 'Elevated', 'Critical'],
      config.updated          = datetime();

// ─── Weight Tiers ────────────────────────────────────────────────

MERGE (critical:WeightTier {name: 'Critical'})
  SET critical.value = 100, critical.updated = datetime();

MERGE (high:WeightTier {name: 'High'})
  SET high.value = 67, high.updated = datetime();

MERGE (medium:WeightTier {name: 'Medium'})
  SET medium.value = 33, medium.updated = datetime();

MERGE (info:WeightTier {name: 'Info'})
  SET info.value = 13, info.updated = datetime();

// ─── Score Scale Templates (defaults for seeding new questions) ──

MERGE (scales:ScoreScale {scaleId: 'default'})
  SET scales.threeChoice  = [20, 50, 70],
      scales.fourChoice   = [20, 40, 60, 80],
      scales.fiveChoice   = [15, 35, 50, 70, 85],
      scales.naScore      = 1,
      scales.updated      = datetime();

// ═════════════════════════════════════════════════════════════════
// Classification Question (Transcendental — multiplies all others)
// ═════════════════════════════════════════════════════════════════

MERGE (classification:ClassificationQuestion {questionId: 'classification'})
  SET classification.text      = 'Has a risk classification been assigned to this application?',
      classification.naAllowed = false,
      classification.updated   = datetime()
WITH classification
UNWIND [
  {text: 'Yes — Low',                    factor: 40, sortOrder: 0},
  {text: 'Yes — Medium',                 factor: 60, sortOrder: 1},
  {text: 'Yes — High',                   factor: 80, sortOrder: 2},
  {text: 'Yes — Critical',               factor: 100, sortOrder: 3},
  {text: 'No classification assigned',   factor: 100, sortOrder: 4}
] AS choice
MERGE (classification)-[:HAS_CHOICE]->(c:ClassificationChoice {text: choice.text})
  SET c.factor    = choice.factor,
      c.sortOrder = choice.sortOrder,
      c.updated   = datetime();

// ═════════════════════════════════════════════════════════════════
// Domain 0: Governance and Program Management (11 questions)
// ═════════════════════════════════════════════════════════════════

MERGE (d0:Domain {domainIndex: 0})
  SET d0.name        = 'Governance and Program Management',
      d0.policyRefs  = ['ISP 1.0', 'ISP 2.1', 'ISP 2.4', 'ISP 2.5'],
      d0.csfRefs     = ['GV.OC', 'GV.PO', 'GV.OV'],
      d0.active      = true,
      d0.updated     = datetime();

MERGE (d0q1:Question {domainIndex: 0, questionIndex: 0})
  SET d0q1.text         = 'Does the application have a designated security owner or steward?',
      d0q1.weightTier   = 'High',
      d0q1.choices      = ['Yes — named owner in CMDB', 'Yes — informal ownership', 'No — ownership not established'],
      d0q1.choiceScores = [20, 50, 70],
      d0q1.naScore      = 1, d0q1.updated = datetime();

MERGE (d0q2:Question {domainIndex: 0, questionIndex: 1})
  SET d0q2.text         = 'Is the application included in the organization\'s security policy scope?',
      d0q2.weightTier   = 'Medium',
      d0q2.choices      = ['Yes — explicitly referenced', 'Yes — covered by umbrella policy', 'No — not in scope', 'Unknown'],
      d0q2.choiceScores = [20, 40, 60, 80],
      d0q2.naScore      = 1, d0q2.updated = datetime();

MERGE (d0q3:Question {domainIndex: 0, questionIndex: 2})
  SET d0q3.text         = 'When was the last security review or assessment performed?',
      d0q3.weightTier   = 'High',
      d0q3.choices      = ['Within 6 months', '6–12 months ago', 'More than 12 months ago', 'Never assessed'],
      d0q3.choiceScores = [20, 40, 60, 80],
      d0q3.naScore      = 1, d0q3.updated = datetime();

MERGE (d0q4:Question {domainIndex: 0, questionIndex: 3})
  SET d0q4.text         = 'Does the application have documented data flow diagrams?',
      d0q4.weightTier   = 'Medium',
      d0q4.choices      = ['Yes — current and reviewed', 'Yes — but outdated', 'No — not documented'],
      d0q4.choiceScores = [20, 50, 70],
      d0q4.naScore      = 1, d0q4.updated = datetime();

MERGE (d0q5:Question {domainIndex: 0, questionIndex: 4})
  SET d0q5.text         = 'Has a RACI matrix been established for this application\'s security controls?',
      d0q5.weightTier   = 'High',
      d0q5.choices      = ['Yes — documented and current', 'Yes — but outdated or incomplete', 'No — roles informally understood', 'No — accountability not defined'],
      d0q5.choiceScores = [20, 40, 60, 80],
      d0q5.naScore      = 1, d0q5.updated = datetime();

MERGE (d0q6:Question {domainIndex: 0, questionIndex: 5})
  SET d0q6.text         = 'Are escalation paths and notification responsibilities documented for security incidents involving this application?',
      d0q6.weightTier   = 'High',
      d0q6.choices      = ['Yes — RACI-aligned runbook with named contacts', 'Yes — general escalation via IRP', 'Partial — ad-hoc escalation only', 'No — not documented'],
      d0q6.choiceScores = [20, 40, 60, 80],
      d0q6.naScore      = 1, d0q6.updated = datetime();

MERGE (d0q7:Question {domainIndex: 0, questionIndex: 6})
  SET d0q7.text         = 'What is the business necessity classification for this application?',
      d0q7.weightTier   = 'Medium',
      d0q7.choices      = ['Nice to have — productivity enhancement (MAY)', 'Business need — supports key objectives (SHOULD)', 'KTLO — operationally required (MUST)', 'Not classified'],
      d0q7.choiceScores = [20, 40, 60, 80],
      d0q7.naScore      = 1, d0q7.updated = datetime();

MERGE (d0q8:Question {domainIndex: 0, questionIndex: 7})
  SET d0q8.text         = 'Which teams and departments are authorized to use this application?',
      d0q8.weightTier   = 'Medium',
      d0q8.choices      = ['Single team or department', 'Multiple departments — formally scoped', 'Enterprise-wide — all departments', 'Not formally scoped'],
      d0q8.choiceScores = [20, 40, 60, 80],
      d0q8.naScore      = 1, d0q8.updated = datetime();

MERGE (d0q9:Question {domainIndex: 0, questionIndex: 8})
  SET d0q9.text         = 'Are productivity improvement estimates or benchmarks documented for this application?',
      d0q9.weightTier   = 'Medium',
      d0q9.choices      = ['Yes — quantified with baseline metrics and KPIs', 'Yes — qualitative estimates documented', 'Informal understanding only', 'No estimates or benchmarks'],
      d0q9.choiceScores = [20, 40, 60, 80],
      d0q9.naScore      = 1, d0q9.updated = datetime();

MERGE (d0q10:Question {domainIndex: 0, questionIndex: 9})
  SET d0q10.text         = 'Has legal counsel reviewed this application\'s terms of service, data handling, and intellectual property implications?',
      d0q10.weightTier   = 'High',
      d0q10.choices      = ['Yes — reviewed and approved', 'Yes — reviewed with conditions or caveats', 'Review requested but not completed', 'Not reviewed'],
      d0q10.choiceScores = [20, 40, 60, 80],
      d0q10.naScore      = 1, d0q10.updated = datetime();

MERGE (d0q11:Question {domainIndex: 0, questionIndex: 10})
  SET d0q11.text         = 'Has the application been reviewed and approved through the enterprise architecture governance process?',
      d0q11.weightTier   = 'High',
      d0q11.choices      = ['Yes — approved with defined boundaries and controls', 'Yes — approved for limited or pilot use', 'Under review', 'No — not submitted for architecture review'],
      d0q11.choiceScores = [20, 40, 60, 80],
      d0q11.naScore      = 1, d0q11.updated = datetime();

MATCH (d0:Domain {domainIndex: 0})
MATCH (question:Question) WHERE question.domainIndex = 0
MERGE (question)-[:BELONGS_TO]->(d0);

MATCH (question:Question) WHERE question.domainIndex = 0
MATCH (tier:WeightTier {name: question.weightTier})
MERGE (question)-[:HAS_WEIGHT]->(tier);


// ═════════════════════════════════════════════════════════════════
// Domain 1: Identity and Access Management (6 questions)
// ═════════════════════════════════════════════════════════════════

MERGE (d1:Domain {domainIndex: 1})
  SET d1.name        = 'Identity and Access Management',
      d1.policyRefs  = ['ISP 4.1', 'ISP 2.3', 'IISP 8.0'],
      d1.csfRefs     = ['PR.AA'],
      d1.active      = true,
      d1.updated     = datetime();

MERGE (d1q1:Question {domainIndex: 1, questionIndex: 0})
  SET d1q1.text         = 'What authentication mechanism does the application use?',
      d1q1.weightTier   = 'Critical',
      d1q1.choices      = ['SSO with MFA (Entra ID)', 'SSO without MFA', 'Local authentication with MFA', 'Local authentication without MFA'],
      d1q1.choiceScores = [20, 40, 60, 80],
      d1q1.naScore      = 1, d1q1.updated = datetime();

MERGE (d1q2:Question {domainIndex: 1, questionIndex: 1})
  SET d1q2.text         = 'What authentication method do APIs exposed or consumed by this application use?',
      d1q2.weightTier   = 'Critical',
      d1q2.choices      = ['OAuth 2.0 / OIDC with scoped tokens', 'API key with IP allowlisting and rate limiting', 'API key without restrictions', 'No API authentication required'],
      d1q2.choiceScores = [20, 40, 60, 80],
      d1q2.naScore      = 1, d1q2.updated = datetime();

MERGE (d1q3:Question {domainIndex: 1, questionIndex: 2})
  SET d1q3.text         = 'Are user roles and permissions based on the principle of least privilege?',
      d1q3.weightTier   = 'High',
      d1q3.choices      = ['Yes — RBAC/ABAC enforced', 'Partially — some roles over-privileged', 'No — broad access grants', 'Unknown'],
      d1q3.choiceScores = [20, 40, 60, 80],
      d1q3.naScore      = 1, d1q3.updated = datetime();

MERGE (d1q4:Question {domainIndex: 1, questionIndex: 3})
  SET d1q4.text         = 'How are service accounts and API keys managed?',
      d1q4.weightTier   = 'Critical',
      d1q4.choices      = ['Vault/managed identities with rotation', 'Stored securely with manual rotation', 'Hard-coded or shared credentials'],
      d1q4.choiceScores = [20, 50, 70],
      d1q4.naScore      = 1, d1q4.updated = datetime();

MERGE (d1q5:Question {domainIndex: 1, questionIndex: 4})
  SET d1q5.text         = 'Is there automated provisioning/deprovisioning tied to HR events?',
      d1q5.weightTier   = 'High',
      d1q5.choices      = ['Yes — fully automated via SCIM/JIT', 'Partially automated', 'Manual process only', 'No process in place'],
      d1q5.choiceScores = [20, 40, 60, 80],
      d1q5.naScore      = 1, d1q5.updated = datetime();

MERGE (d1q6:Question {domainIndex: 1, questionIndex: 5})
  SET d1q6.text         = 'Are access reviews performed periodically?',
      d1q6.weightTier   = 'High',
      d1q6.choices      = ['Quarterly or more frequently', 'Semi-annually', 'Annually', 'No periodic reviews'],
      d1q6.choiceScores = [20, 40, 60, 80],
      d1q6.naScore      = 1, d1q6.updated = datetime();

MATCH (d1:Domain {domainIndex: 1})
MATCH (question:Question) WHERE question.domainIndex = 1
MERGE (question)-[:BELONGS_TO]->(d1);

MATCH (question:Question) WHERE question.domainIndex = 1
MATCH (tier:WeightTier {name: question.weightTier})
MERGE (question)-[:HAS_WEIGHT]->(tier);


// ═════════════════════════════════════════════════════════════════
// Domain 2: Data Protection and Privacy (6 questions)
// ═════════════════════════════════════════════════════════════════

MERGE (d2:Domain {domainIndex: 2})
  SET d2.name        = 'Data Protection and Privacy',
      d2.policyRefs  = ['ISP 4.3', 'IISP 2.0', 'IISP 3.0'],
      d2.csfRefs     = ['PR.DS'],
      d2.ferpaNote   = 'Applications processing student education records must comply with FERPA §99.30 (consent), §99.31 (exceptions), and §99.37 (directory information).',
      d2.active      = true,
      d2.updated     = datetime();

MERGE (d2q1:Question {domainIndex: 2, questionIndex: 0})
  SET d2q1.text         = 'Does the application process, store, or transmit student education records (FERPA-protected data)?',
      d2q1.weightTier   = 'Critical',
      d2q1.choices      = ['No — no education records', 'Yes — incidental processing', 'Yes — primary function', 'Unknown / Not assessed'],
      d2q1.choiceScores = [20, 40, 60, 80],
      d2q1.naScore      = 1, d2q1.updated = datetime();

MERGE (d2q2:Question {domainIndex: 2, questionIndex: 1})
  SET d2q2.text         = 'Is data encrypted at rest?',
      d2q2.weightTier   = 'High',
      d2q2.choices      = ['Yes — AES-256 or equivalent', 'Yes — platform-managed encryption', 'Partial encryption', 'No encryption at rest'],
      d2q2.choiceScores = [20, 40, 60, 80],
      d2q2.naScore      = 1, d2q2.updated = datetime();

MERGE (d2q3:Question {domainIndex: 2, questionIndex: 2})
  SET d2q3.text         = 'Is data encrypted in transit?',
      d2q3.weightTier   = 'Critical',
      d2q3.choices      = ['Yes — TLS 1.2+ enforced', 'Yes — TLS with older versions allowed', 'Partial — some endpoints unencrypted', 'No encryption in transit'],
      d2q3.choiceScores = [20, 40, 60, 80],
      d2q3.naScore      = 1, d2q3.updated = datetime();

MERGE (d2q4:Question {domainIndex: 2, questionIndex: 3})
  SET d2q4.text         = 'What is the data classification level of information processed?',
      d2q4.weightTier   = 'High',
      d2q4.choices      = ['Public', 'Internal / Confidential', 'Restricted / Highly Sensitive', 'Not classified'],
      d2q4.choiceScores = [20, 40, 60, 80],
      d2q4.naScore      = 1, d2q4.updated = datetime();

MERGE (d2q5:Question {domainIndex: 2, questionIndex: 4})
  SET d2q5.text         = 'Are data retention and disposal procedures implemented?',
      d2q5.weightTier   = 'Medium',
      d2q5.choices      = ['Yes — automated lifecycle management', 'Yes — manual procedures documented', 'Partial — some data managed', 'No retention/disposal procedures'],
      d2q5.choiceScores = [20, 40, 60, 80],
      d2q5.naScore      = 1, d2q5.updated = datetime();

MERGE (d2q6:Question {domainIndex: 2, questionIndex: 5})
  SET d2q6.text         = 'Does the application maintain disclosure records as required by FERPA §99.32?',
      d2q6.weightTier   = 'High',
      d2q6.choices      = ['Yes — automated logging', 'Yes — manual records', 'No — not implemented'],
      d2q6.choiceScores = [20, 50, 70],
      d2q6.naScore      = 1, d2q6.updated = datetime();

MATCH (d2:Domain {domainIndex: 2})
MATCH (question:Question) WHERE question.domainIndex = 2
MERGE (question)-[:BELONGS_TO]->(d2);

MATCH (question:Question) WHERE question.domainIndex = 2
MATCH (tier:WeightTier {name: question.weightTier})
MERGE (question)-[:HAS_WEIGHT]->(tier);


// ═════════════════════════════════════════════════════════════════
// Domain 3: Secure Development and Change Management (7 questions)
// ═════════════════════════════════════════════════════════════════

MERGE (d3:Domain {domainIndex: 3})
  SET d3.name        = 'Secure Development and Change Management',
      d3.policyRefs  = ['ISP 4.4', 'IISP 9.0'],
      d3.csfRefs     = ['PR.PS'],
      d3.soxNote     = 'SOX §404 ITGC domains CM-1 through CM-6 and PD-1 through PD-4 require documented change management and security testing controls.',
      d3.active      = true,
      d3.updated     = datetime();

MERGE (d3q1:Question {domainIndex: 3, questionIndex: 0})
  SET d3q1.text         = 'Is the application developed using a documented SDLC methodology?',
      d3q1.weightTier   = 'High',
      d3q1.choices      = ['Yes — with security gates', 'Yes — without explicit security gates', 'Informal development process'],
      d3q1.choiceScores = [20, 50, 70],
      d3q1.naScore      = 1, d3q1.updated = datetime();

MERGE (d3q2:Question {domainIndex: 3, questionIndex: 1})
  SET d3q2.text         = 'Are SAST and/or SCA scans integrated into the CI/CD pipeline?',
      d3q2.weightTier   = 'Critical',
      d3q2.choices      = ['Yes — blocking on critical findings', 'Yes — advisory only', 'Manual scans only', 'No security scanning'],
      d3q2.choiceScores = [20, 40, 60, 80],
      d3q2.naScore      = 1, d3q2.updated = datetime();

MERGE (d3q3:Question {domainIndex: 3, questionIndex: 2})
  SET d3q3.text         = 'Is DAST or penetration testing performed?',
      d3q3.weightTier   = 'High',
      d3q3.choices      = ['Yes — automated DAST in CI/CD + annual pentest', 'Annual penetration test only', 'Ad-hoc testing', 'No DAST or penetration testing'],
      d3q3.choiceScores = [20, 40, 60, 80],
      d3q3.naScore      = 1, d3q3.updated = datetime();

MERGE (d3q4:Question {domainIndex: 3, questionIndex: 3})
  SET d3q4.text         = 'Are development, test, and production environments segregated?',
      d3q4.weightTier   = 'High',
      d3q4.choices      = ['Yes — fully segregated with access controls', 'Partially segregated', 'Shared environments'],
      d3q4.choiceScores = [20, 50, 70],
      d3q4.naScore      = 1, d3q4.updated = datetime();

MERGE (d3q5:Question {domainIndex: 3, questionIndex: 4})
  SET d3q5.text         = 'Is there a formal change approval process for production deployments?',
      d3q5.weightTier   = 'High',
      d3q5.choices      = ['Yes — CAB/change authority approval required', 'Yes — peer review only', 'No formal approval process'],
      d3q5.choiceScores = [20, 50, 70],
      d3q5.naScore      = 1, d3q5.updated = datetime();

MERGE (d3q6:Question {domainIndex: 3, questionIndex: 5})
  SET d3q6.text         = 'Is the application managed through the enterprise endpoint or patch management system, or does it require an out-of-band update mechanism?',
      d3q6.weightTier   = 'High',
      d3q6.choices      = ['Fully managed via enterprise MDM/SCCM', 'Partially managed — some updates out-of-band', 'Entirely out-of-band (CLI / manual / vendor-pushed)'],
      d3q6.choiceScores = [20, 50, 70],
      d3q6.naScore      = 1, d3q6.updated = datetime();

MERGE (d3q7:Question {domainIndex: 3, questionIndex: 6})
  SET d3q7.text         = 'Are human review and approval required before application outputs are used in production or decision-making?',
      d3q7.weightTier   = 'High',
      d3q7.choices      = ['Yes — mandatory human review with sign-off', 'Yes — sampling-based or risk-tiered review', 'No — outputs used directly without review'],
      d3q7.choiceScores = [20, 50, 70],
      d3q7.naScore      = 1, d3q7.updated = datetime();

MATCH (d3:Domain {domainIndex: 3})
MATCH (question:Question) WHERE question.domainIndex = 3
MERGE (question)-[:BELONGS_TO]->(d3);

MATCH (question:Question) WHERE question.domainIndex = 3
MATCH (tier:WeightTier {name: question.weightTier})
MERGE (question)-[:HAS_WEIGHT]->(tier);


// ═════════════════════════════════════════════════════════════════
// Domain 4: Vulnerability and Threat Management (7 questions)
// ═════════════════════════════════════════════════════════════════

MERGE (d4:Domain {domainIndex: 4})
  SET d4.name        = 'Vulnerability and Threat Management',
      d4.policyRefs  = ['IISP 7.0', 'ISP 3.2', 'ISP 5.1'],
      d4.csfRefs     = ['ID.RA', 'DE.CM'],
      d4.active      = true,
      d4.updated     = datetime();

MERGE (d4q1:Question {domainIndex: 4, questionIndex: 0})
  SET d4q1.text         = 'Is the application included in vulnerability scanning scope?',
      d4q1.weightTier   = 'Critical',
      d4q1.choices      = ['Yes — authenticated scans weekly+', 'Yes — unauthenticated scans', 'Ad-hoc scanning only', 'Not in scanning scope'],
      d4q1.choiceScores = [20, 40, 60, 80],
      d4q1.naScore      = 1, d4q1.updated = datetime();

MERGE (d4q2:Question {domainIndex: 4, questionIndex: 1})
  SET d4q2.text         = 'What is the SLA for remediating critical vulnerabilities?',
      d4q2.weightTier   = 'High',
      d4q2.choices      = ['7 days or fewer', '8–30 days', '31–90 days', '> 90 days or no SLA'],
      d4q2.choiceScores = [20, 40, 60, 80],
      d4q2.naScore      = 1, d4q2.updated = datetime();

MERGE (d4q3:Question {domainIndex: 4, questionIndex: 2})
  SET d4q3.text         = 'Is the application monitored for security events?',
      d4q3.weightTier   = 'High',
      d4q3.choices      = ['Yes — SIEM integration with alerting', 'Yes — log collection without alerting', 'Partial monitoring', 'No security monitoring'],
      d4q3.choiceScores = [20, 40, 60, 80],
      d4q3.naScore      = 1, d4q3.updated = datetime();

MERGE (d4q4:Question {domainIndex: 4, questionIndex: 3})
  SET d4q4.text         = 'Does the application have a web application firewall (WAF)?',
      d4q4.weightTier   = 'Medium',
      d4q4.choices      = ['Yes — managed WAF with tuned rules', 'Yes — default WAF rules', 'No WAF — network firewall only', 'No protection layer'],
      d4q4.choiceScores = [20, 40, 60, 80],
      d4q4.naScore      = 1, d4q4.updated = datetime();

MERGE (d4q5:Question {domainIndex: 4, questionIndex: 4})
  SET d4q5.text         = 'Are detective controls implemented to identify unauthorized or anomalous use of this application?',
      d4q5.weightTier   = 'High',
      d4q5.choices      = ['Yes — automated detection with real-time alerting', 'Yes — log-based detection requiring manual review', 'Partial — some detection capabilities', 'No detective controls implemented'],
      d4q5.choiceScores = [20, 40, 60, 80],
      d4q5.naScore      = 1, d4q5.updated = datetime();

MERGE (d4q6:Question {domainIndex: 4, questionIndex: 5})
  SET d4q6.text         = 'Are corrective controls defined to remediate or contain issues detected during application use?',
      d4q6.weightTier   = 'High',
      d4q6.choices      = ['Yes — automated remediation and rollback capabilities', 'Yes — documented manual corrective procedures', 'Partial — ad-hoc correction only', 'No corrective controls defined'],
      d4q6.choiceScores = [20, 40, 60, 80],
      d4q6.naScore      = 1, d4q6.updated = datetime();

MERGE (d4q7:Question {domainIndex: 4, questionIndex: 6})
  SET d4q7.text         = 'Is application usage monitored with defined KPIs escalated to both team-level and enterprise-level analysis?',
      d4q7.weightTier   = 'Medium',
      d4q7.choices      = ['Yes — dashboards with KPIs at both levels', 'Yes — team-level metrics only', 'Partial — ad-hoc reporting', 'No usage monitoring'],
      d4q7.choiceScores = [20, 40, 60, 80],
      d4q7.naScore      = 1, d4q7.updated = datetime();

MATCH (d4:Domain {domainIndex: 4})
MATCH (question:Question) WHERE question.domainIndex = 4
MERGE (question)-[:BELONGS_TO]->(d4);

MATCH (question:Question) WHERE question.domainIndex = 4
MATCH (tier:WeightTier {name: question.weightTier})
MERGE (question)-[:HAS_WEIGHT]->(tier);


// ═════════════════════════════════════════════════════════════════
// Domain 5: Incident Response and Business Continuity (5 questions)
// ═════════════════════════════════════════════════════════════════

MERGE (d5:Domain {domainIndex: 5})
  SET d5.name        = 'Incident Response and Business Continuity',
      d5.policyRefs  = ['ISP 6.1', 'ISP 6.2', 'IISP 1.0', 'IISP 10.0'],
      d5.csfRefs     = ['RS.MA', 'RS.AN', 'RC.RP'],
      d5.active      = true,
      d5.updated     = datetime();

MERGE (d5q1:Question {domainIndex: 5, questionIndex: 0})
  SET d5q1.text         = 'Is the application covered by the incident response plan?',
      d5q1.weightTier   = 'High',
      d5q1.choices      = ['Yes — application-specific runbook', 'Yes — covered by general IRP', 'Partial coverage', 'Not covered'],
      d5q1.choiceScores = [20, 40, 60, 80],
      d5q1.naScore      = 1, d5q1.updated = datetime();

MERGE (d5q2:Question {domainIndex: 5, questionIndex: 1})
  SET d5q2.text         = 'What is the Recovery Time Objective (RTO)?',
      d5q2.weightTier   = 'High',
      d5q2.choices      = ['1 hour or less', '1–4 hours', '4–24 hours', '> 24 hours or undefined'],
      d5q2.choiceScores = [20, 40, 60, 80],
      d5q2.naScore      = 1, d5q2.updated = datetime();

MERGE (d5q3:Question {domainIndex: 5, questionIndex: 2})
  SET d5q3.text         = 'What is the Recovery Point Objective (RPO)?',
      d5q3.weightTier   = 'High',
      d5q3.choices      = ['1 hour or less', '1–4 hours', '4–24 hours', '> 24 hours or undefined'],
      d5q3.choiceScores = [20, 40, 60, 80],
      d5q3.naScore      = 1, d5q3.updated = datetime();

MERGE (d5q4:Question {domainIndex: 5, questionIndex: 3})
  SET d5q4.text         = 'When was the last backup restoration test performed?',
      d5q4.weightTier   = 'High',
      d5q4.choices      = ['Within 6 months', '6–12 months ago', '> 12 months ago', 'Never tested'],
      d5q4.choiceScores = [20, 40, 60, 80],
      d5q4.naScore      = 1, d5q4.updated = datetime();

MERGE (d5q5:Question {domainIndex: 5, questionIndex: 4})
  SET d5q5.text         = 'Is forensic evidence preservation addressed for this application?',
      d5q5.weightTier   = 'Medium',
      d5q5.choices      = ['Yes — log retention and chain of custody documented', 'Partial — logs retained but no formal process', 'No forensic readiness'],
      d5q5.choiceScores = [20, 50, 70],
      d5q5.naScore      = 1, d5q5.updated = datetime();

MATCH (d5:Domain {domainIndex: 5})
MATCH (question:Question) WHERE question.domainIndex = 5
MERGE (question)-[:BELONGS_TO]->(d5);

MATCH (question:Question) WHERE question.domainIndex = 5
MATCH (tier:WeightTier {name: question.weightTier})
MERGE (question)-[:HAS_WEIGHT]->(tier);


// ═════════════════════════════════════════════════════════════════
// Domain 6: Third-Party and Supply Chain Risk (6 questions)
// ═════════════════════════════════════════════════════════════════

MERGE (d6:Domain {domainIndex: 6})
  SET d6.name        = 'Third-Party and Supply Chain Risk',
      d6.policyRefs  = ['ISP 2.6'],
      d6.csfRefs     = ['GV.SC'],
      d6.active      = true,
      d6.updated     = datetime();

MERGE (d6q1:Question {domainIndex: 6, questionIndex: 0})
  SET d6q1.text         = 'Is the application a third-party or SaaS product?',
      d6q1.weightTier   = 'Info',
      d6q1.choices      = ['No — internally developed', 'Yes — on-premises third-party', 'Yes — SaaS / cloud-hosted', 'Hybrid'],
      d6q1.choiceScores = [20, 40, 60, 80],
      d6q1.naScore      = 1, d6q1.updated = datetime();

MERGE (d6q2:Question {domainIndex: 6, questionIndex: 1})
  SET d6q2.text         = 'Has a vendor security assessment been completed?',
      d6q2.weightTier   = 'High',
      d6q2.choices      = ['Yes — within 12 months', 'Yes — older than 12 months', 'No assessment performed'],
      d6q2.choiceScores = [20, 50, 70],
      d6q2.naScore      = 1, d6q2.updated = datetime();

MERGE (d6q3:Question {domainIndex: 6, questionIndex: 2})
  SET d6q3.text         = 'Does the vendor contract include security requirements?',
      d6q3.weightTier   = 'High',
      d6q3.choices      = ['Yes — comprehensive security addendum', 'Yes — basic security clauses', 'No security requirements in contract'],
      d6q3.choiceScores = [20, 50, 70],
      d6q3.naScore      = 1, d6q3.updated = datetime();

MERGE (d6q4:Question {domainIndex: 6, questionIndex: 3})
  SET d6q4.text         = 'Is there a defined exit strategy for vendor transition?',
      d6q4.weightTier   = 'Medium',
      d6q4.choices      = ['Yes — documented with data portability plan', 'Partial plan', 'No exit strategy'],
      d6q4.choiceScores = [20, 50, 70],
      d6q4.naScore      = 1, d6q4.updated = datetime();

MERGE (d6q5:Question {domainIndex: 6, questionIndex: 4})
  SET d6q5.text         = 'Is there a phased deployment plan with maturity-gated control enhancements (e.g., crawl/walk/run)?',
      d6q5.weightTier   = 'High',
      d6q5.choices      = ['Yes — defined phases with control gates at each stage', 'Yes — informal phased approach', 'No — full deployment without phased controls'],
      d6q5.choiceScores = [20, 50, 70],
      d6q5.naScore      = 1, d6q5.updated = datetime();

MERGE (d6q6:Question {domainIndex: 6, questionIndex: 5})
  SET d6q6.text         = 'Have AI-specific risks been formally assessed for this application (e.g., overreliance, output accuracy, prompt consistency, IP leakage)?',
      d6q6.weightTier   = 'High',
      d6q6.choices      = ['Yes — formal AI risk assessment completed', 'Yes — partial assessment of key risks', 'No — AI risks not assessed'],
      d6q6.choiceScores = [20, 50, 70],
      d6q6.naScore      = 1, d6q6.updated = datetime();

MATCH (d6:Domain {domainIndex: 6})
MATCH (question:Question) WHERE question.domainIndex = 6
MERGE (question)-[:BELONGS_TO]->(d6);

MATCH (question:Question) WHERE question.domainIndex = 6
MATCH (tier:WeightTier {name: question.weightTier})
MERGE (question)-[:HAS_WEIGHT]->(tier);
