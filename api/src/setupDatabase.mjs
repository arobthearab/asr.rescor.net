// ════════════════════════════════════════════════════════════════════
// ASR Neo4j Setup — Run Cypher scripts to initialize database
// ════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createConfiguration, createDatabase } from './database.mjs';

const CYPHER_DIRECTORY = resolve(import.meta.dirname, '..', 'cypher');

const SCRIPTS = [
  '001-constraints.cypher',
  '002-seed-questionnaire.cypher',
  '003-seed-policies-csf.cypher',
];

// ────────────────────────────────────────────────────────────────────
// parseCypherStatements — split a .cypher file into executable units
// ────────────────────────────────────────────────────────────────────

function parseCypherStatements(raw) {
  const blocks = raw
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0 && !block.startsWith('//'));

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

// CLI-level env var — not runtime application logic.
// Used only during `npm run cypher:setup` invocation.
function discoverOverlayScripts() {
  const overlayDirectory = process.env.ASR_OVERLAY_CYPHER_DIR;
  if (!overlayDirectory) {
    return [];
  }

  const absoluteDirectory = resolve(overlayDirectory);
  if (!existsSync(absoluteDirectory)) {
    console.log(`  (overlay directory not found: ${absoluteDirectory})`);
    return [];
  }

  const overlayFiles = readdirSync(absoluteDirectory)
    .filter((fileName) => fileName.endsWith('.cypher'))
    .sort()
    .map((fileName) => ({ fileName, filePath: resolve(absoluteDirectory, fileName) }));

  return overlayFiles;
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

  await database.disconnect();
  console.log('Database setup complete.');
}

runSetup().catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});
