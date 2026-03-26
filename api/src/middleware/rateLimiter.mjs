// ════════════════════════════════════════════════════════════════════
// Rate Limiters — brute-force and DoS protection
// ════════════════════════════════════════════════════════════════════
// authLimiter  — tight ceiling for authentication endpoints
// apiLimiter   — per-tenant ceiling for all other API endpoints
// ════════════════════════════════════════════════════════════════════

import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

const isDevelopment = process.env.NODE_ENV !== 'production';

// ── Auth endpoints — 20 requests per 15 minutes per IP ────────────
// Applied to /api/auth/* before the authenticate middleware so that
// brute-force token attempts are throttled at the network edge.
// Disabled in development to avoid E2E test flakiness.

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 10000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication requests, please try again later.' },
});

// ── General API — 300 requests per minute per tenant (or IP) ─────
// Keyed by tenantId when the user is authenticated; falls back to
// IP for unauthenticated requests (health check, etc.).

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: isDevelopment ? 10000 : 300,
  keyGenerator: (request) => request.user?.tenantId || ipKeyGenerator(request),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded, please slow down.' },
  validate: { keyGeneratorIpFallback: false },
});
