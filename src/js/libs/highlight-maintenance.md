# highlight.js local maintenance

`highlight.pack.js` is locally maintained from the existing highlight.js 11.12.0
bundle (upstream git identifier `f7f7d3803b`). Its BSD-3-Clause notice remains in
place. This is not a byte-identical upstream distribution. No version bump,
language removal, dependency, suppression, or build exclusion is
part of this maintenance. The recursive JavaScript parameter mode additionally
uses `/\(/` instead of `/(\s*)\(/`; outer parameter-entry modes retain their
whitespace prefixes because removing them changes valid multiline highlighting.
Bash function candidates now start at a word boundary; VB directive candidates
start at a physical line boundary. Inline VB directive-like text after code no
longer receives meta highlighting; valid indented directives remain unchanged.
Microsoft documents this restriction for inline `#If` statements:
https://learn.microsoft.com/dotnet/visual-basic/language-reference/directives/if-then-else-directives

## Finding-to-change map

Ranges below are the **original** scanner ranges at Attegi commit
`7c8c19e96567b98e0a7ac99d896b2f1c8185e332`; offsets are zero-based.
All issue IDs share prefix `AaGqubYQiPLUZgo8aW`.

| ID suffix | Rule | Original range (line:offset) | Local change |
| --- | --- | --- | --- |
| 2E | S905 | 86:0–86:62 | `className` guard becomes `if`; retain scope assignment then deletion. |
| 2F | S905 | 87:0–89:38 | `beginKeywords` outer/default-relevance guards become `if`; retain every assignment/deletion in order. |
| 2G | S905 | 93:1–93:31 | Split `match` assignment and deletion into statements; retain validation. |
| 2H | S905 | 96:29–99:36 | Split `beforeMatch` conversion into statements; delete the copied object's `beforeMatch` only after installing it in `starts.contains`. |
| 2I | S905 | 112:0–113:15 | Retain truthy/object/non-null scope guards; assign `beginScope` then delete scope. |
| 3A | S905 | 1194:31–1194:39 | Remove discarded WASM `e.regex` read. The actual bundled API assigns `regex` as a data property before registering languages; no getter runs. This is not a claim about externally supplied getter-bearing objects. |
| 2J | S8786 | 343:54–343:63 | Remove only the recursive parameter-mode whitespace prefix; JavaScript and TypeScript share this mode. Outer-entry prefixes remain unchanged. |
| 2Q | S2871 | 400:1518–400:1522 | Explicit UTF-16 comparator on 33 media-feature strings. |
| 2R | S2871 | 400:2188–400:2192 | Same on 59 pseudo-class strings. |
| 2S | S2871 | 400:2370–400:2374 | Same on 14 pseudo-element strings. |
| 2T | S2871 | 400:11345–400:11349 | Same on 520 attribute strings. |
| 2U | S2871 | 400:11379–400:11383 | Same on 73 combined pseudo-selector strings. |
| 2X | S8786 | 421:33–421:60 | Prefix the Bash function begin with `\b`; preserve numeric/awkward names and avoid retrying each suffix of a word. |
| 2_ | S8786 | 1191:6–1191:80 | Prefix VB directive begin with `^`; preserve line-start indentation and avoid retrying each indentation suffix. |
| 2j | S8786 | 756:17–756:33 | Reference-link lookahead becomes cached bracket dispatch, preserving permissive labels and relevance. |
| 2k | S8786 | 757:6–757:69 | Known-scheme link variant uses the same reverse index and its original priority/relevance. |
| 2l | S8786 | 759:21–759:32 | Generic-scheme link variant uses the same indexed recognition. |
| 2m | S8786 | 760:20–760:43 | Relative-link variant uses the same indexed recognition. |
| 2n | S8786 | 761:6–761:22 | General/empty-label link variant uses the same indexed recognition. |
| 2P | S8786 | 394:46–394:60 | Shared CSS/Less/SCSS function dispatch uses cached identifier scans with a single-character fallback. |
| 2d | S8786 | 582:6–582:20 | CSS at-rule attribute dispatch uses the case-insensitive `[a-z-]` alphabet and buffered fallback. |
| 2x | S8786 | 1070:28–1070:42 | SCSS at-rule attribute dispatch uses the same bounded candidate recognizer. |
| 2O | S8786 | 375:47–375:56 | Consume failed arrow-parent whitespace runs after existing params alternatives; preserve both outer prefixes, including protected2K. |
| 26 | S8786 | 1165:29–1165:37 | Use cached single-character optional-key candidates instead of repeated suffix lookahead. |
| 2W | S8786 | 419:28–419:43 | Use cached base-number digit candidates and a plain rejected digit-run fallback in Bash arithmetic. |
| 2Y | S8786 | 444:49–444:56 | C include: cached nearest close plus same-position fallback. |
| 2Z | S8786 | 484:68–484:75 | C++ include: same bounded delimiter helper and priority. |
| 2o | S8786 | 801:47–801:54 | Objective-C include: preserve original line-end behavior. |
| 2c | S8786 | 558:4–558:14 | C# function end: consume a whole whitespace run plus optional delimiter; cached rejection retains failed runs. |
| 2r | S8786 | 849:41–849:56 | PHP heredoc: remove failed indentation-prefix retries before delimiter words. |
| 2s | S8786 | 853:31–853:46 | PHP nowdoc: same maximal-word end matching, original delimiter capture preserved. |

Every comparator is `(a,b)=>a<b?-1:a>b?1:0`, not locale-dependent
`localeCompare`. Existing `.reverse()` calls and exact array order are retained.
The actual build copies this vendor file without minifying it, preserving the
statement forms and lazy `highlight.pack.js` filename.

