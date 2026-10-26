import { buildEditorKnowledgeDocumentUri, toEditorKnowledgeDocumentId } from "./editorKnowledge.js";

/**
 * Whole-document proofreading guide. The public repository supplies the reader,
 * not the guide text; deployments store their own document in TiDB.
 */
export const KOSEI_PLAYBOOK_SOURCE_ID = "proofreading-playbook";
export const KOSEI_PLAYBOOK_DOCUMENT_ID =
  toEditorKnowledgeDocumentId(KOSEI_PLAYBOOK_SOURCE_ID);
// Refuse oversized records rather than silently truncating the stored guide.
export const MAX_KOSEI_PLAYBOOK_CONTEXT_CHARS = 80_000;

export interface KoseiPlaybookContext {
  document_id: typeof KOSEI_PLAYBOOK_DOCUMENT_ID;
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

export class KoseiPlaybookContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KoseiPlaybookContextError";
  }
}

export class KoseiPlaybookContextTooLargeError extends RangeError {
  constructor(actual: number, maximum: number) {
    super(
      `kosei playbook is ${actual} chars; maximum is ${maximum}; no truncation was applied`
    );
    this.name = "KoseiPlaybookContextTooLargeError";
  }
}

export function buildKoseiPlaybookResourceUri(): string {
  return buildEditorKnowledgeDocumentUri(KOSEI_PLAYBOOK_SOURCE_ID);
}
