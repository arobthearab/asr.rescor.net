// ════════════════════════════════════════════════════════════════════
// AuthGuard — conditionally wraps the app in MSAL authentication
// ════════════════════════════════════════════════════════════════════
// When MSAL is configured (VITE_MSAL_CLIENT_ID env var set), this
// triggers loginRedirect if the user is not yet authenticated.
// When unconfigured (local dev without Entra), renders children
// immediately with no auth gate.

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useIsAuthenticated, useMsal } from '@azure/msal-react';
import { InteractionStatus } from '@azure/msal-browser';
import { Box, CircularProgress, Typography } from '@mui/material';
import { isMsalConfigured } from '../lib/authConfig';

interface AuthGuardProps {
  children: ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const isAuthenticated = useIsAuthenticated();
  const { inProgress } = useMsal();

  // No MSAL config — skip auth entirely (dev without Entra)
  if (!isMsalConfigured) {
    return <>{children}</>;
  }

  // MSAL interaction in progress — show spinner
  if (inProgress !== InteractionStatus.None) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 10, gap: 2 }}>
        <CircularProgress />
        <Typography color="text.secondary">Authenticating…</Typography>
      </Box>
    );
  }

  // Authenticated — render app
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // Not authenticated — trigger redirect (will re-render after)
  return <LoginRedirect />;
}

// ────────────────────────────────────────────────────────────────────
// LoginRedirect — triggers loginRedirect on mount
// ────────────────────────────────────────────────────────────────────

function LoginRedirect() {
  const { instance } = useMsal();

  useEffect(() => {
    instance.loginRedirect({ scopes: ['openid', 'profile', 'email'] }).catch((error) => {
      console.error('[asr] Login redirect failed:', error);
    });
  }, [instance]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 10, gap: 2 }}>
      <CircularProgress />
      <Typography color="text.secondary">Redirecting to sign in…</Typography>
    </Box>
  );
}
