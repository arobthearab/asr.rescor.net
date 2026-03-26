// ════════════════════════════════════════════════════════════════════
// TokenDenylist — server-side session revocation
// ════════════════════════════════════════════════════════════════════
// In-memory denylist for revoked JWT `jti` (JWT ID) or `sub` claims.
// Entries auto-expire after the JWT max lifetime window (configurable,
// default 90 minutes matching Entra ID access token lifetime).
//
// Two revocation modes:
//   - revokeToken(jti)  — revoke a single token by its JWT ID
//   - revokeUser(sub)   — revoke all tokens for a user (by subject)
//
// Checked by authenticate middleware on every request.
// ════════════════════════════════════════════════════════════════════

export class TokenDenylist {
  static DEFAULT_TTL_MS = 90 * 60 * 1000; // 90 minutes

  #deniedTokens = new Map();   // jti → expiry timestamp
  #deniedUsers = new Map();    // sub → expiry timestamp
  #cleanupTimer = null;

  constructor(ttlMs = TokenDenylist.DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;

    // Periodic cleanup every 5 minutes
    this.#cleanupTimer = setInterval(() => this.#cleanup(), 5 * 60 * 1000);
    this.#cleanupTimer.unref();
  }

  revokeToken(jti) {
    if (jti) {
      this.#deniedTokens.set(jti, Date.now() + this.ttlMs);
    }
  }

  revokeUser(sub) {
    if (sub) {
      this.#deniedUsers.set(sub, Date.now() + this.ttlMs);
    }
  }

  isDenied(jti, sub) {
    let denied = false;
    const now = Date.now();

    if (!denied && jti && this.#deniedTokens.has(jti)) {
      const expiry = this.#deniedTokens.get(jti);
      if (now < expiry) {
        denied = true;
      } else {
        this.#deniedTokens.delete(jti);
      }
    }

    if (!denied && sub && this.#deniedUsers.has(sub)) {
      const expiry = this.#deniedUsers.get(sub);
      if (now < expiry) {
        denied = true;
      } else {
        this.#deniedUsers.delete(sub);
      }
    }

    return denied;
  }

  get stats() {
    return {
      deniedTokens: this.#deniedTokens.size,
      deniedUsers: this.#deniedUsers.size,
    };
  }

  stop() {
    if (this.#cleanupTimer) {
      clearInterval(this.#cleanupTimer);
      this.#cleanupTimer = null;
    }
  }

  #cleanup() {
    const now = Date.now();

    for (const [jti, expiry] of this.#deniedTokens) {
      if (now >= expiry) this.#deniedTokens.delete(jti);
    }

    for (const [sub, expiry] of this.#deniedUsers) {
      if (now >= expiry) this.#deniedUsers.delete(sub);
    }
  }
}
