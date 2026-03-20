// ════════════════════════════════════════════════════════════════════
// UserMenu — displays authenticated user identity + sign-out action
// ════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { useMsal } from '@azure/msal-react';
import { Avatar, Box, IconButton, Menu, MenuItem, Typography } from '@mui/material';
import { isMsalConfigured } from '../lib/authConfig';
import { useCurrentUser } from '../hooks/useCurrentUser';

export default function UserMenu() {
  const { instance } = useMsal();
  const { user: apiUser } = useCurrentUser();
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);

  const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;

  // Derive display values from MSAL account or API user (dev bypass)
  const displayName = account?.name || account?.username
    || apiUser?.preferred_username || apiUser?.email || null;
  const accountEmail = account?.username || apiUser?.email || apiUser?.preferred_username || null;

  if (!displayName) {
    return null;
  }

  const initials = displayName
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  function handleOpen(event: React.MouseEvent<HTMLElement>): void {
    setAnchorElement(event.currentTarget);
  }

  function handleClose(): void {
    setAnchorElement(null);
  }

  function handleSignOut(): void {
    handleClose();
    if (isMsalConfigured && account) {
      instance.logoutRedirect({ account, postLogoutRedirectUri: window.location.origin });
    } else {
      // Dev bypass — just reload to clear any cached state
      window.location.reload();
    }
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', ml: 2 }}>
      <Typography variant="body2" color="inherit" sx={{ mr: 1, opacity: 0.9, display: { xs: 'none', sm: 'block' } }}>
        {displayName}
      </Typography>
      <IconButton size="small" onClick={handleOpen} sx={{ color: 'inherit' }}>
        <Avatar sx={{ width: 32, height: 32, fontSize: '0.875rem', bgcolor: 'rgba(255,255,255,0.2)' }}>
          {initials}
        </Avatar>
      </IconButton>
      <Menu anchorEl={anchorElement} open={Boolean(anchorElement)} onClose={handleClose}>
        {accountEmail && (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">{accountEmail}</Typography>
          </MenuItem>
        )}
        <MenuItem onClick={handleSignOut}>Sign out</MenuItem>
      </Menu>
    </Box>
  );
}
