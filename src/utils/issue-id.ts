import type { TFile } from 'obsidian';
import { DEFAULT_ISSUE_PREFIX } from '../constants.ts';

/**
 * Builds a regex to match filenames like `ISSUE-001`, `TASK-001`, etc.
 *
 * The prefix is escaped before interpolation. `normalizePrefix` already strips
 * anything outside `[A-Z0-9_]`, but this function is also reachable with a
 * prefix read straight from stored settings or passed by a caller, and an
 * unescaped `.` or `(` there would silently build the wrong pattern.
 */
export function buildFilenamePattern(prefix: string): RegExp {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}-(\\d+)$`, 'i');
}

/** Normalizes a user-entered prefix to uppercase alphanumeric+underscore. */
export function normalizePrefix(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.startsWith('.')) return DEFAULT_ISSUE_PREFIX;
  return trimmed.toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
}

/**
 * Extracts the numeric portion of an issue ID as a short `#N` label,
 * working with any prefix (ISSUE-001 → #1, TASK-050 → #50).
 */
export function shortIssueId(id: string): string {
  const match = id.match(/^[A-Z0-9_]+-(\d+)$/i);
  return match && match[1] !== undefined ? `#${parseInt(match[1], 10)}` : id;
}

/**
 * Computes the next sequential issue ID from a list of existing files.
 * e.g. given ISSUE-001, ISSUE-002, ISSUE-005 → ISSUE-006
 */
export function getNextIssueId(files: TFile[], prefix: string): string {
  const pattern = buildFilenamePattern(prefix);
  const highestNumber = files.reduce((highest, file) => {
    const match = file.basename.match(pattern);
    const value = match?.[1] === undefined ? 0 : Number.parseInt(match[1], 10);
    return Number.isNaN(value) ? highest : Math.max(highest, value);
  }, 0);

  return `${prefix}-${String(highestNumber + 1).padStart(3, '0')}`;
}

/**
 * Returns filenames that belong to the issues folder and match the
 * expected ID pattern for the given prefix.
 */
export function issueFilesInFolder(files: TFile[], folderPath: string, prefix: string): TFile[] {
  const pattern = buildFilenamePattern(prefix);
  return files.filter(
    (file) => file.parent?.path === folderPath && pattern.test(file.basename),
  );
}
