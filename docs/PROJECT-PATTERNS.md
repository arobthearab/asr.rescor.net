# ASR Project Patterns

> Cross-project patterns (DB2, secrets, code style, CLI) are in
> **[core.rescor.net/docs/PROJECT-PATTERNS.md](../core.rescor.net/docs/PROJECT-PATTERNS.md)**.
> This file contains ASR-specific content only.

---

## Quick Reference

### Environment Management

```bash
# Deploy .env from template
rescor env deploy asr.rescor.net

# Validate .env
rescor env validate asr.rescor.net --template .env.example

# List variables
rescor env list --project asr.rescor.net
```

---

## References

- [Core Project Patterns](../core.rescor.net/docs/PROJECT-PATTERNS.md)
- [CLI Reference](../core.rescor.net/docs/CLI-REFERENCE.md)
