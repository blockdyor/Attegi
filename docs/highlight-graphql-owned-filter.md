# Private GraphQL symbol selection

This trial is based directly on public `b1bf7cb` and changes only GraphQL among
36 registration entries. Common COMMENT is byte-identical to that base; its
2B/2C work remains held. The accepted metadata-position copy is unchanged.

The public symbol keeps its original full lookahead begin, scope and relevance.
No synthetic end, returnBegin or callback is exposed, before or after compilation.
A WeakMap carries identity through `inherit`. Validation after compiler extensions
requires the original complete own DATA-property shape (descriptor values, without
trusting accessor reads) and a standard/null prototype; roots, accessor-customized
modes and derived compiled objects use their ordinary actual grammar. Frozen DATA
properties remain eligible.

Instead of lowering a mode into a private compilation copy, this smaller variant
copies only its selector into the private combined matcher. A trusted child uses
`[_A-Za-z]` there. Before the parser captures `e[0]`, the selector materializes the
original full identifier span. The ordinary mode, default empty end and parser
callback paths remain untouched. There is no arbitrary callback reconstruction.

A reverse pass records maximal identifier ends and next non-whitespace positions.
Native one-character regexes use the actual selecting combined native matcher's
flags, not the child's first-parent flags, an early language snapshot or manually
listed Unicode folds. Stateful `g`/`y` are removed for classification. Initial,
resumed/fallback and local-continuation selections carry that native authority;
Unicode advancement uses it too. Cache keys include input and flags; the current input is
rebound even on an equal-value hit. Span materialization finishes before callbacks
or emission, so reentry cannot replace pending span/end state.

The first selection is legacy. Only a genuinely false private symbol candidate
starts local continuation: inspect remaining alternatives at that UTF-16 position,
then advance one code point under `u` (one code unit otherwise) and restart all
alternatives. The pair (cursor, alternative offset) progresses; default symbol
success consumes its full nonempty identifier. Index construction is O(input
length), membership/span lookup is constant time, and disjoint failed suffix
searches advance rather than restarting the greedy name lookahead.

Fresh evidence is outside Git in `graphql-owned-filter-evidence`: 192 real Node/V8
interpreter traces cover four name families, n=16/32/64, both illegal policies and
m/mi stock grammars plus valid u/iu symbol wrappers, counting classifier execs too.
Full stock GraphQL has a pre-existing invalid punctuation escape under `u`; no new
Unicode grammar support or whole-grammar linearity is claimed. Two typed arrays
retain O(n) latest-input data. Arbitrary-depth reentry, huge allocations and browser
engines remain unverified. This private candidate requires independent review;
it changes no finding counts, Sonar status or release state.
