# Typography Library Comparison

Benchmark of punctilio vs smartypants on 71 test cases.

## Results

| Package | Pass Rate |
|---------|-----------|
| punctilio | 71/71 (100%) |
| smartypants | 30/71 (42%) |

## Feature Comparison

| Situation | punctilio | smartypants |
|-----------|-----------|-------------|
| **Quotes** | | |
| Basic double quotes | ✓ | ✓ |
| Multiple quotes in sequence | ✓ | ✗ wrong direction |
| Nested quotes | ✓ | ✗ `"'sup"` → `"'sup"` not `"'sup"` |
| Contractions | ✓ | ✓ |
| Leading apostrophe (`'SUP`, `'99`) | ✓ | ✗ opens instead of closes |
| Rock 'n' Roll | ✓ | ✗ wrong quote direction |
| **Dashes** | | |
| Spaced hyphen → em dash | ✓ | ✗ no change |
| Double hyphen (`--`) | ✓ | ✓ |
| Triple hyphen (`---`) | ✓ | ✗ leaves trailing hyphen |
| Space removal around em dash | ✓ | ✗ keeps spaces |
| Preserve horizontal rules | ✓ | ✗ converts `---` to `—-` |
| Number ranges → en dash | ✓ | ✗ no change |
| Date ranges → en dash | ✓ | ✗ no change |
| Negative numbers → minus sign | ✓ | ✗ no change |
| Preserve compound words | ✓ | ✓ |
| **Symbols** | | |
| Ellipsis (`...` → `…`) | ✓ | ✓ |
| Preserve abbreviations (e.g.) | ✓ | ✓ |
| Multiplication (`5x5` → `5×5`) | ✓ | ✗ not supported |
| Math (`!=` `<=` `>=` `+-`) | ✓ | ✗ not supported |
| Legal (`(c)` `(r)` `(tm)`) | ✓ | ✗ not supported |
| Arrows (`->` `<-` `<->`) | ✓ | ✗ not supported |
| Prime marks (feet/inches) | ✓ | ✗ uses curly quotes |
| Degrees (`20 C` → `20 °C`) | ✓ | ✗ not supported |
| Fractions (`1/2` → `½`) | ✓ | ✗ not supported |

## Error Clusters

### 1. Apostrophe Ambiguity
Smartypants treats leading `'` as opening quote, not apostrophe:
- `'SUP` → `'SUP` (should be `'SUP`)
- `'99` → `'99` (should be `'99`)

### 2. Em Dash Handling
Smartypants doesn't normalize spacing or handle edge cases:
- `word — word` unchanged (should remove spaces)
- `---` → `—-` (should be single `—` or preserved as horizontal rule)

### 3. Missing Typographic Features
Smartypants only handles quotes, dashes, and ellipses. No support for:
- Multiplication signs
- Mathematical operators
- Legal symbols
- Arrows
- Prime marks
- Temperature degrees
- Unicode fractions
