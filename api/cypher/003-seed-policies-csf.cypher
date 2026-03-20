// ════════════════════════════════════════════════════════════════════
// ASR Neo4j Schema — CSF Subcategory Seed Data
// ════════════════════════════════════════════════════════════════════
// Creates CsfSubcategory nodes and links to Domains.
// Policy nodes are client-specific — seed them via client overlay
// (e.g., asr.client-a/cypher/010-client-policies.cypher).
// MERGE ensures idempotency.
// ════════════════════════════════════════════════════════════════════

// ─── CSF 2.0 Subcategory Nodes ──────────────────────────────────

MERGE (c:CsfSubcategory {code: 'GV.OC'}) SET c.function = 'Govern', c.category = 'Organizational Context', c.description = 'The circumstances — mission, stakeholder expectations, dependencies, and legal, regulatory, and contractual requirements — surrounding the organization\'s cybersecurity risk management decisions are understood', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'GV.PO'}) SET c.function = 'Govern', c.category = 'Policy', c.description = 'Organizational cybersecurity policy is established, communicated, and enforced', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'GV.OV'}) SET c.function = 'Govern', c.category = 'Oversight', c.description = 'Results of organization-wide cybersecurity risk management activities and performance are used to inform, improve, and adjust the risk management strategy', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'GV.SC'}) SET c.function = 'Govern', c.category = 'Supply Chain Risk Management', c.description = 'Cyber supply chain risk management processes are identified, established, managed, monitored, and improved by organizational stakeholders', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'PR.AA'}) SET c.function = 'Protect', c.category = 'Identity Management, Authentication, and Access Control', c.description = 'Access to assets and associated facilities is limited to authorized users, services, and hardware and managed commensurate with the assessed risk of unauthorized access', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'PR.DS'}) SET c.function = 'Protect', c.category = 'Data Security', c.description = 'Data are managed consistent with the organization\'s risk strategy to protect the confidentiality, integrity, and availability of information', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'PR.PS'}) SET c.function = 'Protect', c.category = 'Platform Security', c.description = 'The hardware, software, and services of physical and virtual platforms are managed consistent with the organization\'s risk strategy', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'ID.RA'}) SET c.function = 'Identify', c.category = 'Risk Assessment', c.description = 'The risk to the organization, mission, and business from cybersecurity threats and vulnerabilities, and their impact, is understood', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'DE.CM'}) SET c.function = 'Detect', c.category = 'Continuous Monitoring', c.description = 'Assets are monitored to find anomalies, indicators of compromise, and other potentially adverse events', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'RS.MA'}) SET c.function = 'Respond', c.category = 'Incident Management', c.description = 'Incident response activities are managed', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'RS.AN'}) SET c.function = 'Respond', c.category = 'Incident Analysis', c.description = 'Investigations are conducted to understand the root cause of detected cybersecurity incidents', c.updated = datetime();
MERGE (c:CsfSubcategory {code: 'RC.RP'}) SET c.function = 'Recover', c.category = 'Recovery Planning', c.description = 'Restoration activities are performed to ensure operational availability of systems and services affected by cybersecurity incidents', c.updated = datetime();

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
