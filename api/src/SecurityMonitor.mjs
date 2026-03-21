// ════════════════════════════════════════════════════════════════════
// SecurityMonitor — periodic anomaly detection for auth/audit events
// ════════════════════════════════════════════════════════════════════
// Runs on a configurable interval (default 5 min) and checks for:
//   1. Brute-force: excessive auth failures from a single IP
//   2. Cross-tenant: authorization.denied audit events
//   3. Credential stuffing: failures spread across many users from one IP
//
// Alerts are emitted via Recorder (event codes 9050–9059).
// ════════════════════════════════════════════════════════════════════

export class SecurityMonitor {
  static INTERVAL_MS = 5 * 60 * 1000;           // 5 minutes
  static BRUTE_FORCE_THRESHOLD = 10;             // failures per IP per window
  static CREDENTIAL_STUFFING_THRESHOLD = 5;      // distinct failed subs per IP
  static CROSS_TENANT_THRESHOLD = 1;             // any cross-tenant denial

  #database;
  #recorder;
  #timer = null;
  #lastCheckIso;

  constructor(database, recorder) {
    this.#database = database;
    this.#recorder = recorder;
    this.#lastCheckIso = new Date(Date.now() - SecurityMonitor.INTERVAL_MS).toISOString();
  }

  start() {
    this.#timer = setInterval(() => this.#check(), SecurityMonitor.INTERVAL_MS);
    this.#timer.unref();
    this.#recorder.emit(9050, 'i', 'Security monitor started', {
      intervalMs: SecurityMonitor.INTERVAL_MS,
    });
  }

  stop() {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  async #check() {
    const windowStart = this.#lastCheckIso;
    this.#lastCheckIso = new Date().toISOString();

    try {
      await Promise.all([
        this.#checkBruteForce(windowStart),
        this.#checkCrossTenantDenials(windowStart),
        this.#checkCredentialStuffing(windowStart),
      ]);
    } catch (error) {
      this.#recorder.emit(9051, 'w', 'Security monitor check failed', {
        error: error.message,
      });
    }
  }

  async #checkBruteForce(since) {
    const rows = await this.#database.query(
      `MATCH (e:AuthEvent)
       WHERE e.outcome = 'failure'
         AND e.timestamp >= $since
         AND e.ipAddress IS NOT NULL
       RETURN e.ipAddress AS ip, count(e) AS failures
       ORDER BY failures DESC
       LIMIT 10`,
      { since },
    );

    for (const row of rows) {
      const failures = typeof row.failures?.toNumber === 'function'
        ? row.failures.toNumber() : Number(row.failures);
      if (failures >= SecurityMonitor.BRUTE_FORCE_THRESHOLD) {
        this.#recorder.emit(9052, 'w', 'Brute-force attempt detected', {
          ip: row.ip, failures, since,
        });
      }
    }
  }

  async #checkCrossTenantDenials(since) {
    const rows = await this.#database.query(
      `MATCH (e:AuditEvent)
       WHERE e.action = 'authorization.denied'
         AND e.timestamp >= $since
       RETURN e.sub AS sub, e.tenantId AS tenantId,
              e.resourceId AS resource, e.timestamp AS timestamp
       ORDER BY e.timestamp DESC
       LIMIT 20`,
      { since },
    );

    if (rows.length >= SecurityMonitor.CROSS_TENANT_THRESHOLD) {
      this.#recorder.emit(9053, 'w', 'Authorization denials detected', {
        count: rows.length, since,
        samples: rows.slice(0, 5).map((r) => ({
          sub: r.sub, tenantId: r.tenantId, resource: r.resource,
        })),
      });
    }
  }

  async #checkCredentialStuffing(since) {
    const rows = await this.#database.query(
      `MATCH (e:AuthEvent)
       WHERE e.outcome = 'failure'
         AND e.timestamp >= $since
         AND e.ipAddress IS NOT NULL
       WITH e.ipAddress AS ip, collect(DISTINCT e.reason) AS reasons
       WHERE size(reasons) >= $threshold
       RETURN ip, size(reasons) AS distinctReasons
       ORDER BY distinctReasons DESC
       LIMIT 10`,
      { since, threshold: SecurityMonitor.CREDENTIAL_STUFFING_THRESHOLD },
    );

    for (const row of rows) {
      const distinctReasons = typeof row.distinctReasons?.toNumber === 'function'
        ? row.distinctReasons.toNumber() : Number(row.distinctReasons);
      this.#recorder.emit(9054, 'w', 'Possible credential stuffing detected', {
        ip: row.ip, distinctReasons, since,
      });
    }
  }
}
