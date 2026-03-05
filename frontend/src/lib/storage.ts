// ════════════════════════════════════════════════════════════════════
// localStorage Draft Adapter
// ════════════════════════════════════════════════════════════════════

const PREFIX = 'asr:draft:';

export interface DraftEntry {
  reviewId: string;
  applicationName: string;
  updatedTimestamp: string;
}

// ────────────────────────────────────────────────────────────────────
// saveDraft
// ────────────────────────────────────────────────────────────────────

export function saveDraft(reviewId: string, state: unknown): void {
  const key = PREFIX + reviewId;
  const payload = JSON.stringify({
    ...(state as Record<string, unknown>),
    updatedTimestamp: new Date().toISOString(),
  });
  localStorage.setItem(key, payload);
}

// ────────────────────────────────────────────────────────────────────
// loadDraft
// ────────────────────────────────────────────────────────────────────

export function loadDraft(reviewId: string): unknown | null {
  let answer: unknown | null = null;

  const key = PREFIX + reviewId;
  const raw = localStorage.getItem(key);
  if (raw != null) {
    answer = JSON.parse(raw);
  }

  return answer;
}

// ────────────────────────────────────────────────────────────────────
// listDrafts
// ────────────────────────────────────────────────────────────────────

export function listDrafts(): DraftEntry[] {
  const answer: DraftEntry[] = [];

  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key != null && key.startsWith(PREFIX)) {
      const raw = localStorage.getItem(key);
      if (raw != null) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        answer.push({
          reviewId: key.slice(PREFIX.length),
          applicationName: (parsed.applicationName as string) || '',
          updatedTimestamp: (parsed.updatedTimestamp as string) || '',
        });
      }
    }
  }

  return answer;
}

// ────────────────────────────────────────────────────────────────────
// deleteDraft
// ────────────────────────────────────────────────────────────────────

export function deleteDraft(reviewId: string): void {
  localStorage.removeItem(PREFIX + reviewId);
}
