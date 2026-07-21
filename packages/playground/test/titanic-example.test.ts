import { describe, expect, test } from "bun:test";
import { create as createNativeBackend } from "datamog-backend-native";
import { DatamogExecutor, expandGitHubShorthand } from "datamog-engine";
import { TITANIC_CSV_URL, titanicExample } from "../src/examples/titanic.ts";
import { UrlCsvLoader } from "../src/lib/csv-loader.ts";

const SAMPLE_TITANIC_CSV = `PassengerId,Survived,Pclass,Name,Sex,Age,SibSp,Parch,Ticket,Fare,Cabin,Embarked
1,0,3,"Braund, Mr. Owen Harris",male,22,1,0,A/5 21171,7.25,,S
2,1,1,"Cumings, Mrs. John Bradley (Florence Briggs Thayer)",female,38,1,0,PC 17599,71.2833,C85,C
3,1,3,"Heikkinen, Miss Laina",female,26,0,0,STON/O2. 3101282,7.925,,S
`;

function sortRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

describe("Titanic playground example", () => {
  test("runs against the configured GitHub raw CSV URL", async () => {
    const seenUrls: string[] = [];
    const oldFetch = globalThis.fetch;
    globalThis.fetch = async (input) => {
      seenUrls.push(String(input));
      return new Response(SAMPLE_TITANIC_CSV);
    };

    const backend = await createNativeBackend();
    try {
      const loader = new UrlCsvLoader(new Map(Object.entries(titanicExample.csvUrlData)));
      const executor = new DatamogExecutor(backend, [loader]);
      const results = await executor.execute(titanicExample.source);

      // The example configures the gh: shorthand; the loader must expand it
      // to the raw.githubusercontent.com URL before fetching.
      expect(seenUrls).toEqual([expandGitHubShorthand(TITANIC_CSV_URL)]);
      expect(results).toHaveLength(4);
      expect(sortRows(results[0]!.rows)).toEqual([
        { Sex: "female", avg: 1, count: 2 },
        { Sex: "male", avg: 0, count: 1 },
      ]);
    } finally {
      await backend.close();
      globalThis.fetch = oldFetch;
    }
  });
});
