// ════════════════════════════════════════════════════════════════════
// ASR Neo4j Setup — Run Cypher scripts to initialize database
// ════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createHash, randomUUID } from 'node:crypto';
import { createConfiguration, createDatabase } from './database.mjs';

const CYPHER_DIRECTORY = resolve(import.meta.dirname, '..', 'cypher');

const SCRIPTS = [
  '001-constraints.cypher',
  '002-seed-questionnaire.cypher',
  '003-seed-policies-csf.cypher',
  '004-auth-constraints.cypher',
  '004-seed-gates.cypher',
  '005-seed-tenants.cypher',
  '006-seed-superusers.cypher',
  '007-auth-events.cypher',
  '008-questionnaire-templates.cypher',
  '009-tenant-config.cypher',
  '010-tenant-gates.cypher',
  '011-audit-events.cypher',
  '012-apoc-ttl.cypher',
  '013-service-accounts.cypher',
  '014-audit-ttl.cypher',
];

// ────────────────────────────────────────────────────────────────────
// parseCypherStatements — split a .cypher file into executable units
// ────────────────────────────────────────────────────────────────────

function parseCypherStatements(raw) {
  const blocks = raw
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  const statements = [];
  for (const block of blocks) {
    const nonCommentLines = block
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'));

    const cypherText = nonCommentLines.join('\n').trim();
    if (cypherText.length === 0) {
      continue;
    }

    const subStatements = cypherText
      .split(/;\s*\n/)
      .map((statement) => statement.replace(/;\s*$/, '').trim())
      .filter((statement) => statement.length > 0);

    statements.push(...subStatements);
  }

  return statements;
}

// ────────────────────────────────────────────────────────────────────
// runCypherFile — parse and execute a single .cypher file
// ────────────────────────────────────────────────────────────────────

async function runCypherFile(database, filePath, label) {
  const raw = readFileSync(filePath, 'utf-8');
  const statements = parseCypherStatements(raw);

  console.log(`Running ${label} (${statements.length} statements)...`);

  for (const statement of statements) {
    await database.query(statement);
  }

  console.log(`  ✓ ${label} complete`);
}

// ────────────────────────────────────────────────────────────────────
// discoverOverlayScripts — find client overlay .cypher files (010+)
// ────────────────────────────────────────────────────────────────────
// Client repos provide additional seed data (policies, policyRefs,
// compliance notes) by placing numbered .cypher files starting at 010
// in the same cypher/ directory.  Files are sorted lexically.

// Explicit per-call parameter (CLI argument), not an env var.
// Usage: node src/setupDatabase.mjs --overlay /path/to/overlay
function discoverOverlayScripts() {
  let overlayFiles = [];
  const overlayIndex = process.argv.indexOf('--overlay');
  const overlayDirectory = overlayIndex !== -1 ? process.argv[overlayIndex + 1] : undefined;

  if (overlayDirectory) {
    const absoluteDirectory = resolve(overlayDirectory);
    if (!existsSync(absoluteDirectory)) {
      console.log(`  (overlay directory not found: ${absoluteDirectory})`);
    } else {
      overlayFiles = readdirSync(absoluteDirectory)
        .filter((fileName) => fileName.endsWith('.cypher'))
        .sort()
        .map((fileName) => ({ fileName, filePath: resolve(absoluteDirectory, fileName) }));
    }
  }

  return overlayFiles;
}

// ────────────────────────────────────────────────────────────────────
// seedFromEnvironment — create tenant + admin from SEED_* env vars
// ────────────────────────────────────────────────────────────────────
// For distributable deployments: third parties set SEED_TENANT_ID,
// SEED_TENANT_NAME, SEED_TENANT_DOMAIN, and SEED_ADMIN_EMAIL to
// provision their own tenant and admin user.  Additive — does not
// replace the static 005/006 cypher scripts.

