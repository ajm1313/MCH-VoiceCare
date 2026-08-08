/**
 * Worklist sync — fetches the user's worklist from the server
 * and caches locally for offline task display.
 *
 * GET /api/v1/worklists/my
 */
import { AppConfig } from '../../config/appConfig';
import { useAuthStore } from '../auth/authStore';
import { setCachedJSON, getCachedJSON, CACHE_KEYS } from './contentCache';

export interface WorklistItem {
  id: string;
  entity_type: string;
  entity_id: string;
  subject_name: string;
  urgency: string;
  action_label: string;
  action_url: string | null;
  due_at: string | null;
  created_at: string;
}

type GetFn = (
  url: string,
  headers: Record<string, string>,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

let _getFn: GetFn | null = null;

export function setWorklistGetFunction(fn: GetFn): void {
  _getFn = fn;
}

export async function syncWorklist(): Promise<boolean> {
  if (!_getFn) {
    return false;
  }

  const { token } = useAuthStore.getState();
  if (!token) {
    return false;
  }

  const url = `${AppConfig.apiBaseUrl}/worklists/my`;

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

  const data = (await resp.json()) as { items: WorklistItem[] };
  setCachedJSON(CACHE_KEYS.WORKLIST, data.items, '1', 1); // 1-hour TTL
  return true;
}

export function getCachedWorklist(): WorklistItem[] | null {
  return getCachedJSON<WorklistItem[]>(CACHE_KEYS.WORKLIST);
}
