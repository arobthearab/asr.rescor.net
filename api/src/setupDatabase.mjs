// ════════════════════════════════════════════════════════════════════
// ASR Neo4j Setup — Run Cypher scripts to initialize database
// ════════════════════════════════════════════════════════════════════

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { createDatabase } from './database.mjs';

const CYPHER_DIRECTORY = resolve(import.meta.dirname, '..', 'cypher');

const SCRIPTS = [
  '001-constraints.cypher',
  '002-seed-questionnaire.cypher',
  '003-seed-policies-csf.cypher',
];

// ────────────────────────────────────────────────────────────────────
// runSetup — execute each Cypher script in order
// ────────────────────────────────────────────────────────────────────

async function runSetup() {
  const database = await createDatabase();

  for (const scriptName of SCRIPTS) {
    const filePath = resolve(CYPHER_DIRECTORY, scriptName);
    const raw = readFileSync(filePath, 'utf-8');

    // Split on blank lines OR semicolons at end of lines
    // Step 1: Split on blank lines into blocks
    const blocks = raw
      .split(/\n\n+/)
      .map((block) => block.trim())
      .filter((block) => block.length > 0 && !block.startsWith('//'));

    // Step 2: Within each block, split on semicolons (end-of-statement)
    const statements = [];
    for (const block of blocks) {
      const nonCommentLines = block
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'));

      const cypherText = nonCommentLines.join('\n').trim();
      if (cypherText.length === 0) {
        continue;
      }

      // If block contains semicolons, split into individual statements
      const subStatements = cypherText
        .split(/;\s*\n/)
        .map((statement) => statement.replace(/;\s*$/, '').trim())
        .filter((statement) => statement.length > 0);

      statements.push(...subStatements);
    }

    console.log(`Running ${scriptName} (${statements.length} statements)...`);

    for (const statement of statements) {
      await database.query(statement);
    }

    console.log(`  ✓ ${scriptName} complete`);
  }

  await database.disconnect();
  console.log('Database setup complete.');
}

runSetup().catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});
