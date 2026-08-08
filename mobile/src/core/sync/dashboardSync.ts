/**
 * Dashboard aggregate sync — fetches aggregate counts from the server
 * and caches locally for offline dashboard display.
 *
 * GET /api/v1/dashboard/aggregate/
 */
import { AppConfig } from '../../config/appConfig';
import { useAuthStore } from '../auth/authStore';
import { setCachedJSON, getCachedJSON, CACHE_KEYS } from './contentCache';

export interface DashboardAggregate {
  pregnancy: { active: number; emergency: number; priority: number; closed: number };
  newborn: { active: number; emergency: number; priority: number; closed: number };
  immunisation: { enrolled: number; defaulters_active: number; defaulters_lost: number };
  referrals: { open: number; emergency: number; acknowledged: number; closed: number };
  notifications: { open: number; emergency: number; priority: number };
  audit: { total_events: number; override_events: number; telephony_events: number };
  organisations: { regions: number; districts: number; subdistricts: number; facilities: number };
}

type GetFn = (
  url: string,
  headers: Record<string, string>,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

let _getFn: GetFn | null = null;

export function setDashboardGetFunction(fn: GetFn): void {
  _getFn = fn;
}

export async function syncDashboardAggregate(): Promise<boolean> {
  if (!_getFn) {
    return false;
  }

  const { token } = useAuthStore.getState();
  if (!token) {
    return false;
  }

  const url = `${AppConfig.apiBaseUrl}/dashboard/aggregate/`;

  let resp: { ok: boolean; status: number; json: () => Promise<unknown> };
  try {
    resp = await _getFn(url, {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
  } catch {
    return false;
  }

  if (!resp.ok) {
    return false;
  }

  const data = (await resp.json()) as DashboardAggregate;
  setCachedJSON(CACHE_KEYS.DASHBOARD_AGGREGATE, data, '1', 1); // 1-hour TTL
  return true;
}

export function getCachedDashboard(): DashboardAggregate | null {
  return getCachedJSON<DashboardAggregate>(CACHE_KEYS.DASHBOARD_AGGREGATE);
}
