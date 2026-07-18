import { describe, expect, it } from "vitest";
import { buildSearchToolResult } from "../src/tools/searchResult.js";

describe("buildSearchToolResult", () => {
  it("returns compact results with stable IDs and no duplicated resources", () => {
    const longNotionText = `before-${"x".repeat(2_000)}-needle-after`;
    const deliveryMarkdown = "## Parent section\n\nThe complete semantic section.";
    const result = buildSearchToolResult([
      {
        document_id: "notion:page-1",
        source: "notion",
        title: "Profile",
        text: longNotionText,
        match_position: longNotionText.indexOf("needle") + 1,
        matched_terms: ["needle"],
        score: 100,
        search_stage: "phrase"
      },
      {
        document_id: "business-knowledge:startup-science",
        source: "business_knowledge",
        title: "起業の科学",
        text: deliveryMarkdown,
        match_position: 1,
        matched_terms: ["semantic"],
        score: 7,
        search_stage: "keywords",
        matched_span_position: 4,
        matched_section_id: "detail-18-interview",
        matched_section_title: "Interview",
        matched_content_layer: "detail",
        delivery_section_id: "detail-18",
        delivery_section_title: "Parent section",
        delivery_content_layer: "detail",
        heading_path: ["起業の科学", "Parent section", "Interview"],
        source_line_start: 10,
        source_line_end: 12,
        delivery_line_start: 8,
        delivery_line_end: 20,
        related_source_path: null,
        freshness_class: "static_framework",
        source_kind: "book_summary",
        ingest_scope: "full_summary",
        source_declared_at: null,
        detail_available: null,
        resource_uri: "mycontext://business-knowledge/startup-science/sections/detail-18"
      }
    ]);

    const structured = result.structuredContent as {
      results: Array<{ id: string; snippet: string; matchedTerms: string[] }>
    };
    expect(structured.results[0].snippet.length).toBeLessThan(longNotionText.length);
    expect(structured.results[0].snippet).toContain("needle");
    expect(structured.results[0].id).toBe("notion:page-1");
    expect(structured.results[1]).toMatchObject({
      id: "business-knowledge:startup-science#detail-18",
      matchedTerms: ["semantic"]
    });
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(JSON.stringify(result)).not.toContain("\"type\":\"resource\"");
  });
});
