// ════════════════════════════════════════════════════════════════════
// ASR Neo4j Schema — Policy and CSF Subcategory Seed Data
// ════════════════════════════════════════════════════════════════════
// Creates Policy and CsfSubcategory nodes and links to Domains.
// MERGE ensures idempotency.
// ════════════════════════════════════════════════════════════════════

// ─── Policy Nodes ────────────────────────────────────────────────

MERGE (p:Policy {reference: 'ISP 1.0'})  SET p.title = 'Information Security Program', p.updated = datetime();
MERGE (p:Policy {reference: 'ISP 2.1'})  SET p.title = 'Risk Assessment', p.updated = datetime();
MERGE (p:Policy {reference: 'ISP 2.3'})  SET p.title = 'Access Management Policy', p.updated = datetime();
MERGE (p:Policy {reference: 'ISP 2.4'})  SET p.title = 'Security Awareness', p.updated = datetime();
MERGE (p:Policy {reference: 'ISP 2.5'})  SET p.title = 'Security Documentation', p.updated = datetime();
MERGE (p:Policy {reference: 'ISP 2.6'})  SET p.title = 'Third-Party Risk Management', p.updated = datetime();
MERGE (p:Policy {reference: 'ISP 3.2'})  SET p.title = 'Vulnerability Management', p.updated = datetime();
MERGE (p:Policy {reference: 'ISP 4.1'})  SET p.title = 'Identity and Access Management', p.updated = datetime();
MERGE (p:Policy {reference: 'ISP 4.3'})  SET p.title = 'Data Protection', p.updated = datetime();
MERGE (p:Policy {reference: 'ISP 4.4'})  SET p.title = 'Secure Development', p.updated = datetime();
MERGE (p:Policy {reference: 'ISP 5.1'})  SET p.title = 'Threat Detection', p.updated = datetime();
MERGE (p:Policy {reference: 'ISP 6.1'})  SET p.title = 'Incident Response', p.updated = datetime();
MERGE (p:Policy {reference: 'ISP 6.2'})  SET p.title = 'Business Continuity', p.updated = datetime();
MERGE (p:Policy {reference: 'IISP 1.0'}) SET p.title = 'Information Security Implementation Standard', p.updated = datetime();
MERGE (p:Policy {reference: 'IISP 2.0'}) SET p.title = 'Data Classification Implementation', p.updated = datetime();
MERGE (p:Policy {reference: 'IISP 3.0'}) SET p.title = 'Data Handling Implementation', p.updated = datetime();
MERGE (p:Policy {reference: 'IISP 7.0'}) SET p.title = 'Vulnerability Scanning Implementation', p.updated = datetime();
MERGE (p:Policy {reference: 'IISP 8.0'}) SET p.title = 'Access Control Implementation', p.updated = datetime();
MERGE (p:Policy {reference: 'IISP 9.0'}) SET p.title = 'Secure Development Implementation', p.updated = datetime();
MERGE (p:Policy {reference: 'IISP 10.0'}) SET p.title = 'Business Continuity Implementation', p.updated = datetime();

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

// ─── Domain → Policy Relationships ──────────────────────────────

// D0: Governance
MATCH (d:Domain {domainIndex: 0})
UNWIND ['ISP 1.0', 'ISP 2.1', 'ISP 2.4', 'ISP 2.5'] AS ref
MATCH (p:Policy {reference: ref})
MERGE (d)-[:REFERENCES_POLICY]->(p);

// D1: IAM
MATCH (d:Domain {domainIndex: 1})
UNWIND ['ISP 4.1', 'ISP 2.3', 'IISP 8.0'] AS ref
MATCH (p:Policy {reference: ref})
MERGE (d)-[:REFERENCES_POLICY]->(p);

// D2: Data Protection
MATCH (d:Domain {domainIndex: 2})
UNWIND ['ISP 4.3', 'IISP 2.0', 'IISP 3.0'] AS ref
MATCH (p:Policy {reference: ref})
MERGE (d)-[:REFERENCES_POLICY]->(p);

// D3: Secure Development
MATCH (d:Domain {domainIndex: 3})
UNWIND ['ISP 4.4', 'IISP 9.0'] AS ref
MATCH (p:Policy {reference: ref})
MERGE (d)-[:REFERENCES_POLICY]->(p);

// D4: Vulnerability Mgmt
MATCH (d:Domain {domainIndex: 4})
UNWIND ['IISP 7.0', 'ISP 3.2', 'ISP 5.1'] AS ref
MATCH (p:Policy {reference: ref})
MERGE (d)-[:REFERENCES_POLICY]->(p);

// D5: Incident Response
MATCH (d:Domain {domainIndex: 5})
UNWIND ['ISP 6.1', 'ISP 6.2', 'IISP 1.0', 'IISP 10.0'] AS ref
MATCH (p:Policy {reference: ref})
MERGE (d)-[:REFERENCES_POLICY]->(p);

// D6: Third-Party
MATCH (d:Domain {domainIndex: 6})
UNWIND ['ISP 2.6'] AS ref
MATCH (p:Policy {reference: ref})
MERGE (d)-[:REFERENCES_POLICY]->(p);

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
