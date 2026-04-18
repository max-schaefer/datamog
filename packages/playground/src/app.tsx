import type { QueryResult } from "datamog-engine";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { DataPanel } from "./components/data-panel.tsx";
import { Editor } from "./components/editor.tsx";
import { ResultsPanel } from "./components/results-panel.tsx";
import { SqlPreview } from "./components/sql-preview.tsx";
import { Toolbar } from "./components/toolbar.tsx";
import { examples } from "./examples/index.ts";
import * as bridge from "./worker/bridge.ts";
import type { BackendName, DryRunResult, SourceSpan } from "./worker/bridge.ts";
import "./styles/playground.css";

// Only the sqlite dialect actually executes in the browser (via sql.js).
// Other backends are available for viewing the generated SQL.
const RUNNABLE_BACKENDS: ReadonlySet<BackendName> = new Set(["sqlite"]);

interface ExtDecl {
  predicate: string;
  columns: string;
}

const EXT_RE = /^\s*extensional\s+(\w+)\s*\(([^)]+)\)/gm;

function extractExtensionals(source: string): ExtDecl[] {
  const decls: ExtDecl[] = [];
  let match: RegExpExecArray | null;
  EXT_RE.lastIndex = 0;
  while ((match = EXT_RE.exec(source)) !== null) {
    decls.push({ predicate: match[1]!, columns: match[2]! });
  }
  return decls;
}

export function App() {
  const [source, setSource] = useState(examples[0]!.source);
  const [csvData, setCsvData] = useState<Record<string, string>>(examples[0]!.csvData ?? {});
  const [results, setResults] = useState<QueryResult[] | null>(null);
  const [sqlResult, setSqlResult] = useState<DryRunResult | null>(null);
  const [hoveredRange, setHoveredRange] = useState<SourceSpan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showSql, setShowSql] = useState(false);
  const [ready, setReady] = useState(false);
  const [backend, setBackend] = useState<BackendName>("sqlite");
  const sourceRef = useRef(source);
  const csvDataRef = useRef(csvData);
  const backendRef = useRef(backend);

  sourceRef.current = source;
  csvDataRef.current = csvData;
  backendRef.current = backend;

  const canRun = RUNNABLE_BACKENDS.has(backend);

  useEffect(() => {
    const minDisplay = new Promise<void>((r) => setTimeout(r, 2000));
    Promise.allSettled([bridge.init(), minDisplay]).then(() => setReady(true));
  }, []);

  const run = useCallback(async () => {
    if (isRunning) return;
    if (!RUNNABLE_BACKENDS.has(backendRef.current)) return;
    setIsRunning(true);
    setShowSql(false);
    setError(null);
    setResults(null);
    try {
      const queryResults = await bridge.execute(sourceRef.current, csvDataRef.current);
      setResults(queryResults);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  }, [isRunning]);

  const showSqlFor = useCallback(async () => {
    setShowSql(true);
    setIsRunning(true);
    setError(null);
    setSqlResult(null);
    try {
      const result = await bridge.dryRun(sourceRef.current, backendRef.current);
      setSqlResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  }, []);

  const toggleSql = useCallback(async () => {
    setHoveredRange(null);
    if (showSql) {
      setShowSql(false);
      return;
    }
    await showSqlFor();
  }, [showSql, showSqlFor]);

  const handleBackendChange = useCallback(
    (next: BackendName) => {
      setBackend(next);
      backendRef.current = next;
      setHoveredRange(null);
      if (showSql) {
        // Re-translate with the new dialect.
        showSqlFor();
      }
      if (!RUNNABLE_BACKENDS.has(next)) {
        // Results from the previous run were produced by sql.js and are not
        // meaningful for another backend; clear them.
        setResults(null);
      }
    },
    [showSql, showSqlFor],
  );

  const loadExample = useCallback((index: number) => {
    const ex = examples[index]!;
    setSource(ex.source);
    setCsvData(ex.csvData ?? {});
    setResults(null);
    setSqlResult(null);
    setError(null);
    setShowSql(false);
    setHoveredRange(null);
  }, []);

  const extensionals = extractExtensionals(source);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        run();
      }
    },
    [run],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div class="playground">
      <Toolbar
        onRun={run}
        onToggleSql={toggleSql}
        showSql={showSql}
        isRunning={isRunning}
        ready={ready}
        canRun={canRun}
        backend={backend}
        onBackendChange={handleBackendChange}
        examples={examples}
        onLoadExample={loadExample}
      />
      <div class="playground-body">
        <div class="editor-side">
          <Editor
            source={source}
            onChange={setSource}
            elements={sqlResult?.elements ?? null}
            hoveredRange={hoveredRange}
            onHoverRange={setHoveredRange}
          />
          {extensionals.length > 0 && (
            <DataPanel extensionals={extensionals} csvData={csvData} onChange={setCsvData} />
          )}
        </div>
        <div class="output-side">
          {error && <div class="error-box">{error}</div>}
          {showSql && sqlResult ? (
            <SqlPreview
              result={sqlResult.result}
              hoveredRange={hoveredRange}
              onHoverRange={setHoveredRange}
            />
          ) : !showSql && results ? (
            <ResultsPanel results={results} />
          ) : !error ? (
            <div class="placeholder">
              {ready ? (
                "Press Run or Ctrl+Enter to execute"
              ) : (
                <div class="mascot-drive">
                  <img
                    src={`${import.meta.env.BASE_URL}datamog.jpg`}
                    alt="Datamog loading"
                    class="mascot-img"
                  />
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
