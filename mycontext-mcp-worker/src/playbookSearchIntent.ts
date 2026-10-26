import {
  EDITING_PLAYBOOK_DOCUMENT_ID,
  EDITING_PLAYBOOK_SOURCE_ID,
  EDITING_PLAYBOOK_V2_DOCUMENT_ID,
  EDITING_PLAYBOOK_V2_SOURCE_ID,
  buildEditingPlaybookResourceUri
} from "./editingPlaybook.js";
import {
  KOSEI_PLAYBOOK_DOCUMENT_ID,
  KOSEI_PLAYBOOK_SOURCE_ID,
  buildKoseiPlaybookResourceUri
} from "./koseiPlaybook.js";
import {
  MEDIA_PLAYBOOK_DOCUMENT_ID,
  MEDIA_PLAYBOOK_SOURCE_ID,
  buildMediaPlaybookResourceUri
} from "./mediaPlaybook.js";
import { normalizeSearchText } from "./searchQuery.js";

export interface PlaybookSearchIntent {
  documentId: string;
  sourceId: string;
  canonicalTitle: string;
  resourceUri: string;
}

const PLAYBOOK_INTENTS: readonly (PlaybookSearchIntent & {
  compactAliases: readonly string[];
})[] = [
  {
    documentId: MEDIA_PLAYBOOK_DOCUMENT_ID,
    sourceId: MEDIA_PLAYBOOK_SOURCE_ID,
    canonicalTitle: "メディア運営プレイブック",
    resourceUri: buildMediaPlaybookResourceUri(),
    compactAliases: [
      "メディア運営プレイブック",
      "メディアプレイブック",
      "mediaplaybook",
      "mediadesignplaybook"
    ]
  },
  {
    documentId: KOSEI_PLAYBOOK_DOCUMENT_ID,
    sourceId: KOSEI_PLAYBOOK_SOURCE_ID,
    canonicalTitle: "校正プレイブック",
    resourceUri: buildKoseiPlaybookResourceUri(),
    compactAliases: [
      "校正プレイブック",
      "koseiplaybook",
      "proofreadingplaybook"
    ]
  },
  {
    // The bare name resolves to v2: the 2026-07-26 page was archived in Notion on
    // 2026-10-23, so v1 is reachable only by its explicit version or Document ID.
    documentId: EDITING_PLAYBOOK_V2_DOCUMENT_ID,
    sourceId: EDITING_PLAYBOOK_V2_SOURCE_ID,
    canonicalTitle: "MyContext Documents 編集プレイブック v2",
    resourceUri: buildEditingPlaybookResourceUri("v2"),
    compactAliases: [
      "mycontextdocuments編集プレイブックv2",
      "mycontextdocuments編集プレイブック",
      "編集プレイブックv2",
      "編集プレイブック",
      "editingplaybookv2",
      "editingplaybook",
      "editingplaybookv2"
    ]
  },
  {
    documentId: EDITING_PLAYBOOK_DOCUMENT_ID,
    sourceId: EDITING_PLAYBOOK_SOURCE_ID,
    canonicalTitle: "MyContext Documents 編集プレイブック（2026-07-26版）",
    resourceUri: buildEditingPlaybookResourceUri("v1"),
    compactAliases: [
      "編集プレイブックv1",
      "編集プレイブック2026-07-26版",
      "editingplaybookv1",
      "editingplaybookv1"
    ]
  }
];

// Longest alias first, so "編集プレイブックv2" is consumed before the bare "編集プレイブック"
// alias of v1 can match the same characters.
const ALIAS_CANDIDATES = PLAYBOOK_INTENTS
  .flatMap((intent) => intent.compactAliases.map((alias) => ({ intent, alias })))
  .sort((left, right) => right.alias.length - left.alias.length);

/**
 * Resolves explicit playbook names before generic keyword ranking.
 *
 * ChatGPT conversations can retain an older tools/list response, so a newly added dedicated
 * playbook tool is not guaranteed to be available in an existing conversation. Keeping this
 * routing inside the long-lived search_personal_context tool makes those conversations resolve
 * the same canonical, whole-document record without relying on a refreshed tool catalogue.
 */
export function resolvePlaybookSearchIntent(query: string): PlaybookSearchIntent | null {
  const matched = new Set<(typeof PLAYBOOK_INTENTS)[number]>();
  let explicitResidual = normalizeSearchText(query).toLocaleLowerCase("ja");
  // Preserve explicit document IDs before compacting natural-language aliases:
  // editing-playbook is the v1 ID, while the bare display name defaults to v2.
  for (const intent of PLAYBOOK_INTENTS) {
    const pattern = new RegExp(`(?<![a-z0-9-])${intent.sourceId}(?![a-z0-9-])`, "gu");
    if (pattern.test(explicitResidual)) {
      matched.add(intent);
      explicitResidual = explicitResidual.replace(pattern, "");
    }
  }
  // Remove each matched alias so overlapping names do not count twice.
  let residual = explicitResidual.replace(/[\s　_-]+/gu, "");
  for (const { intent, alias } of ALIAS_CANDIDATES) {
    if (residual.includes(alias)) {
      matched.add(intent);
      residual = residual.split(alias).join("");
    }
  }
  if (matched.size !== 1) {
    return null;
  }
  const { compactAliases: _compactAliases, ...intent } = [...matched][0];
  return intent;
}
