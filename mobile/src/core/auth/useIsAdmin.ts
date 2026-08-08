/**
 * Role-based access control hooks for the mobile app.
 */
import { useAuthStore, type UserProfile } from './authStore';

export function useIsSuperAdmin(): boolean {
  const { user } = useAuthStore();
  return user?.isSuperuser === true || user?.isSuperAdmin === true;
}

export function useIsAdmin(): boolean {
  const { user } = useAuthStore();
  if (!user) return false;
  return user.isSuperuser || user.isStaff || user.isSuperAdmin || user.isFacilityLevelOnly === false;
}

export function useCanViewReports(): boolean {
  const { user } = useAuthStore();
  if (!user) return false;
  return user.canViewReports;
}

export function isAdminUser(user: UserProfile | null): boolean {
  if (!user) return false;
  return user.isSuperuser || user.isStaff || user.isSuperAdmin || user.isFacilityLevelOnly === false;
}
