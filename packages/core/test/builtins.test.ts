import { describe, expect, test } from "bun:test";
import { BUILTINS, BUILTIN_KEYS, resolveCall } from "../src/builtins.ts";

describe("resolveCall", () => {
  test("unknown name returns an unknown-name error", () => {
    const r = resolveCall("nope", []);
    expect(r.error?.kind).toBe("unknown-name");
    expect(r.overload).toBeUndefined();
    expect(r.resultType).toBeUndefined();
  });

  test("arity mismatch reports the accepted arities", () => {
    // `length` has only arity-1 overloads; calling with 0 or 2
    // args is an arity error.
    const r0 = resolveCall("length", []);
    expect(r0.error?.kind).toBe("arity-mismatch");
    if (r0.error?.kind === "arity-mismatch") {
      expect(r0.error.arities).toEqual([1]);
      expect(r0.error.got).toBe(0);
    }
    const r2 = resolveCall("length", ["string", "string"]);
    expect(r2.error?.kind).toBe("arity-mismatch");
    if (r2.error?.kind === "arity-mismatch") {
      expect(r2.error.got).toBe(2);
    }
  });

  test("multi-arity functions report every accepted arity, sorted", () => {
    // `round` has overloads at arity 1 and 2. Calling with 3 args
    // should list both as the accepted set.
    const r = resolveCall("round", ["integer", "integer", "integer"]);
    expect(r.error?.kind).toBe("arity-mismatch");
    if (r.error?.kind === "arity-mismatch") {
      expect(r.error.arities).toEqual([1, 2]);
    }
  });

  test("incompatible argument types yield a no-match error with the candidate set", () => {
    const r = resolveCall("upper", ["integer"]);
    expect(r.error?.kind).toBe("no-match");
    if (r.error?.kind === "no-match") {
      expect(r.error.argTypes).toEqual(["integer"]);
      expect(r.error.overloads).toHaveLength(1);
      expect(r.error.overloads.map((o) => o.params)).toEqual([["string"]]);
    }
  });

  test("primitive arguments embed implicitly into value parameters", () => {
    const r = resolveCall("type_of", ["integer"]);
    expect(r.error).toBeUndefined();
    expect(r.overload?.key).toBe("type_of.value");
    expect(r.resultType).toBe("string");
  });

  test("exact primitive overload wins over primitive-to-value embedding", () => {
    const r = resolveCall("length", ["string"]);
    expect(r.error).toBeUndefined();
    expect(r.overload?.key).toBe("length.string");
    expect(r.resultType).toBe("integer");
  });

  test("integer argument is promoted to a float parameter", () => {
    // `sqrt` has only `(float) → float`. Passing an integer matches via
    // the integer→float promotion. `compatible.length === 1` short-
    // circuits straight to a chosen overload.
    const r = resolveCall("sqrt", ["integer"]);
    expect(r.error).toBeUndefined();
    expect(r.overload?.key).toBe("sqrt.float");
    expect(r.resultType).toBe("float");
  });

  test("exact match wins over a viable promoted match", () => {
    // `abs` has both `(integer) → integer` and `(float) → float`. An
    // integer input is compatible with both (the integer overload
    // exactly, the float overload via promotion); the exact-match
    // preference picks `abs.integer` so the result type stays integer.
    const r = resolveCall("abs", ["integer"]);
    expect(r.overload?.key).toBe("abs.integer");
    expect(r.resultType).toBe("integer");
  });

  test("undefined argument types defer overload selection but expose agreed result", () => {
    // Both `length` overloads return `integer`. Even with an unknown arg
    // type, the result type is unambiguous so the type-inference fixed
    // point can use it. The overload itself stays unresolved until args
    // narrow.
    const r = resolveCall("length", [undefined]);
    expect(r.error).toBeUndefined();
    expect(r.overload).toBeUndefined();
    expect(r.resultType).toBe("integer");
  });

  test("undefined args + disagreeing overload result types → no resultType", () => {
    // `abs` has overloads producing integer / float. With an unknown
    // arg, neither can be chosen and the result types disagree, so the
    // fixed point has nothing to commit to.
    const r = resolveCall("abs", [undefined]);
    expect(r.error).toBeUndefined();
    expect(r.overload).toBeUndefined();
    expect(r.resultType).toBeUndefined();
  });
});

describe("BUILTIN_KEYS", () => {
  test("includes every overload key from the registry", () => {
    // Both backend impl tables (translator SQL_EMIT, native NATIVE_IMPLS)
    // assert at module-load that every key in BUILTIN_KEYS has an entry.
    // Reverse-check here: every key in the set comes from some
    // registered overload, and overloads each have a unique key.
    const fromRegistry = new Set<string>();
    for (const b of BUILTINS.values()) {
      for (const o of b.overloads) {
        expect(fromRegistry.has(o.key)).toBe(false);
        fromRegistry.add(o.key);
      }
    }
    expect(BUILTIN_KEYS).toEqual(fromRegistry);
  });

  test("every key matches the `<name>.<param-types-joined-by-_>` convention", () => {
    for (const [name, builtin] of BUILTINS) {
      for (const o of builtin.overloads) {
        expect(o.key).toBe(`${name}.${o.params.join("_")}`);
      }
    }
  });
});
