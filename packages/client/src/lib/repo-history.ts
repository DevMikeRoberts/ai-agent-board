const LS_KEY = 'agentboard-recent-repo-paths';
const MAX_RECENT = 5;

export function getRecentRepoPaths(): string[] {
  try {
    const stored = localStorage.getItem(LS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function addRepoPath(path: string): void {
  const trimmed = path.trim();
  if (!trimmed) return;
  const recent = getRecentRepoPaths().filter((p) => p !== trimmed);
  recent.unshift(trimmed);
  localStorage.setItem(LS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}
