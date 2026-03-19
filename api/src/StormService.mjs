/**
 * StormService.mjs — ASR ↔ STORM Risk Computation Engine integration.
 *
 * Delegates `computeScore` to the STORM API, with a local fallback to
 * the existing `scoring.mjs` implementation when STORM is unreachable.
 *
 * The return shape matches the local `computeScore` exactly:
 *   { raw: number, normalized: number, rating: string }
 *
 * Configuration domains:
 *   storm:    base_url, enabled
 *   keycloak: base_url, realm, client_id, client_secret
 *     (separate from 'entra' — STORM uses Keycloak, ASR users use Entra)
 *
 * Usage:
 *   const storm = await StormService.create({ configuration });
 *   const score = await storm.computeScore(measurements, scoringConfiguration);
 */

import { computeScore as localComputeScore } from './scoring.mjs';

const EXPIRY_BUFFER_SECONDS = 60;
const TOKEN_TIMEOUT_MS      = 10_000;
const STORM_TIMEOUT_MS      = 15_000;

/**
 * Build a Keycloak client-credentials token fetcher with caching.
 *
 * @param {{ keycloakUrl: string, realm: string, clientId: string, clientSecret: string }} opts
 * @returns {() => Promise<string>}
 */
function buildTokenFetcher({ keycloakUrl, realm, clientId, clientSecret }) {
    const tokenUrl = `${keycloakUrl.replace(/\/+$/, '')}/realms/${realm}/protocol/openid-connect/token`;
    let cached    = null;
    let expiresAt = 0;

    return async function fetchToken() {
        const now = Math.floor(Date.now() / 1000);

        if (cached && now < expiresAt - EXPIRY_BUFFER_SECONDS) {
            return cached;
        }

        const body = new URLSearchParams({
            grant_type:    'client_credentials',
            client_id:     clientId,
            client_secret: clientSecret,
        });

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);

        let response;
        try {
            response = await fetch(tokenUrl, {
                method:  'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
                signal:  controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            throw new Error(`Keycloak token request failed: ${response.status}`);
        }

        const parsed = await response.json();
        cached    = parsed.access_token;
        expiresAt = now + (parsed.expires_in || 300);

        return cached;
    };
}

export class StormService {

    /**
     * @param {Object}   options
     * @param {string}   options.baseUrl       STORM API base URL
     * @param {boolean}  options.enabled       Feature flag
     * @param {Function} [options.tokenFetcher] Async fn returning a bearer token
     */
    constructor({ baseUrl, enabled, tokenFetcher = null }) {
        this.baseUrl      = baseUrl;
        this.enabled      = enabled;
        this.tokenFetcher = tokenFetcher;
    }

    /* ---------------------------------------------------------------------- */

    /**
     * Factory: resolve config from Infisical and build an integration instance.
     *
     * @param {Object} params
     * @param {Object} params.configuration  Configuration instance
     * @returns {Promise<StormService>}
     */
    static async create({ configuration }) {
        const getConfig = async (domain, key) => {
            if (!configuration || typeof configuration.getConfig !== 'function') {
                return null;
            }
            try {
                return await configuration.getConfig(domain, key, { throwOnMissing: false });
            } catch {
                return null;
            }
        };

        const baseUrl = await getConfig('storm', 'base_url');
        const enabled = String(await getConfig('storm', 'enabled') ?? 'false').toLowerCase() === 'true';

        if (!enabled || !baseUrl) {
            return new StormService({ baseUrl: null, enabled: false });
        }

        const keycloakUrl  = await getConfig('keycloak', 'base_url');
        const realm        = await getConfig('keycloak', 'realm');
        const clientId     = await getConfig('keycloak', 'client_id');
        const clientSecret = await getConfig('keycloak', 'client_secret');

        let tokenFetcher = null;
        if (keycloakUrl && realm && clientId && clientSecret) {
            tokenFetcher = buildTokenFetcher({ keycloakUrl, realm, clientId, clientSecret });
        }

        return new StormService({ baseUrl, enabled: true, tokenFetcher });
    }

    /* ---------------------------------------------------------------------- */

    /**
     * Compute a risk score from a set of measurements.
     * Matches the local `computeScore(measurements, scoringConfiguration)` return shape:
     *   { raw: number, normalized: number, rating: string }
     *
     * Falls back to the local formula on any error.
     *
     * @param {number[]} measurements
     * @param {Object}   scoringConfiguration  { dampingFactor, rawMax, ratingThresholds, ratingLabels }
     * @returns {Promise<{ raw: number, normalized: number, rating: string }>}
     */
    async computeScore(measurements, scoringConfiguration) {
        if (!this.enabled) {
            return localComputeScore(measurements, scoringConfiguration);
        }

        let result;
        try {
            const body = {
                measurements,
                scalingBase: scoringConfiguration?.dampingFactor ?? 4,
            };
            const data = await this._post('/v1/rsk/vm/score', body);
            result = {
                raw:        data.scaled?.aggregate ?? 0,
                normalized: data.scaled?.normalized ?? 0,
                rating:     data.rating ?? 'Low',
            };
        } catch (error) {
            console.warn(`[StormService] computeScore fallback: ${error.message}`);
            result = localComputeScore(measurements, scoringConfiguration);
        }

        return result;
    }

    /**
     * Return a snapshot of the service state.
     * @returns {{ enabled: boolean, baseUrl: string|null }}
     */
    snapshot() {
        return {
            enabled: this.enabled,
            baseUrl: this.baseUrl ?? null,
        };
    }

    /* ---------------------------------------------------------------------- */

    async _post(path, body) {
        const url     = `${this.baseUrl}${path}`;
        const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };

        if (this.tokenFetcher) {
            headers['Authorization'] = `Bearer ${await this.tokenFetcher()}`;
        }

        const controller = new AbortController();
        const timer      = setTimeout(() => controller.abort(), STORM_TIMEOUT_MS);

        let response;
        try {
            response = await fetch(url, {
                method:  'POST',
                headers,
                body:    JSON.stringify(body),
                signal:  controller.signal,
            });
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            throw new Error(`STORM ${path} responded ${response.status}`);
        }

        const envelope = await response.json();
        return envelope.data ?? envelope;
    }
}