The five Markdown link lookaheads now share a reverse index with O(n)
preprocessing/storage and constant-size per-candidate mask checks. A final
unscoped zero-relevance bracket fallback preserves later valid candidates and
existing definition priority after rejected candidates. The cached input is
refreshed even when a separately decoded string compares equal, avoiding
repeated length-dependent equality work. This adds bounded fallback overhead
and linear memory; it does not certify unrelated Markdown rules.

`highlight-markdown-rdos.test.js` retains feature/priority and deterministic
fuzz comparisons, and adds invalid-then-valid streams across all variants and
four JS line separators, existing Markdown modes, nested calls and fresh equal
buffers. Per-variant work counts and structural arguments are separate from
process safety timeouts; CI has no wall-clock performance ceiling assertion.

CSS-family identifier callbacks scan disjoint runs, cache acceptance, and
refresh their input reference on every callback, including equal fresh buffers.
Single-character skip fallbacks preserve parent keyword buffers and allow number
or Unicode-range modes to cross an identifier boundary without losing later
function suffixes. Less value attributes use the same helper with their existing
whitespace-before-colon rule. `highlight-css-rdos.test.js` checks actual compiled
at-rule paths, case/alphabet boundaries, suffix highlighting, fresh input/cache
refresh counts and disjoint scan work across CSS/Less/SCSS; original-byte integrity
is checked in `beforeAll` before either VM executes. These checks do not certify
unrelated grammar paths or impose a CI wall-clock complexity threshold.

The failed-arrow whitespace consumer runs after the original params alternatives,
preserving their scopes and the protected outer entry prefix. TypeScript optional
keys cache identifier/whitespace validation; Bash arithmetic base numbers cache
digit validation, with ordinary numbers still earlier than the plain digit-run
fallback. Both caches rebind equal fresh inputs and retain the latest candidate-
containing input until replaced. Their bounded scan arguments apply to the
assigned occurrences, not the whole TypeScript grammar, which remains nonlinear
on other paths. `highlight-script-arithmetic-rdos.test.js` checks counterfactual
RED witnesses, exact output/API/aliases, subsequent valid candidates and work.

The C-family subset covers only C/C++/Objective-C includes and the C#
function end. Include indexing preserves JS-dot line boundaries and sibling
priority. The C# end consumes the complete accepted whitespace-plus-delimiter
lexeme, avoiding the rejected early-pop/root-reparse regression; failed runs
remain buffered inside the function. Original raw strings (2b) remain unrepaired;
no shared activation-specific closing pointer is used. An unchanged root
attribute scan can still be nonlinear after a delimiter; this is not original2a
and is not claimed fixed.

PHP heredoc/nowdoc endings drop the optional horizontal-whitespace prefix
and redundant word boundary after a greedy maximal-word capture. Result
HTML/relevance/captures and tested parent/emitter behavior agree;
consumers wrapping internal `on:end` callbacks through `getLanguage` observe
changed raw `match[0]`/`match.index` spans (indentation is now body text). This is
not complete internal callback-event identity. The theme uses `highlightElement`
and does not wrap these callbacks. PHP class-name path2q remains unrepaired.
Both focused packets reconstruct the exact original before executing either VM.

## Regression evidence and repeat commands

`../../../scripts/tests/highlight-vendor-quality.test.js` exercises the actual
bundled API and all 36 registrations. It compares HTML, relevance, illegal status,
and language for language-specific, empty, punctuation, and unfinished snippets
with both illegal-handling settings; additionally covers every fixed CSS list
entry through CSS/Less/SCSS, and targeted mode transforms and validation errors.
Runtime instrumentation captures all five actual sort inputs and outputs.

The small `highlight-vendor-baseline.json` fixture preserves original core
excerpts. Inverse edits reconstruct the pre-maintenance bundle, then SHA-256
`8ab71eb09c51f501e5e25157d9cff100e46cc29bcbfc744d0b746d451fca7f53`
verifies every byte **before execution**. This is the actual pre-patch oracle,
not regenerated upstream code or a simulated response; it works without Git
history in shallow checkouts. Future bundle changes require deliberate fixture
maintenance. No duplicate full vendor source or added parser dependency is needed.

```sh
bun test scripts/tests/highlight-vendor-quality.test.js
bun run compress
HIGHLIGHT_VERIFY_BUILD=1 bun run test:templates
bunx --no-install gscan@6.7.0 -z dist/attegi.zip
```

`highlight-shell-vb-rdos.test.js` compares HTML/relevance/illegal/language on
numeric, hyphenated and multiline Bash names, VB casing/indentation/CRLF,
comments, dates/numbers, aliases and all registrations. Its compiled-mode guards
and inline-directive regression fail against the actual pre-repair factories.
Bounded full-highlight timings exclude initialization/compilation, assert equal
output/relevance for the genuine witnesses, and impose no CI timing threshold.

The source-form and explicit-comparator diagnostics fail on the original bundle;
behavioral comparisons already pass there, as expected for style-only repairs.
Build verification is explicitly skipped unless `HIGHLIGHT_VERIFY_BUILD=1`.
GScan compatibility is not Sonar analysis. These tests are bounded regression
coverage, not exhaustive input/browser proof or regex safety evidence. The
recursive JS parameter, Bash function, VB directive, five Markdown link,
three shared CSS-family, arrow whitespace, optional-key, arithmetic-number,
three include, C# function-end and two PHP string-end occurrences are repaired
locally; other original S8786 findings still require triage/fixes and a fresh
Sonar analysis is required to establish actual issue status. The exact prepatch
oracle is retained through original-factory excerpts and inverse grammar,
statement and sort edits, without changing the pinned checksum.
