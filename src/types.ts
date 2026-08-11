import type { TFile } from 'obsidian';

export type IssueStatus = 'open' | 'in-progress' | 'closed';
export type IssuePriority = 'low' | 'medium' | 'high' | 'critical';

export interface IssueData {
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  project: string;
  labels: string[];
  due: string;
  created: string;
}

export interface Issue extends IssueData {
  id: string;
  file: TFile;
  body: string;
}
