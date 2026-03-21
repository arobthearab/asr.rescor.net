// ════════════════════════════════════════════════════════════════════
// UserContext — single shared fetch of /api/auth/me for all consumers
// ════════════════════════════════════════════════════════════════════

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchCurrentUser, type CurrentUser } from '../lib/apiClient';
import type { CurrentUserState, UserRole } from '../hooks/useCurrentUser';

const defaultState: CurrentUserState = {
  user: null,
  loading: true,
  isAdmin: false,
  isReviewer: false,
  isUser: false,
  isAuditor: false,
  hasRole: () => false,
  canEdit: false,
  canCreate: false,
};

const UserContext = createContext<CurrentUserState>(defaultState);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCurrentUser()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<CurrentUserState>(() => {
    const roles = user?.roles || [];
    const isAdmin = roles.includes('admin');
    const isReviewer = roles.includes('reviewer');
    const isUser = roles.includes('user');
    const isAuditor = roles.includes('auditor');

    function hasRole(...required: UserRole[]): boolean {
      return isAdmin || required.some((role) => roles.includes(role));
    }

    return {
      user,
      loading,
      isAdmin,
      isReviewer,
      isUser,
      isAuditor,
      hasRole,
      canEdit: isAdmin || isReviewer,
      canCreate: isAdmin || isReviewer,
    };
  }, [user, loading]);

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUserContext(): CurrentUserState {
  return useContext(UserContext);
}
