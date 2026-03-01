# Claude Instructions — asr.rescor.net

## Mandatory: Read Cross-Project Patterns First

Before writing any code or making any changes, read:

```
/Volumes/Overflow/Repositories/core.rescor.net/docs/PROJECT-PATTERNS.md
```

This file defines mandatory patterns for all RESCOR projects:
- Code style (single return point, full words, short functions)
- DB2 SQL patterns (FINAL TABLE, GENERATED ALWAYS AS IDENTITY, null guards)
- Secrets policy (Infisical-first, no .env for application config)
- Configuration-First Runtime Policy
- Source control discipline (scoped commits)
- CLI usage patterns
- Build-vs-Buy disclosure

## Project-Specific Patterns

See [PROJECT-PATTERNS.md](PROJECT-PATTERNS.md) for ASR-specific conventions
(schema names, quick-reference CLI commands, ASR workflows).
