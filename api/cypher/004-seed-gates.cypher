// ════════════════════════════════════════════════════════════════════
// Seed: Gate Questions — Functional-authority attestations
// ════════════════════════════════════════════════════════════════════
// Gate questions are high-level attestations answered by functional
// leads (Legal, SEPG, EA, SA/E, ERM). Each choice can pre-fill
// specific downstream questions, reducing assessment burden.
//
// prefillRules format (JSON string):
//   { "0": [...], "1": [...], ... }  — key = choiceIndex
//   Each array entry: { "domainIndex": N, "questionIndex": N, "choiceIndex": N | null }
//   choiceIndex null = no pre-fill for that question
//
// Run after 002 (questionnaire). Idempotent via MERGE.
// ════════════════════════════════════════════════════════════════════

// ── LEGAL_FERPA ─────────────────────────────────────────────────
// "No FERPA" → pre-fill FERPA questions as N/A (-1)
// "Directory only" → pre-fill FERPA Qs 8-11 as N/A, leave D2Q0 manual
// "Internal-use" / "High-sensitivity" → no pre-fill (manual review)

MERGE (gq:GateQuestion {gateId: 'LEGAL_FERPA'})
SET gq.function    = 'LEGAL',
    gq.text        = 'What level of FERPA data is this application approved to handle?',
    gq.choices     = ['No FERPA data', 'Directory information only', 'Internal-use education records', 'High-sensitivity education records'],
    gq.prefillRules = '{"0":[{"domainIndex":2,"questionIndex":0,"choiceIndex":-1},{"domainIndex":2,"questionIndex":7,"choiceIndex":-1},{"domainIndex":2,"questionIndex":8,"choiceIndex":-1},{"domainIndex":2,"questionIndex":9,"choiceIndex":-1},{"domainIndex":2,"questionIndex":10,"choiceIndex":-1},{"domainIndex":2,"questionIndex":11,"choiceIndex":-1}],"1":[{"domainIndex":2,"questionIndex":8,"choiceIndex":-1},{"domainIndex":2,"questionIndex":9,"choiceIndex":-1},{"domainIndex":2,"questionIndex":10,"choiceIndex":-1},{"domainIndex":2,"questionIndex":11,"choiceIndex":-1}],"2":[],"3":[]}',
    gq.sortOrder   = 1,
    gq.active      = true,
    gq.updated     = datetime();

// ── SEPG_SSDLC ─────────────────────────────────────────────────
// "Fully certified" → pre-fill SSDLC questions as best-case (choice 0)
// "Partial" / "Not assessed" → no pre-fill

MERGE (gq:GateQuestion {gateId: 'SEPG_SSDLC'})
SET gq.function    = 'SEPG',
    gq.text        = 'Has SEPG certified this product meets Secure Software Development Lifecycle (SSDLC) requirements?',
    gq.choices     = ['Fully certified', 'Partially certified', 'Not assessed'],
    gq.prefillRules = '{"0":[{"domainIndex":3,"questionIndex":0,"choiceIndex":0},{"domainIndex":3,"questionIndex":1,"choiceIndex":0},{"domainIndex":3,"questionIndex":2,"choiceIndex":0},{"domainIndex":3,"questionIndex":3,"choiceIndex":0},{"domainIndex":3,"questionIndex":4,"choiceIndex":0},{"domainIndex":3,"questionIndex":5,"choiceIndex":0}],"1":[],"2":[]}',
    gq.sortOrder   = 2,
    gq.active      = true,
    gq.updated     = datetime();

// ── EA_TECH_STACK ───────────────────────────────────────────────
// "Approved with controls" → pre-fill EA governance Qs as best-case + Q0.10
// "Approved limited/pilot" → pre-fill Q0.10 choice 1
// "Under review" → pre-fill Q0.10 choice 2

MERGE (gq:GateQuestion {gateId: 'EA_TECH_STACK'})
SET gq.function    = 'EA',
    gq.text        = 'Has Enterprise Architecture (EA) approved the technology stack for this application?',
    gq.choices     = ['Approved with controls', 'Approved limited/pilot', 'Under review'],
    gq.prefillRules = '{"0":[{"domainIndex":6,"questionIndex":0,"choiceIndex":0},{"domainIndex":6,"questionIndex":4,"choiceIndex":0},{"domainIndex":0,"questionIndex":10,"choiceIndex":0}],"1":[{"domainIndex":0,"questionIndex":10,"choiceIndex":1}],"2":[{"domainIndex":0,"questionIndex":10,"choiceIndex":2}]}',
    gq.sortOrder   = 3,
    gq.active      = true,
    gq.updated     = datetime();

// ── SAE_PENTEST ─────────────────────────────────────────────────
// "Comprehensive" → pre-fill vuln/pen-test questions as best-case
// "Vuln scan only" → partial pre-fill (scanning only)
// "Not assessed" → no pre-fill

MERGE (gq:GateQuestion {gateId: 'SAE_PENTEST'})
SET gq.function    = 'SAE',
    gq.text        = 'Has Security Architecture & Engineering (SA/E) completed vulnerability and penetration testing for this application?',
    gq.choices     = ['Comprehensive (vuln scan + pen test)', 'Vulnerability scan only', 'Not assessed'],
    gq.prefillRules = '{"0":[{"domainIndex":4,"questionIndex":0,"choiceIndex":0},{"domainIndex":4,"questionIndex":1,"choiceIndex":0},{"domainIndex":4,"questionIndex":2,"choiceIndex":0}],"1":[{"domainIndex":4,"questionIndex":0,"choiceIndex":0}],"2":[]}',
    gq.sortOrder   = 4,
    gq.active      = true,
    gq.updated     = datetime();

// ── ERM_RISK_ASSESSED ───────────────────────────────────────────
// "Within 12 months" → pre-fill risk governance Qs as best-case
// "Older than 12 months" / "No/informal" → no pre-fill

MERGE (gq:GateQuestion {gateId: 'ERM_RISK_ASSESSED'})
SET gq.function    = 'ERM',
    gq.text        = 'Has Enterprise Risk Management (ERM) performed a formal risk assessment for this application?',
    gq.choices     = ['Within 12 months', 'Older than 12 months', 'No formal assessment'],
    gq.prefillRules = '{"0":[{"domainIndex":7,"questionIndex":0,"choiceIndex":0},{"domainIndex":7,"questionIndex":1,"choiceIndex":0},{"domainIndex":7,"questionIndex":2,"choiceIndex":0}],"1":[],"2":[]}',
    gq.sortOrder   = 5,
    gq.active      = true,
    gq.updated     = datetime();
