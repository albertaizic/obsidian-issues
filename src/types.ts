import type { TFile } from 'obsidian';

export type IssueStatus = string;

export interface Issue {
  id: string;
  title: string;
  status: IssueStatus;
  file: TFile;
}
