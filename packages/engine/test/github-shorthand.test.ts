import { describe, expect, test } from "bun:test";
import { expandGitHubShorthand } from "../src/github-shorthand.ts";

describe("expandGitHubShorthand", () => {
  test("expands github: shorthand to a raw URL, defaulting the ref to HEAD", () => {
    expect(expandGitHubShorthand("github:Purukitto/pokemon-data.json/pokedex.json")).toBe(
      "https://raw.githubusercontent.com/Purukitto/pokemon-data.json/HEAD/pokedex.json",
    );
  });

  test("gh: is an alias for github:", () => {
    expect(expandGitHubShorthand("gh:owner/repo/data.json")).toBe(
      "https://raw.githubusercontent.com/owner/repo/HEAD/data.json",
    );
  });

  test("pins the ref from a #fragment (branch, tag, or commit)", () => {
    expect(expandGitHubShorthand("github:owner/repo/data.json#v1.2.0")).toBe(
      "https://raw.githubusercontent.com/owner/repo/v1.2.0/data.json",
    );
    // Branch names may contain slashes; everything after `#` is the ref.
    expect(expandGitHubShorthand("gh:owner/repo/dir/data.json#feature/x")).toBe(
      "https://raw.githubusercontent.com/owner/repo/feature/x/dir/data.json",
    );
  });

  test("keeps nested file paths intact", () => {
    expect(expandGitHubShorthand("gh:owner/repo/a/b/c.csv")).toBe(
      "https://raw.githubusercontent.com/owner/repo/HEAD/a/b/c.csv",
    );
  });

  test("strips a trailing .git on the repo segment", () => {
    expect(expandGitHubShorthand("gh:owner/repo.git/data.json")).toBe(
      "https://raw.githubusercontent.com/owner/repo/HEAD/data.json",
    );
  });

  test("passes non-shorthand sources through unchanged", () => {
    const url = "https://raw.githubusercontent.com/owner/repo/HEAD/data.json";
    expect(expandGitHubShorthand(url)).toBe(url);
    expect(expandGitHubShorthand("data/pokedex.json")).toBe("data/pokedex.json");
    expect(expandGitHubShorthand("/abs/path.csv")).toBe("/abs/path.csv");
  });

  test("rejects a shorthand with no file path", () => {
    expect(() => expandGitHubShorthand("gh:owner/repo")).toThrow(/OWNER\/REPO\/PATH/);
    expect(() => expandGitHubShorthand("github:owner")).toThrow(/OWNER\/REPO\/PATH/);
  });

  test("rejects an empty ref after #", () => {
    expect(() => expandGitHubShorthand("gh:owner/repo/data.json#")).toThrow(/empty ref/);
  });
});
