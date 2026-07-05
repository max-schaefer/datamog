# Glossary 詞彙表

Technical terms used in the FLOLAC 2026 Datalog course, with Traditional
Chinese (Taiwan) translations and a note on which language each is normally
spoken in. Terminology in Taiwan leans heavily on English; the **Usually said**
column records, following the lecturer's guidance, whether a term is normally
said in **English**, in **中文**, or **either** way. Terms marked 中文 or either
are glossed on first occurrence in the slides; the English-preferred ones are
kept here for reference.

This file lives in the slides project root, **outside** `src/content/slides`,
so it is a reference document and not itself a slide.

## Introduction 導論

| English | 中文 | Usually said |
| --- | --- | --- |
| Datalog | Datalog | English |
| logic programming | 邏輯程式設計 | either |
| declarative (programming) | 宣告式（程式設計） | either |
| first-order logic | 一階邏輯 | either |
| relation | 關聯 | English |
| query | 查詢 | English |
| Turing complete | 圖靈完備 | either |

## Part 1: Datalog Basics 基礎

| English | 中文 | Usually said |
| --- | --- | --- |
| predicate | 謂詞 / 述詞 | English |
| extensional predicate | 外延謂詞 | English |
| intensional predicate | 內涵謂詞 | English |
| tuple | 元組 | English |
| fact | 事實 | 中文 |
| rule | 規則 | 中文 |
| head (of a rule) | 句首 | English |
| body (of a rule) | （規則）主體 | either |
| variable | 變數 | either |
| atom | 原子 | either |
| don't-care variable (`_`) | 不關心變數 | English |
| conjunction | 合取（口語「且」） | English |
| disjunction | 析取 | English |
| negation | 否定 | either |
| safety (of a rule) | 安全性 | 中文 |
| propositional logic | 命題邏輯 | either |
| propositional variable | 命題變數 | either |
| connective | 連接詞 | either |
| (truth) assignment | （真值）賦值 | English |
| satisfying assignment | 滿足的賦值 | English |
| model | 模型 | either |
| counterexample | 反例 | 中文 |
| satisfiable | 可滿足 | English |
| satisfiability | 可滿足性 | English |
| valid | 有效 | either |
| tautology | 恆真式 / 恆真 | English |
| normal form | 範式 | English |
| conjunctive normal form (CNF) | 合取範式 | English |
| disjunctive normal form (DNF) | 析取範式 | English |
| clause | 子句 | either |
| literal | 文字 | English |
| polarity | 極性 | either |

## Part 2: Recursion 遞迴

| English | 中文 | Usually said |
| --- | --- | --- |
| recursion / recursive | 遞迴 | either |
| base case | 基本情形 | English |
| recursive step | 遞迴步驟 | either |
| reachability | 可達性 | either |
| transitive closure | 遞移閉包 | English |
| cycle (in a graph) | 環 | either |
| mutual recursion | 相互遞迴 | English |
| naive evaluation | 樸素求值 | English |
| iteration | 迭代 | 中文 |
| dependency graph | 相依圖 | either |
| strongly connected component (SCC) | 強連通元件 | either |
| fixed point | 不動點 | either |
| least fixed point | 最小不動點 | either |
| monotone / monotonicity | 單調／單調性 | either |
| stratum (pl. strata) | 階層 | 中文 |
| stratification / stratified | 分層 | 中文 |

## Part 3: Aggregates 聚合

| English | 中文 | Usually said |
| --- | --- | --- |
| aggregate / aggregation | 聚合 | either |
| grouping (group by) | 分組 | 中文 |
| set semantics | 集合語意 | 中文 |
| statistics | 統計 | either |

## Part 4: Advanced Topics 進階主題

| English | 中文 | Usually said |
| --- | --- | --- |
| termination | 終止 | either |
| decidable | 可判定 | either |
| decidability | 可判定性 | either |
| undecidable | 不可判定 | either |
| complexity | 複雜度 | either |
| data complexity | 資料複雜度 | either |
| combined complexity | 組合複雜度 | English |
| containment / inclusion | 包含 | 中文 |
| equivalence | 等價 | either |
| emptiness | 是否為空 | 中文 |
| grammar | 文法 | either |
| context-free grammar | 上下文無關文法 | English |
| context-free language | 上下文無關語言 | English |
| nonterminal | 非終端符號 | English |
| production (grammar) | 產生式 | English |
| halting problem | 停機問題 | either |
| monadic (predicate) | 一元（謂詞） | 中文 |
| union of conjunctive queries | 合取查詢聯集 | English |
| linear recursion | 線性遞迴 | either |
| non-linear recursion | 非線性遞迴 | either |
| value type | 值型別 | either |
| JSON | JSON | English |
| semi-structured data | 半結構化資料 | 中文 |

## How to read "Usually said"

Translating technical terms in Taiwan is genuinely tricky, and most are simply
said in English. As a rough rule, **中文 is safe when a term comes from school
mathematics or science** (basic set theory, 單調, 不動點) **or when its technical
meaning is close to everyday usage** (規則, 分組, 事實). Otherwise English is the
safer default, since which word belongs in which language is hard to remember.
Verbs are worth translating where a natural Chinese verb exists. Dropping an
English term into a Chinese sentence works a little like Japanese katakana for
loanwords: it signals that the word is being used technically rather than
conversationally.

A few specifics from the lecturer:

- **fact / aggregate**: the Chinese (事實 / 聚合) sounds everyday, so define it as the technical term before relying on it.
- **head**: 頭部 is too literal; 句首 is closer if a Chinese word is wanted.
- **emptiness**: prefer 是否為空; 空性 reads as a Buddhist term.
- **monadic**: say 一元, since "monadic" collides with "monad".
- **naive**: 樸素 is the standard rendering but takes getting used to.
- Translations follow Taiwan usage (遞迴 not 递归, 變數 not 变量, 圖靈 not 图灵, 元件 not 分量); younger students may also recognise the PRC translations.
