import { App, normalizePath, parseYaml, TFile } from 'obsidian';
import {
  ISSUES_FOLDER,
  ISSUE_FILENAME_PATTERN,
  FRONTMATTER_FIELD_ORDER,
} from './constants';
import type { Issue, IssueData, IssuePriority, IssueStatus } from './types';

export class IssueService {
  constructor(private readonly app: App) {}

  async ensureIssuesFolder(): Promise<void> {
    const folderPath = normalizePath(ISSUES_FOLDER);

    if (this.app.vault.getFolderByPath(folderPath) !== null) {
      return;
    }

    await this.app.vault.createFolder(folderPath);
  }

  async createIssue(data: IssueData): Promise<TFile> {
    await this.ensureIssuesFolder();

    const id = this.getNextIssueId();
    const path = normalizePath(`${ISSUES_FOLDER}/${id}.md`);
    const content = this.buildFileContent(
      this.serializeFrontmatter({ id, ...data }),
      'Describe the issue here.\n',
    );

    return this.app.vault.create(path, content);
  }

  async listIssues(): Promise<Issue[]> {
    const files = this.getIssueFiles();
    const issues = await Promise.all(files.map((file) => this.readIssue(file)));

    return issues.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }

  async toggleIssueStatus(file: TFile): Promise<void> {
    const content = await this.app.vault.cachedRead(file);
    const frontmatter = this.parseFrontmatter(content);
    const current = this.toStringValue(frontmatter.status, 'open');
    const nextStatus: IssueStatus = current === 'open' ? 'closed' : 'open';
    await this.updateIssue(file, { status: nextStatus });
  }

  async updateIssue(file: TFile, changes: Record<string, unknown>): Promise<void> {
    const content = await this.app.vault.cachedRead(file);
    const frontmatter = this.parseFrontmatter(content);
    const body = this.extractBody(content);
    const merged = { ...frontmatter, ...changes };
    const yaml = this.serializeFrontmatter(merged);
    await this.app.vault.modify(file, this.buildFileContent(yaml, body));
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
      status: this.toStringValue(frontmatter.status, 'open') as IssueStatus,
      priority: this.toStringValue(frontmatter.priority, 'medium') as IssuePriority,
      project: this.toStringValue(frontmatter.project, ''),
      labels: this.toStringArrayValue(frontmatter.labels, []),
      created: this.toStringValue(
        frontmatter.created,
        new Date().toISOString().slice(0, 10),
      ),
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

  private toStringArrayValue(
    value: unknown,
    fallback: string[],
  ): string[] {
    if (Array.isArray(value)) {
      return value.filter(
        (item): item is string =>
          typeof item === 'string' && item.trim().length > 0,
      );
    }
    return fallback;
  }

  private serializeFrontmatter(data: Record<string, unknown>): string {
    const lines: string[] = [];

    for (const key of FRONTMATTER_FIELD_ORDER) {
      const value = data[key];
      if (value === undefined || value === null) {
        continue;
      }
      lines.push(...this.serializeValue(key, value));
    }

    for (const [key, value] of Object.entries(data)) {
      if (FRONTMATTER_FIELD_ORDER.includes(key)) {
        continue;
      }
      if (value === undefined || value === null) {
        continue;
      }
      lines.push(...this.serializeValue(key, value));
    }

    return lines.join('\n');
  }

  private serializeValue(key: string, value: unknown): string[] {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return [`${key}: []`];
      }
      const items = value
        .filter(
          (item): item is string =>
            typeof item === 'string' && item.trim().length > 0,
        )
        .map((item) => `  - ${item}`);
      return [`${key}:`, ...items];
    }
    if (typeof value === 'string') {
      return [`${key}: ${value}`];
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return [`${key}: ${value}`];
    }
    return [`${key}: ${String(value)}`];
  }

  private extractBody(content: string): string {
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
    if (match?.[0] === undefined) {
      return content;
    }
    return content.slice(match[0].length);
  }

  private buildFileContent(yaml: string, body: string): string {
    return `---\n${yaml}\n---\n${body}`;
  }
}
