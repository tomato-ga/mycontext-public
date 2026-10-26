import { buildEditorKnowledgeDocumentUri, toEditorKnowledgeDocumentId } from "./editorKnowledge.js";

/**
 * Two whole-document editing playbooks live side by side in TiDB:
 * - v1 (editing-playbook): the 2026-07-26 eleven-chapter page, kept unchanged.
 * - v2 (editing-playbook-v2): the 2026-10-23 page rebuilt from the eight
 *   "メディアと編集研修" slide decks, with a "00 常時読む要約" chapter meant to be read
 *   before every edit. v2 is the default for get_editing_playbook_context.
 */
export type EditingPlaybookVersion = "v1" | "v2";
export const EDITING_PLAYBOOK_VERSIONS = ["v1", "v2"] as const satisfies readonly EditingPlaybookVersion[];
export const DEFAULT_EDITING_PLAYBOOK_VERSION: EditingPlaybookVersion = "v2";

export const EDITING_PLAYBOOK_SOURCE_IDS = {
  v1: "editing-playbook",
  v2: "editing-playbook-v2"
} as const satisfies Record<EditingPlaybookVersion, string>;

export const EDITING_PLAYBOOK_SOURCE_ID = EDITING_PLAYBOOK_SOURCE_IDS.v1;
export const EDITING_PLAYBOOK_DOCUMENT_ID =
  toEditorKnowledgeDocumentId(EDITING_PLAYBOOK_SOURCE_ID);
export const EDITING_PLAYBOOK_V2_SOURCE_ID = EDITING_PLAYBOOK_SOURCE_IDS.v2;
export const EDITING_PLAYBOOK_V2_DOCUMENT_ID =
  toEditorKnowledgeDocumentId(EDITING_PLAYBOOK_V2_SOURCE_ID);
// v2 carries the full slide text of eight decks (~21k chars after the H1 is added);
// 40k leaves room for growth while still refusing a runaway record.
export const MAX_EDITING_PLAYBOOK_CONTEXT_CHARS = 40_000;

export function editingPlaybookSourceId(version: EditingPlaybookVersion): string {
  return EDITING_PLAYBOOK_SOURCE_IDS[version];
}

export function editingPlaybookDocumentId(version: EditingPlaybookVersion): string {
  return toEditorKnowledgeDocumentId(editingPlaybookSourceId(version));
}

export interface EditingPlaybookContext {
  document_id: string;
  title: string;
  markdown_sha256: string;
  revision_sha256: string;
  storage_mode: "whole_document";
  record_count: 1;
  section_count: 0;
  search_span_count: 1;
  context_chars: number;
  retrieval_mode: "full_playbook";
  truncated: false;
  last_synced_at: string | null;
  source_resource_uri: string;
  markdown: string;
}

export class EditingPlaybookContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EditingPlaybookContextError";
  }
}

export class EditingPlaybookContextTooLargeError extends RangeError {
  constructor(actual: number, maximum: number) {
    super(
      `editing playbook is ${actual} chars; maximum is ${maximum}; no truncation was applied`
    );
    this.name = "EditingPlaybookContextTooLargeError";
  }
}

export function buildEditingPlaybookResourceUri(version: EditingPlaybookVersion): string {
  return buildEditorKnowledgeDocumentUri(editingPlaybookSourceId(version));
}
