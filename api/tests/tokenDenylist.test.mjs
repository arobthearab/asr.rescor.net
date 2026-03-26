// ════════════════════════════════════════════════════════════════════
// Unit Tests — TokenDenylist (server-side session revocation)
// ════════════════════════════════════════════════════════════════════

import { describe, it, expect, afterEach } from 'vitest';
import { TokenDenylist } from '../src/TokenDenylist.mjs';

describe('TokenDenylist', () => {
  let denylist = null;

  afterEach(() => {
    if (denylist) {
      denylist.stop();
      denylist = null;
    }
  });

  // ── revokeToken + isDenied ──────────────────────────────────────

  it('denies a revoked token by jti', () => {
    denylist = new TokenDenylist();
    denylist.revokeToken('token-abc');
    expect(denylist.isDenied('token-abc', null)).toBe(true);
  });

  it('allows an unknown token', () => {
    denylist = new TokenDenylist();
    expect(denylist.isDenied('unknown-jti', null)).toBe(false);
  });

  it('ignores null jti in revokeToken', () => {
    denylist = new TokenDenylist();
    denylist.revokeToken(null);
    expect(denylist.stats.deniedTokens).toBe(0);
  });

  it('ignores undefined jti in revokeToken', () => {
    denylist = new TokenDenylist();
    denylist.revokeToken(undefined);
    expect(denylist.stats.deniedTokens).toBe(0);
  });

  // ── revokeUser + isDenied ───────────────────────────────────────

  it('denies any token from a revoked user by sub', () => {
    denylist = new TokenDenylist();
    denylist.revokeUser('user-xyz');
    expect(denylist.isDenied(null, 'user-xyz')).toBe(true);
  });

  it('allows an unknown user sub', () => {
    denylist = new TokenDenylist();
    expect(denylist.isDenied(null, 'unknown-sub')).toBe(false);
  });

  it('ignores null sub in revokeUser', () => {
    denylist = new TokenDenylist();
    denylist.revokeUser(null);
    expect(denylist.stats.deniedUsers).toBe(0);
  });

  // ── Combined jti + sub checks ──────────────────────────────────

  it('returns denied when jti matches even if sub does not', () => {
    denylist = new TokenDenylist();
    denylist.revokeToken('token-1');
    expect(denylist.isDenied('token-1', 'innocent-user')).toBe(true);
  });

  it('returns denied when sub matches even if jti does not', () => {
    denylist = new TokenDenylist();
    denylist.revokeUser('bad-user');
    expect(denylist.isDenied('innocent-token', 'bad-user')).toBe(true);
  });

  it('returns false when both jti and sub are null', () => {
    denylist = new TokenDenylist();
    denylist.revokeToken('token-1');
    expect(denylist.isDenied(null, null)).toBe(false);
  });

  // ── TTL expiry ─────────────────────────────────────────────────

  it('expires a revoked token after TTL', () => {
    denylist = new TokenDenylist(50); // 50ms TTL

    denylist.revokeToken('expiring-token');
    expect(denylist.isDenied('expiring-token', null)).toBe(true);

    // Wait for TTL to expire
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(denylist.isDenied('expiring-token', null)).toBe(false);
        resolve();
      }, 80);
    });
  });

  it('expires a revoked user after TTL', () => {
    denylist = new TokenDenylist(50);

    denylist.revokeUser('expiring-user');
    expect(denylist.isDenied(null, 'expiring-user')).toBe(true);

    return new Promise((resolve) => {
      setTimeout(() => {
        expect(denylist.isDenied(null, 'expiring-user')).toBe(false);
        resolve();
      }, 80);
    });
  });

  // ── Stats ──────────────────────────────────────────────────────

  it('tracks counts in stats', () => {
    denylist = new TokenDenylist();
    denylist.revokeToken('t1');
    denylist.revokeToken('t2');
    denylist.revokeUser('u1');

    expect(denylist.stats).toEqual({ deniedTokens: 2, deniedUsers: 1 });
  });

  // ── Stop ───────────────────────────────────────────────────────

  it('clears the cleanup timer on stop', () => {
    denylist = new TokenDenylist();
    denylist.stop();
    // Calling stop twice should not throw
    denylist.stop();
    denylist = null; // prevent afterEach double-stop
  });
});
