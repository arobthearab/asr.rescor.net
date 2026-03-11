// ════════════════════════════════════════════════════════════════════
// ASR Neo4j Schema — CSF Subcategory Seed Data
// ════════════════════════════════════════════════════════════════════
// Creates CsfSubcategory nodes and links to Domains.
// Policy nodes are client-specific — seed them via client overlay
// (e.g., asr.k12.com/cypher/010-stride-policies.cypher).
// MERGE ensures idempotency.
// ════════════════════════════════════════════════════════════════════

// ─── CSF 2.0 Subcategory Nodes ──────────────────────────────────

MERGE (c:CsfSubcategory {code: 'GV.OC'}) SET c.function = 'Govern', c.category = 'Organizational Context', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'GV.PO'}) SET c.function = 'Govern', c.category = 'Policy', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'GV.OV'}) SET c.function = 'Govern', c.category = 'Oversight', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'GV.SC'}) SET c.function = 'Govern', c.category = 'Supply Chain Risk Management', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'PR.AA'}) SET c.function = 'Protect', c.category = 'Identity Management, Authentication, and Access Control', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'PR.DS'}) SET c.function = 'Protect', c.category = 'Data Security', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'PR.PS'}) SET c.function = 'Protect', c.category = 'Platform Security', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'ID.RA'}) SET c.function = 'Identify', c.category = 'Risk Assessment', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'DE.CM'}) SET c.function = 'Detect', c.category = 'Continuous Monitoring', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'RS.MA'}) SET c.function = 'Respond', c.category = 'Incident Management', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'RS.AN'}) SET c.function = 'Respond', c.category = 'Incident Analysis', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'RC.RP'}) SET c.function = 'Recover', c.category = 'Recovery Planning', c.updated = datetime();

// ─── Domain → CSF Subcategory Relationships ─────────────────────

MATCH (d:Domain {domainIndex: 0})
UNWIND ['GV.OC', 'GV.PO', 'GV.OV'] AS code
MATCH (c:CsfSubcategory {code: code})
MERGE (d)-[:ALIGNS_TO]->(c);

MATCH (d:Domain {domainIndex: 1})
UNWIND ['PR.AA'] AS code
MATCH (c:CsfSubcategory {code: code})
MERGE (d)-[:ALIGNS_TO]->(c);

MATCH (d:Domain {domainIndex: 2})
UNWIND ['PR.DS'] AS code
MATCH (c:CsfSubcategory {code: code})
MERGE (d)-[:ALIGNS_TO]->(c);

MATCH (d:Domain {domainIndex: 3})
UNWIND ['PR.PS'] AS code
MATCH (c:CsfSubcategory {code: code})
MERGE (d)-[:ALIGNS_TO]->(c);

MATCH (d:Domain {domainIndex: 4})
UNWIND ['ID.RA', 'DE.CM'] AS code
MATCH (c:CsfSubcategory {code: code})
MERGE (d)-[:ALIGNS_TO]->(c);

MATCH (d:Domain {domainIndex: 5})
UNWIND ['RS.MA', 'RS.AN', 'RC.RP'] AS code
MATCH (c:CsfSubcategory {code: code})
MERGE (d)-[:ALIGNS_TO]->(c);

MATCH (d:Domain {domainIndex: 6})
UNWIND ['GV.SC'] AS code
MATCH (c:CsfSubcategory {code: code})
MERGE (d)-[:ALIGNS_TO]->(c);
