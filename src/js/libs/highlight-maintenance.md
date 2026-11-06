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

Every comparator is `(a,b)=>a<b?-1:a>b?1:0`, not locale-dependent
`localeCompare`. Existing `.reverse()` calls and exact array order are retained.
The actual build copies this vendor file without minifying it, preserving the
statement forms and lazy `highlight.pack.js` filename.

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
recursive JS parameter, Bash function and VB directive occurrences are repaired
locally; other original S8786 findings still require triage/fixes and a fresh
Sonar analysis is required to establish actual issue status. The exact prepatch
oracle is retained through original-factory excerpts and inverse grammar,
statement and sort edits, without changing the pinned checksum.
