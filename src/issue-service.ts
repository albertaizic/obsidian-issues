import { App, normalizePath, parseYaml, TFile } from 'obsidian';
import { ISSUES_FOLDER, ISSUE_FILENAME_PATTERN } from './constants';
import type { Issue } from './types';

export class IssueService {
  constructor(private readonly app: App) {}

  async ensureIssuesFolder(): Promise<void> {
    const folderPath = normalizePath(ISSUES_FOLDER);

    if (this.app.vault.getFolderByPath(folderPath) !== null) {
      return;
    }

    await this.app.vault.createFolder(folderPath);
  }

  async createIssue(): Promise<TFile> {
    await this.ensureIssuesFolder();

    const id = this.getNextIssueId();
    const path = normalizePath(`${ISSUES_FOLDER}/${id}.md`);
    const created = new Date().toISOString().slice(0, 10);

    const content = [
      '---',
      `id: ${id}`,
      'title: New issue',
      'status: open',
      `created: ${created}`,
      '---',
      '',
      'Describe the issue here.',
      '',
    ].join('\n');

    return this.app.vault.create(path, content);
  }

  async listIssues(): Promise<Issue[]> {
    const files = this.getIssueFiles();
    const issues = await Promise.all(files.map((file) => this.readIssue(file)));

    return issues.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }

  private getIssueFiles(): TFile[] {
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.parent?.path === ISSUES_FOLDER)
      .filter((file) => ISSUE_FILENAME_PATTERN.test(file.basename));
  }

  private getNextIssueId(): string {
    const highestNumber = this.getIssueFiles().reduce((highest, file) => {
      const match = file.basename.match(ISSUE_FILENAME_PATTERN);
      const value = match?.[1] === undefined ? 0 : Number.parseInt(match[1], 10);
      return Number.isNaN(value) ? highest : Math.max(highest, value);
    }, 0);

    return `ISSUE-${String(highestNumber + 1).padStart(3, '0')}`;
  }

  private async readIssue(file: TFile): Promise<Issue> {
    const content = await this.app.vault.cachedRead(file);
    const frontmatter = this.parseFrontmatter(content);

    return {
      id: this.toStringValue(frontmatter.id, file.basename),
      title: this.toStringValue(frontmatter.title, file.basename),
      status: this.toStringValue(frontmatter.status, 'open'),
      file,
    };
  }

  private parseFrontmatter(content: string): Record<string, unknown> {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);

    if (match?.[1] === undefined) {
      return {};
    }

    try {
      const parsed: unknown = parseYaml(match[1]);
      return this.isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private toStringValue(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
  }
}
