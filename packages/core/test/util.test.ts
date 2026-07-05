import { describe, expect, test } from "bun:test";
import { assertNever } from "datamog-core";

describe("assertNever", () => {
  test("throws and includes the discriminator $type when present", () => {
    const stray = { $type: "FutureVariant" } as unknown as never;
    expect(() => assertNever(stray, "term type")).toThrow(/Unexpected term type 'FutureVariant'/);
  });

  test("falls back to a bare context message when $type is absent", () => {
    expect(() => assertNever("rogue" as unknown as never, "body element")).toThrow(
      /Unexpected body element$/,
    );
  });

  test("default context is 'variant'", () => {
    expect(() => assertNever(null as unknown as never)).toThrow(/Unexpected variant/);
  });
});
