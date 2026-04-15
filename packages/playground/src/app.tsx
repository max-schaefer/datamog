import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import type { QueryResult, TranslationResult } from "datamog-engine";
import { Editor } from "./components/editor.tsx";
import { DataPanel } from "./components/data-panel.tsx";
import { ResultsPanel } from "./components/results-panel.tsx";
import { SqlPreview } from "./components/sql-preview.tsx";
import { Toolbar } from "./components/toolbar.tsx";
import { examples } from "./examples/index.ts";
import * as bridge from "./worker/bridge.ts";
import "./styles/playground.css";

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
  const [sqlResult, setSqlResult] = useState<TranslationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showSql, setShowSql] = useState(false);
  const [ready, setReady] = useState(false);
  const sourceRef = useRef(source);
  const csvDataRef = useRef(csvData);

  sourceRef.current = source;
  csvDataRef.current = csvData;

  useEffect(() => {
    bridge.init().then(() => setReady(true));
  }, []);

  const run = useCallback(async () => {
    if (isRunning) return;
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

  const toggleSql = useCallback(async () => {
    const next = !showSql;
    setShowSql(next);
    if (next) {
      setIsRunning(true);
      setError(null);
      setSqlResult(null);
      try {
        const result = await bridge.dryRun(sourceRef.current);
        setSqlResult(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsRunning(false);
      }
    }
  }, [showSql, isRunning]);

  const loadExample = useCallback((index: number) => {
    const ex = examples[index]!;
    setSource(ex.source);
    setCsvData(ex.csvData ?? {});
    setResults(null);
    setSqlResult(null);
    setError(null);
    setShowSql(false);
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
        examples={examples}
        onLoadExample={loadExample}
      />
      <div class="playground-body">
        <div class="editor-side">
          <Editor source={source} onChange={setSource} />
          {extensionals.length > 0 && (
            <DataPanel extensionals={extensionals} csvData={csvData} onChange={setCsvData} />
          )}
        </div>
        <div class="output-side">
          {error && <div class="error-box">{error}</div>}
          {showSql && sqlResult ? (
            <SqlPreview result={sqlResult} />
          ) : !showSql && results ? (
            <ResultsPanel results={results} />
          ) : !error ? (
            <div class="placeholder">
              {ready ? "Press Run or Ctrl+Enter to execute" : "Initializing..."}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
