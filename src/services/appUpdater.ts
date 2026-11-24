import { medflowSupabase as supabase } from './guardianSync';

export const CURRENT_APP_VERSION = '1.0.0';

export interface AppRelease {
  version: string;
  apk_url: string;
  release_notes: string;
  created_at: string;
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '');
}

export function isNewerVersion(latestVersion: string, currentVersion: string): boolean {
  const parse = (version: string) => normalizeVersion(version)
    .split('.')
    .map((part) => Number.parseInt(part, 10));
  const latest = parse(latestVersion);
  const current = parse(currentVersion);
  if (latest.length === 0 || current.length === 0 ||
      latest.some(Number.isNaN) || current.some(Number.isNaN)) {
    return false;
  }
  const length = Math.max(latest.length, current.length);
  for (let index = 0; index < length; index++) {
    const latestPart = latest[index] || 0;
    const currentPart = current[index] || 0;
    if (latestPart !== currentPart) return latestPart > currentPart;
  }
  return false;
}

export function displayVersion(version: string): string {
  return `v${normalizeVersion(version)}`;
}

export class AppUpdaterService {
  static isConfigured(): boolean {
    return Boolean(supabase);
  }

  static async fetchLatestRelease(): Promise<AppRelease | null> {
    if (!supabase || !navigator.onLine) return null;
    const { data, error } = await supabase
      .from('app_releases')
      .select('version, apk_url, release_notes, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data as AppRelease | null;
  }
}
