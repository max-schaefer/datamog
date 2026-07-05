import { describe, expect, test } from "bun:test";
import { bigintSafeReplacer, formatCellAsString } from "../src/output.ts";

describe("bigintSafeReplacer", () => {
  test("safe-range BigInt round-trips through JSON.stringify as a number", () => {
    // Regression: some backends — Postgres via Bun.sql preserves
    // BIGINT columns as JS `BigInt` to avoid silent precision loss
    // for values outside the ±2^53 safe-integer window. With
    // `--output-format jsonl` the CLI used to call
    // `JSON.stringify(row)` directly and crash with
    // `JSON.stringify cannot serialize BigInt`. Converting safe-range
    // values to Number lets the result round-trip with no loss of
    // precision, so a program that surfaces a small BigInt now emits
    // valid JSONL instead of aborting.
    const row = { N: 5n };
    const json = JSON.stringify(row, bigintSafeReplacer);
    expect(json).toBe('{"N":5}');
  });

  test("out-of-safe-range BigInt becomes a string instead of throwing", () => {
    // Regression: same crash path, but for a value that *can't* be
    // represented as a Number without precision loss. We fall back to
    // a string so the CLI doesn't crash; the user sees the exact
    // value, just wrapped in quotes.
    const row = { N: 9007199254740993n }; // 2^53 + 1, unrepresentable
    const json = JSON.stringify(row, bigintSafeReplacer);
    expect(json).toBe('{"N":"9007199254740993"}');
  });

  test("non-BigInt values pass through unchanged", () => {
    const row = { a: 1, b: "x", c: true, d: null };
    expect(JSON.stringify(row, bigintSafeReplacer)).toBe('{"a":1,"b":"x","c":true,"d":null}');
  });

  test("works for nested objects (Object.values pass through stringify too)", () => {
    // The `--output-format jsonl-flat` path stringifies an array of
    // values, not an object — make sure the replacer fires through
    // that container shape too.
    const values = [5n, "x", 9007199254740993n];
    expect(JSON.stringify(values, bigintSafeReplacer)).toBe('[5,"x","9007199254740993"]');
  });
});

describe("formatCellAsString", () => {
  test("Regression: value columns render as JSON text in CSV output, not '[object Object]'", () => {
    // The `--output-format csv` path used `String(row[k] ?? "")`,
    // which on a value column whose value is a parsed JS object
    // produced the literal string `"[object Object]"` — useless and
    // unparseable. Stringify objects/arrays as canonical JSON so the
    // CSV cell carries the actual value the user can round-trip.
    expect(formatCellAsString({ port: 8080 })).toBe('{"port":8080}');
    expect(formatCellAsString([1, 2, 3])).toBe("[1,2,3]");
  });

  test("primitives pass through unchanged", () => {
    expect(formatCellAsString("hello")).toBe("hello");
    expect(formatCellAsString(42)).toBe("42");
    expect(formatCellAsString(true)).toBe("true");
    expect(formatCellAsString(null)).toBe("");
    expect(formatCellAsString(undefined)).toBe("");
  });

  test("BigInt cells survive via the shared replacer", () => {
    expect(formatCellAsString({ n: 9007199254740993n })).toBe('{"n":"9007199254740993"}');
  });
});