async function seedFromEnvironment(database) {
  const tenantId = process.env.SEED_TENANT_ID;
  const tenantName = process.env.SEED_TENANT_NAME;
  const tenantDomain = process.env.SEED_TENANT_DOMAIN;
  const adminEmail = process.env.SEED_ADMIN_EMAIL;

  if (tenantId) {
    console.log(`Seeding tenant from environment (${tenantId})...`);

    await database.query(
      `MERGE (t:Tenant {tenantId: $tenantId})
         ON CREATE SET
           t.name      = $name,
           t.domain    = $domain,
           t.createdAt = datetime(),
           t.active    = true
         ON MATCH SET
           t.name      = $name,
           t.domain    = $domain`,
      {
        tenantId,
        name: tenantName || tenantId,
        domain: tenantDomain || 'localhost',
      }
    );

    console.log(`  ✓ Tenant "${tenantName || tenantId}" seeded`);

    if (adminEmail) {
      await database.query(
        `MERGE (u:User {email: $email})
           ON CREATE SET
             u.sub       = $sub,
             u.username  = $email,
             u.roles     = '["admin"]',
             u.firstSeen = datetime(),
             u.lastSeen  = datetime()
           ON MATCH SET
             u.roles     = '["admin"]',
             u.lastSeen  = datetime()`,
        {
          email: adminEmail,
          sub: `pre-provisioned:${adminEmail}`,
        }
      );

      await database.query(
        `MATCH (u:User {email: $email})
         MATCH (t:Tenant {tenantId: $tenantId})
         MERGE (u)-[:BELONGS_TO]->(t)`,
        { email: adminEmail, tenantId }
      );

      console.log(`  ✓ Admin "${adminEmail}" seeded and linked to tenant`);
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// bootstrapQuestionnaire — create initial Questionnaire + snapshot
// if none exist yet.  Reads the live Question/Domain nodes and
// packages them into a Questionnaire wrapper so review creation works.
// ────────────────────────────────────────────────────────────────────

async function bootstrapQuestionnaire(database) {
  const existing = await database.query(
    `MATCH (q:Questionnaire) RETURN count(q) AS total`
  );
  const questionnaireCount = existing[0]?.total?.toNumber?.() ?? Number(existing[0]?.total ?? 0);

  if (questionnaireCount > 0) {
    console.log('  (questionnaire already exists — skipping bootstrap)');
  } else {
    const questionCount = await database.query(
      `MATCH (q:Question) WHERE q.active <> false RETURN count(q) AS total`
    );
    const totalQuestions = questionCount[0]?.total?.toNumber?.() ?? Number(questionCount[0]?.total ?? 0);

    if (totalQuestions === 0) {
      console.log('  (no questions in database — skipping questionnaire bootstrap)');
    } else {
      await createDefaultQuestionnaire(database, totalQuestions);
    }
  }
}

// ────────────────────────────────────────────────────────────────────
// createDefaultQuestionnaire — build and persist initial questionnaire
// ────────────────────────────────────────────────────────────────────

async function createDefaultQuestionnaire(database, totalQuestions) {
  console.log(`Bootstrapping default Questionnaire from ${totalQuestions} live questions...`);

  const domainsResult = await database.query(
    `MATCH (domain:Domain)
     WHERE domain.active <> false
     OPTIONAL MATCH (domain)<-[:BELONGS_TO]-(question:Question)
     WHERE question.active <> false
     RETURN domain, collect(question) AS questions
     ORDER BY domain.domainIndex`
  );

  const domains = domainsResult.map((record) => {
    const domain = record.domain || {};
    const questions = (record.questions || [])
      .sort((a, b) => (a.questionIndex ?? 0) - (b.questionIndex ?? 0))
      .map((question) => ({
        text: question.text,
        weightTier: question.weightTier,
        choices: question.choices || [],
        choiceScores: question.choiceScores || [],
        naScore: question.naScore ?? 1,
        applicability: question.applicability || [],
        guidance: question.guidance || null,
        responsibleFunction: question.responsibleFunction || null,
      }));

    return {
      name: domain.name,
      policyRefs: domain.policyRefs || [],
      csfRefs: domain.csfRefs || [],
      questions,
    };
  });

  const snapshotData = { domains };
  const snapshotJson = JSON.stringify(snapshotData);
  const version = createHash('sha256').update(snapshotJson).digest('hex').slice(0, 12);
  const questionnaireId = randomUUID();
  const label = 'ASR Questionnaire';
  const now = new Date().toISOString();

  await database.query(
    `CREATE (q:Questionnaire {
       questionnaireId: $questionnaireId,
       name:            $label,
       description:     'Default ASR questionnaire (auto-bootstrapped)',
       active:          true,
       createdBy:       'setup',
       created:         $now,
       updated:         $now
     })
     CREATE (s:QuestionnaireSnapshot {
       version:  $version,
       label:    $label,
       data:     $data,
       tenantId: 'demo',
       created:  datetime()
     })
     CREATE (q)-[:CURRENT_VERSION]->(s)
     CREATE (s)-[:VERSION_OF]->(q)`,
    { questionnaireId, label, version, data: snapshotJson, now }
  );

  console.log(`  ✓ Questionnaire "${label}" created (version: ${version})`);
}

// ────────────────────────────────────────────────────────────────────
// runSetup — execute each Cypher script in order
// ────────────────────────────────────────────────────────────────────

async function runSetup() {
  const configuration = await createConfiguration();
  const database = await createDatabase(configuration);

  // Core schema and generic seed data
  for (const scriptName of SCRIPTS) {
    const filePath = resolve(CYPHER_DIRECTORY, scriptName);
    await runCypherFile(database, filePath, scriptName);
  }

  // Client-specific overlay scripts (e.g., policies, compliance notes)
  const overlayScripts = discoverOverlayScripts();
  if (overlayScripts.length > 0) {
    console.log(`\nApplying ${overlayScripts.length} client overlay script(s)...`);
    for (const { fileName, filePath } of overlayScripts) {
      await runCypherFile(database, filePath, `overlay/${fileName}`);
    }
  }

  // Seed custom tenant + admin from SEED_* env vars (distributable deploys)
  await seedFromEnvironment(database);

  // Bootstrap default Questionnaire if none exists
  await bootstrapQuestionnaire(database);

  await database.disconnect();
  console.log('Database setup complete.');
}

runSetup().catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});
