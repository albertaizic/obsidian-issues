import type { TFile } from 'obsidian';

export type IssueStatus = 'open' | 'closed';
export type IssuePriority = 'low' | 'medium' | 'high' | 'critical';

export interface IssueData {
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  created: string;
}

export interface Issue extends IssueData {
  id: string;
  file: TFile;
}
