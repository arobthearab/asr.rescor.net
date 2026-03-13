// ════════════════════════════════════════════════════════════════════
// MSAL Configuration — Entra ID authentication
// ════════════════════════════════════════════════════════════════════

import { PublicClientApplication, type Configuration } from '@azure/msal-browser';

const clientId = import.meta.env.VITE_MSAL_CLIENT_ID || '';
const tenantId = import.meta.env.VITE_MSAL_TENANT_ID || '';
const redirectUri = import.meta.env.VITE_MSAL_REDIRECT_URI || window.location.origin;

const msalConfig: Configuration = {
  auth: {
    clientId,
    // Single-tenant when VITE_MSAL_TENANT_ID is set;
    // multi-tenant (/organizations) when absent — allows any Entra org.
    authority: tenantId
      ? `https://login.microsoftonline.com/${tenantId}`
      : clientId
        ? `https://login.microsoftonline.com/organizations`
        : undefined,
    redirectUri,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

/** Scopes requested when acquiring tokens for the ASR API */
export const apiScopes = clientId ? [`${clientId}/.default`] : [];

/** Whether MSAL is configured (client ID present) */
export const isMsalConfigured = clientId.length > 0;
