// ════════════════════════════════════════════════════════════════════
// useCurrentUser — delegates to UserContext (shared, single fetch)
// ════════════════════════════════════════════════════════════════════

import { useUserContext } from '../contexts/UserContext';

export type UserRole = 'admin' | 'reviewer' | 'user' | 'auditor';

export interface CurrentUserState {
  user: import('../lib/apiClient').CurrentUser | null;
  loading: boolean;
  isAdmin: boolean;
  isReviewer: boolean;
  isUser: boolean;
  isAuditor: boolean;
  hasRole: (...roles: UserRole[]) => boolean;
  canEdit: boolean;
  canCreate: boolean;
}

export function useCurrentUser(): CurrentUserState {
  return useUserContext();
}
