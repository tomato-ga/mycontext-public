import { describe, expect, it } from "vitest";
import { resolveReadContextId } from "../src/tools/readContext.js";

describe("resolveReadContextId", () => {
  it("accepts namespaced document IDs", () => {
    expect(resolveReadContextId("notion:page-1")).toEqual({
      kind: "document",
      id: "notion:page-1"
    });
    expect(resolveReadContextId("editor-knowledge:lesson-04")).toEqual({
      kind: "document",
      id: "editor-knowledge:lesson-04"
    });
  });

  it("resolves a business knowledge section", () => {
    expect(resolveReadContextId(
      "business-knowledge:startup-science#detail-18"
    )).toEqual({
      kind: "section",
      id: "business-knowledge:startup-science#detail-18",
      documentId: "startup-science",
      sectionId: "detail-18"
    });
  });

  it("rejects legacy, guessed, and malformed IDs", () => {
    expect(resolveReadContextId("page-1")).toBeNull();
    expect(resolveReadContextId("business-knowledge:bad#not/a-section")).toBeNull();
    expect(resolveReadContextId("notion:page-1#section")).toBeNull();
  });
});
