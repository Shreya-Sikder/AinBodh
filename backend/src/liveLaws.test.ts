/*
 * Run: npx tsx src/liveLaws.test.ts
 * Offline tests for live repeal detection on bdlaws act pages.
 */
import assert from "node:assert/strict";
import { parseLiveStatus } from "./bdlaws";
import { detectRepealBanner } from "./legalCorpus";

// The notice exactly as shown on bdlaws for act 1538 (October 2026).
const NOTICE = "এই অধ্যাদেশ সাইবার সুরক্ষা আইন, ২০২৬ (২০২৬ সনের ৮১ নং আইন) দ্বারা রহিত করা হইয়াছে।";

const REPEALED_WITH_LINK = `
<html><head><title>সাইবার সুরক্ষা অধ্যাদেশ, ২০২৫</title></head><body>
<header><a href="/act-1.html">Home</a> এই আইন Menu দ্বারা রহিত করা হইয়াছে</header>
<h3>সাইবার সুরক্ষা অধ্যাদেশ, ২০২৫</h3>
<p>( ২০২৫ সনের ২৫ নং অধ্যাদেশ )</p>
<p class="text-danger">এই অধ্যাদেশ <a href="http://bdlaws.minlaw.gov.bd/act-1710.html">সাইবার সুরক্ষা আইন, ২০২৬</a> (২০২৬ সনের ৮১ নং আইন) দ্বারা রহিত করা হইয়াছে।</p>
<a href="http://bdlaws.minlaw.gov.bd/act-1457.html">সাইবার নিরাপত্তা আইন, ২০২৩</a>
<a href="http://bdlaws.minlaw.gov.bd/act-1538/section-50001.html">১। সংক্ষিপ্ত শিরোনাম ও প্রবর্তন</a>
</body></html>`;

// Same notice, plain text, decomposed য় (U+09AF U+09BC), no link.
const REPEALED_NO_LINK = `<html><body><div>( ২০২৫ সনের ২৫ নং অধ্যাদেশ )</div><div>${NOTICE.replace(
  /য়/g,
  "য়",
)}</div></body></html>`;

// A current law that mentions repealing others: must NOT read as repealed.
const CURRENT_LAW = `
<html><head><title>সাইবার সুরক্ষা আইন, ২০২৬</title></head><body>
<p>( ২০২৬ সনের ৮১ নং আইন )</p>
<p>যেহেতু সাইবার সুরক্ষা অধ্যাদেশ, ২০২৫ রহিতক্রমে উহা পুনঃপ্রণয়ন করা সমীচীন ও প্রয়োজনীয়;</p>
<a href="http://bdlaws.minlaw.gov.bd/act-1710/section-60051.html">৫১। রহিতকরণ ও হেফাজত</a>
</body></html>`;

const ENGLISH = `<html><body><p>( ACT NO. XII OF 1990 )</p><p>[Repealed by the Example Act, 2001 (Act No. 5 of 2001).]</p></body></html>`;

const banner = detectRepealBanner(NOTICE);
assert.equal(banner.repealed, true);
assert.equal(banner.repealedBy, "সাইবার সুরক্ষা আইন, ২০২৬");

const withLink = parseLiveStatus(REPEALED_WITH_LINK, "1538");
assert.equal(withLink.repealed, true);
assert.equal(withLink.repealedBy, "সাইবার সুরক্ষা আইন, ২০২৬");
assert.equal(withLink.replacementActId, "1710", "links to the repealing act, not other linked acts");

const noLink = parseLiveStatus(REPEALED_NO_LINK, "1538");
assert.equal(noLink.repealed, true);
assert.equal(noLink.replacementActId, undefined);

assert.equal(parseLiveStatus(CURRENT_LAW, "1710").repealed, false);

const english = parseLiveStatus(ENGLISH, "700");
assert.equal(english.repealed, true);
assert.equal(english.repealedBy, "Example Act, 2001");

console.log("liveLaws tests passed");
