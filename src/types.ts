import type { TFile } from 'obsidian';

export type IssueStatus = 'open' | 'closed';

export interface IssueData {
  title: string;
  status: IssueStatus;
  created: string;
}

export interface Issue extends IssueData {
  id: string;
  file: TFile;
}
