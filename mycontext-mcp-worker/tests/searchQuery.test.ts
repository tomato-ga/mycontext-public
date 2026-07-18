import { describe, expect, it } from "vitest";
import {
  buildSearchQueryPlan,
  expandSynonyms,
  extractSearchTerms,
  normalizeSearchText
} from "../src/searchQuery.js";

describe("natural-language search planning", () => {
  it("normalizes full-width characters and whitespace", () => {
    expect(normalizeSearchText("  ＡＩ   エージェント  ")).toBe("AI エージェント");
  });

  it("extracts bounded important terms from a long Japanese question", () => {
    const query =
      "個人開発・AIエージェント活用・収益化目標に関する背景と強み";
    const terms = extractSearchTerms(query);
    expect(terms.length).toBeLessThanOrEqual(8);
    expect(terms).toEqual(expect.arrayContaining([
      "個人開発",
      "AIエージェント",
      "収益化",
      "背景",
      "強み"
    ]));
  });

  it("builds a separate synonym fallback without sending the query to an LLM", () => {
    expect(expandSynonyms(["収益化"])).toEqual([
      "事業化",
      "マネタイズ",
      "収益"
    ]);
    expect(buildSearchQueryPlan("個人開発について")).toEqual({
      phrase: "個人開発について",
      terms: ["個人開発"],
      synonymTerms: ["個人プロダクト", "一人開発"]
    });
  });

  it("drops generic request language", () => {
    expect(extractSearchTerms("教えて AIエージェントについて")).toEqual([
      "AIエージェント"
    ]);
  });

  it("uses locale-aware segmentation for Japanese clauses", () => {
    expect(extractSearchTerms("編集者に必要なスキルにはどんなものがある？"))
      .toEqual(expect.arrayContaining(["編集", "スキル"]));
    expect(extractSearchTerms("編集とは何を考える仕事なのか、編集の基本姿勢を知りたい"))
      .toEqual(expect.arrayContaining(["編集", "考え", "基本姿勢"]));
    expect(extractSearchTerms("Webメディアの基礎知識を新人編集者向けに教えて"))
      .toEqual(expect.arrayContaining(["Webメディア", "ウェブメディア"]));
  });
});
