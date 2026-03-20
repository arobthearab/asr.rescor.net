// ════════════════════════════════════════════════════════════════════
// 013 — Service Account constraints
// ════════════════════════════════════════════════════════════════════

CREATE CONSTRAINT service_account_id IF NOT EXISTS
FOR (sa:ServiceAccount) REQUIRE sa.serviceAccountId IS UNIQUE

CREATE CONSTRAINT service_account_key_hash IF NOT EXISTS
FOR (sa:ServiceAccount) REQUIRE sa.apiKeyHash IS UNIQUE
