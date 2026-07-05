import { describe, expect, test } from "bun:test";
import { lazyAsync } from "../src/lib/lazy.ts";

describe("lazyAsync", () => {
  test("calls the loader at most once on consecutive successes", async () => {
    let calls = 0;
    const get = lazyAsync(async () => {
      calls += 1;
      return calls;
    });
    expect(await get()).toBe(1);
    expect(await get()).toBe(1);
    expect(await get()).toBe(1);
    expect(calls).toBe(1);
  });

  test("Regression: after a rejection, the next call re-runs the loader", async () => {
    // Without the recovery guard, a transient failure (a network
    // hiccup loading the mermaid bundle, say) would leave the
    // singleton permanently stuck against the same rejected promise
    // — every subsequent attempt resolves to the same error and the
    // user can't recover without reloading the page. This test
    // pins the recovered behaviour: the second call sees a fresh
    // loader invocation.
    let calls = 0;
    const get = lazyAsync(async () => {
      calls += 1;
      if (calls === 1) throw new Error("transient");
      return "ok";
    });

    await expect(get()).rejects.toThrow("transient");
    expect(await get()).toBe("ok");
    expect(calls).toBe(2);
  });

  test("two parallel calls during the in-flight loader share the same promise", async () => {
    // While a load is in flight, parallel callers must observe the
    // same promise — otherwise we'd kick off N loads for N callers
    // that started before the first one resolved.
    let calls = 0;
    let release!: () => void;
    const blocker = new Promise<void>((r) => {
      release = r;
    });
    const get = lazyAsync(async () => {
      calls += 1;
      await blocker;
      return calls;
    });

    const a = get();
    const b = get();
    release();
    expect(await a).toBe(1);
    expect(await b).toBe(1);
    expect(calls).toBe(1);
  });
});
