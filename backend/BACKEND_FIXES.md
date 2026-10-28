# AinBodh backend fixes — 26 Oct 2026

The frontend is exactly as supplied (no changes). Only the backend changed.

## Install

Copy these into `D:\AinBodh\backend\` (same paths):

- `src/server.ts` (modified)
- `src/bdlaws.ts` (new)
- `src/bdlaws.test.ts` (new, tests)
- `src/buildBdlawsIndex.ts` (new, optional)
- `.gitignore` (adds `cache/`)

No new npm packages. Uses Node's built-in `fetch` (Node 18+). Start as before: `npm run dev`.

## What was fixed

1. **References now open the exact law on bdlaws.minlaw.gov.bd.**
   Previously `getOfficialSource()` returned a link only for two hard-coded
   sections of one act (Premises Rent Control Act s.13 and s.19). Every
   other citation had no link.
   Now (`src/bdlaws.ts`):
   - corpus `act_file` "11.json" is the bdlaws act ID → `https://bdlaws.minlaw.gov.bd/act-11.html`;
   - bdlaws section pages use site-wide IDs (Penal Code s.4 = `section-19904`), so the
     backend reads the act's contents page once, maps section number → section page,
     and links e.g. `https://bdlaws.minlaw.gov.bd/act-11/section-19904.html`;
   - if a section can't be matched (site unreachable, unusual numbering) the link is the
     act page — never a guessed section URL. Each citation includes
     `sourceKind: "section" | "act"` so you can tell which;
   - act indexes are cached in memory and in `backend/cache/bdlaws-sections.json`.
     The first question about a new act takes up to ~6 s extra (timeout
     `BDLAWS_TIMEOUT_MS`); after that it's instant.

2. **Citations reached the UI with empty text.** The response read `content`, but
   evidence stores the provision in `text`. Now `content` (and `text`) carry the provision.

3. **Document upload never worked.** `/api/legal/extract` was registered *inside* the
   `/test-supabase` handler after its `return` statements, so it was never registered —
   every upload returned 404. Verified against your original file. Fixed.

4. **Citation markers in answers.** `[C1, C2]` / `[ C1 ]` are normalised to `[C1][C2]`;
   markers for IDs that don't exist in the evidence are removed; the citation list
   contains only the sources the answer actually cites (all of them if it cites none).

5. **Sections a document names are cited exactly.** If a document says "section 10 of
   the Contract Act", that exact section is cited. Before, those passages were pushed
   through the generic semantic-score gate and a keyword-based section picker, so the
   cited section was dropped or replaced by another one.

6. **Section-number detection.** The old pattern matched "860." inside "1860.", dates
   like "31.12.", and missed the Bangla dari "৷" (U+09F7). Now a section number must
   stand alone and be followed by `.`, `।` or `৷` plus whitespace.

7. **Corrupted characters in cited text.** 8,262 of 15,428 corpus passages contain
   U+FFFD, mostly at chunk edges (chunks were split mid-character). These are now
   stripped from cited/evidence text. **The real fix is to re-chunk and re-ingest the
   corpus**; the bad characters are also in Supabase.

## New endpoint (for testing)

`GET /api/legal/official-source?act=11.json&section=4&title=The%20Penal%20Code,%201860`
→ `{ sourceUrl, sourceName, sourceKind }`.

## Optional: pre-download all section links (offline / exhibition)

```
cd backend
npx tsx src/buildBdlawsIndex.ts
```
Indexes every act in `data/metadata.csv` (~1,570 pages, a few minutes).

## Tests

- `npx tsx src/bdlaws.test.ts` — parser, Bangla/English numbering, fallback, caching.
- End-to-end, run here: your real `server.ts` against local stand-ins for Supabase,
  Groq and bdlaws, using your real corpus passages:
  - `/api/legal/ask` (rent refusal) → C1 = বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১, ধারা ১৯, section-level link, provision text present, invalid `[C9]` removed.
  - `/api/legal/analyze-document` with "section 10 of the Contract Act" → C1 = The Contract Act, 1872, section 10, section-level link.
  - Your original frontend, unchanged, against this backend: the `[C1]` chip and the
    "Source" / "Open official online source" buttons open the bdlaws section page.

## Not verified here

- The live bdlaws site wasn't reachable from the test machine. The parser matches the
  structure confirmed on the live Penal Code page (`<a href=".../act-11/section-1944.html">1. Title…</a>`),
  but run `GET /api/legal/official-source?act=11.json&section=4` on your machine once:
  it should return `.../act-11/section-19904.html`. If it returns `sourceKind: "act"`,
  the page structure differs and I need one saved act page to adjust the parser.
- bdlaws sometimes redirects https → http; links use https and browsers follow the redirect.
- Real Groq/Supabase behaviour (your keys) and semantic search.

## Frontend bugs found but NOT changed (as requested)

- `UploadPage.tsx`: about 55 Bangla strings are corrupted (bytes lost in an earlier save).
- `AnalysisPage.tsx`: `useEffect(() => startFreshChat(), …)` resets the chat on every visit.
- `UploadPage.tsx`: voice transcript is appended on top of the already-typed text (duplicates it).
- `UploadPage.tsx`: the file is cleared before `/verify`, so the original never shows side by side.
- `ChatPanel.tsx`: `[C1]` markers in the analysis-page chat are plain text (the source
  cards below them are clickable).
- `services/api.ts`: API URL is hard-coded to `127.0.0.1:5000`; `.env.example` says 8000.
