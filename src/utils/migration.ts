import { buildFilenamePattern } from './issue-id.ts';

/**
 * Migration planning.
 *
 * The decisions — which files move, what they are renamed to, and which are
 * skipped because something already occupies the destination — are pure
 * functions over plain data, so they can be unit-tested without a live vault.
 * `IssueService` is left with only the part that genuinely needs Obsidian:
 * executing the plan.
 */

/** The minimum a file has to look like for planning purposes. */
export interface PlannableFile {
  basename: string;
  name: string;
  parentPath: string;
}

export interface MoveOperation {
  file: PlannableFile;
  targetPath: string;
}

export interface RenameOperation {
  file: PlannableFile;
  oldId: string;
  newId: string;
  targetPath: string;
}

export interface Plan<T> {
  operations: T[];
  /** Files left alone because their destination is already occupied. */
  skipped: PlannableFile[];
}

function joinPath(folder: string, name: string): string {
  return folder.length > 0 ? `${folder}/${name}` : name;
}

/**
 * Plans a folder move for the issue notes in `fromFolder`.
 *
 * `prefix` is passed explicitly rather than assumed: a combined rename-and-move
 * renames first, so by the time the move is planned the files already carry the
 * new prefix while stored settings still hold the old one.
 */
export function planFolderMove(
  files: PlannableFile[],
  fromFolder: string,
  toFolder: string,
  prefix: string,
  occupied: ReadonlySet<string> = new Set(),
): Plan<MoveOperation> {
  if (fromFolder === toFolder) return { operations: [], skipped: [] };

  const pattern = buildFilenamePattern(prefix);
  const operations: MoveOperation[] = [];
  const skipped: PlannableFile[] = [];
  // Destinations claimed earlier in this same plan also count as occupied,
  // so two sources can never be scheduled onto one target.
  const taken = new Set(occupied);

  for (const file of files) {
    if (file.parentPath !== fromFolder) continue;
    if (!pattern.test(file.basename)) continue;

    const targetPath = joinPath(toFolder, file.name);
    if (taken.has(targetPath)) {
      skipped.push(file);
      continue;
    }
    taken.add(targetPath);
    operations.push({ file, targetPath });
  }

  return { operations, skipped };
}

/**
 * Plans an ID-prefix rename. The numeric portion is preserved, so ISSUE-007
 * becomes TASK-007 rather than being renumbered.
 */
export function planPrefixRename(
  files: PlannableFile[],
  folder: string,
  fromPrefix: string,
  toPrefix: string,
  occupied: ReadonlySet<string> = new Set(),
): Plan<RenameOperation> {
  if (fromPrefix === toPrefix) return { operations: [], skipped: [] };

  const pattern = buildFilenamePattern(fromPrefix);
  const operations: RenameOperation[] = [];
  const skipped: PlannableFile[] = [];
  const taken = new Set(occupied);

  for (const file of files) {
    if (file.parentPath !== folder) continue;

    const match = file.basename.match(pattern);
    const digits = match?.[1];
    if (digits === undefined) continue;

    const newId = `${toPrefix}-${digits}`;
    const targetPath = joinPath(folder, `${newId}.md`);

    if (taken.has(targetPath)) {
      skipped.push(file);
      continue;
    }
    taken.add(targetPath);
    operations.push({ file, oldId: file.basename, newId, targetPath });
  }

  return { operations, skipped };
}
