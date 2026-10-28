/* =========================================================
   CONVERSATION LAYER — what kind of message is this, and in
   which language should AinBodh reply?

   classifyTurn()          greeting / thanks / goodbye / small talk /
                           acknowledgement, answered instantly without
                           running a legal search.
   resolveAnswerLanguage() Bangla by default; English when the person
                           writes English with the app set to English,
                           or asks for English. Never Banglish.
   detectEmotionalWeight() whether the conversation has become heavy
                           (fear, shame, hopelessness…), so support
                           contacts are offered.
========================================================= */

export type AnswerLanguage = "bn" | "en";

export type TurnKind =
  | "greeting"
  | "thanks"
  | "goodbye"
  | "acknowledgement"
  | "how_are_you"
  | "identity"
  | "legal";

/* ---------------------------------------------------------
   Text helpers
--------------------------------------------------------- */

const BANGLA_SCRIPT = /[ঀ-৿]/;

function normalise(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, " ")
    .replace(/[!?.,;:।৷'"“”‘’()\-–—_*~^/\\|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Common romanised-Bangla words, matched as whole words only
// ("den" must not match "garden", "ache" must not match "headache").
const BANGLISH_WORDS = new Set(
  (
    "ami amar amake amra amader apni apnar apnake tumi tomar tomake oder " +
    "ki keno kivabe kibhabe kothay kokhon koto kemon ke kar " +
    "ache achen acho achi nai nei hobe hoy hoyeche hocche hoise hoyse holo " +
    "korbo korben korte korar korche korsi korechi korlo korse kori koren " +
    "parbo parben parina pari pare dibo diben dite dey dicche disse niye nite nibe nibo " +
    "bolen bolo bolte bollo bole bujhi bujhte bujhlam jani jante janen " +
    "jodi tahole kintu ar abar ekhon tokhon onek khub ekta kono shob sob " +
    "bari barir bariwala bariola vara bhara takar taka kaj chakri malik " +
    "dhonnobad dhonyobad dhonnobaad shukriya bhai vai apa apu " +
    "valo bhalo kharap somossa shomossha koro korun"
  ).split(" "),
);

export function isBanglish(text: string): boolean {
  if (BANGLA_SCRIPT.test(text)) return false;
  const words = normalise(text).split(" ").filter((word) => /^[a-z]+$/.test(word));
  if (words.length === 0) return false;
  const hits = words.filter((word) => BANGLISH_WORDS.has(word)).length;
  // One clear word in a short message ("dhonnobad"), or a meaningful share of a longer one.
  return words.length <= 3 ? hits >= 1 : hits >= 2 && hits / words.length >= 0.15;
}

export function writtenLanguage(text: string): "bangla" | "banglish" | "english" | "unknown" {
  if (BANGLA_SCRIPT.test(text)) return "bangla";
  if (!/[a-z]/i.test(text)) return "unknown";
  return isBanglish(text) ? "banglish" : "english";
}

/* ---------------------------------------------------------
   Answer language
--------------------------------------------------------- */

const ASK_ENGLISH = /\b(in|into|answer in|reply in|respond in|write in|speak)\s+english\b|ইংরেজিতে|ইংরেজি\s*তে|english[e]?\s*(bolo|bolen|likho|likhen|dao|den)|\bingreji(te)?\b/i;
const ASK_BANGLA = /\b(in|into|answer in|reply in|respond in|write in|speak)\s+(bangla|bengali)\b|বাংলায়|বাংলা\s*তে|bangla(y|te)\s*(bolo|bolen|likho|likhen|dao|den)?/i;

/**
 * Bangla is the default. English only when the person asks for it, or writes
 * in English while the app is set to English. Banglish input is answered in
 * Bangla script.
 */
export function resolveAnswerLanguage(
  question: string,
  appLanguage: AnswerLanguage | undefined,
  history: Array<{ role: string; content: string }> = [],
): AnswerLanguage {
  // An explicit request in this message, or earlier from the same person, wins.
  const userTurns = [...history.filter((item) => item.role === "user").map((item) => item.content), question];
  for (let index = userTurns.length - 1; index >= 0; index--) {
    const turn = userTurns[index];
    const english = ASK_ENGLISH.test(turn);
    const bangla = ASK_BANGLA.test(turn);
    if (english && !bangla) return "en";
    if (bangla && !english) return "bn";
  }

  const written = writtenLanguage(question);
  if (written === "bangla" || written === "banglish") return "bn";
  if (written === "english") return appLanguage === "bn" ? "bn" : "en";
  return appLanguage ?? "bn";
}

/* ---------------------------------------------------------
   Turn classification
--------------------------------------------------------- */

type Phrase = { kind: TurnKind; words: string[] };

const phrase = (kind: TurnKind, ...items: string[]): Phrase[] => items.map((item) => ({ kind, words: item.split(" ") }));

// Longest phrases first so "thank you so much" is consumed as one unit.
const PHRASES: Phrase[] = [
  ...phrase(
    "greeting",
    "assalamu alaikum", "assalamualaikum", "asalamualaikum", "assalamu alaykum", "as salamu alaikum",
    "aslamualaikum", "assalam alaikum", "salamu alaikum", "salam alaikum", "salaam", "salam", "slm",
    "hi", "hii", "hiii", "hello", "helo", "hellow", "hey", "heyy", "hiya", "yo", "greetings", "namaste", "namaskar", "nomoskar",
    "good morning", "good afternoon", "good evening", "good day", "morning",
    "আসসালামু আলাইকুম", "আসসালামুআলাইকুম", "আস্সালামু আলাইকুম", "সালাম", "হাই", "হ্যালো", "হেলো", "হেই",
    "নমস্কার", "শুভ সকাল", "শুভ বিকাল", "শুভ সন্ধ্যা", "শুভ রাত্রি",
  ),
  ...phrase(
    "thanks",
    "thank you so much", "thank you very much", "thanks a lot", "thanks so much", "many thanks", "thank you", "thank u",
    "thanks", "thank", "thx", "thnx", "thanx", "tnx", "ty", "tysm", "much appreciated", "appreciated", "appreciate it",
    "dhonnobad", "dhonyobad", "dhonnobaad", "dhonnyobad", "donnobad", "dhanyabad", "shukriya", "jazakallah", "jazak allah",
    "অনেক অনেক ধন্যবাদ", "অনেক ধন্যবাদ", "ধন্যবাদ", "শুকরিয়া", "জাজাকাল্লাহ",
  ),
  ...phrase(
    "goodbye",
    "good bye", "goodbye", "bye bye", "bye", "see you", "see ya", "take care", "good night", "gn",
    "allah hafez", "allah hafiz", "khoda hafez", "khuda hafiz",
    "আল্লাহ হাফেজ", "খোদা হাফেজ", "বিদায়", "শুভ রাত্রি", "ভালো থাকবেন", "ভালো থেকো",
  ),
  ...phrase(
    "acknowledgement",
    "ok", "okay", "okey", "okk", "k", "alright", "got it", "understood", "i see", "cool", "great", "nice", "perfect",
    "fine", "sure", "noted", "acha", "accha", "thik ache", "thik ase", "bujhechi", "bujhsi", "bujhlam",
    "ঠিক আছে", "আচ্ছা", "বুঝেছি", "বুঝলাম", "ওকে", "চমৎকার",
  ),
  ...phrase(
    "how_are_you",
    "how are you", "how are you doing", "how r u", "how ru", "whats up", "what s up", "sup",
    "kemon achen", "kemon acho", "kemon aso", "kmn acho", "kmn achen",
    "কেমন আছেন", "কেমন আছো", "কেমন আছ",
  ),
  ...phrase(
    "identity",
    "who are you", "what are you", "what is ainbodh", "what can you do", "what do you do", "who made you",
    "tumi ke", "apni ke", "tomar nam ki", "apnar nam ki", "tumi ki korte paro", "apni ki korte paren",
    "তুমি কে", "আপনি কে", "তোমার নাম কি", "আপনার নাম কি", "তুমি কী করতে পারো", "আপনি কী করতে পারেন", "আপনি কি করতে পারেন",
  ),
].sort((a, b) => b.words.length - a.words.length);

// Words that may surround a greeting/thanks without making it a question.
const FILLER = new Set(
  (
    "ainbodh আইনবোধ there dear sir madam maam mam friend bro brother sis sister bhai vai apa apu everyone all " +
    "so very much lot again too also and n & you u ya again just really " +
    "ভাই আপা আপু স্যার আপনাকে তোমাকে আবারও আবার সত্যিই খুব অনেক এবং ও আর"
  ).split(" "),
);

/**
 * Classify a short social message. Anything with real content —
 * "hi, my landlord won't return my deposit" — is "legal".
 */
export function classifyTurn(question: string): TurnKind {
  const words = normalise(question).split(" ").filter(Boolean);
  if (words.length === 0 || words.length > 12) return "legal";

  const kinds = new Set<TurnKind>();
  let index = 0;

  while (index < words.length) {
    if (FILLER.has(words[index])) {
      index++;
      continue;
    }

    const match = PHRASES.find((item) => item.words.every((word, offset) => words[index + offset] === word));
    if (!match) return "legal";

    kinds.add(match.kind);
    index += match.words.length;
  }

  if (kinds.size === 0) return "legal";
  // The most "final" intent wins: "thanks, bye" -> goodbye; "hi, thanks" -> thanks.
  for (const kind of ["goodbye", "thanks", "identity", "how_are_you", "greeting", "acknowledgement"] as TurnKind[]) {
    if (kinds.has(kind)) return kind;
  }
  return "legal";
}

/* ---------------------------------------------------------
   Replies to social messages
--------------------------------------------------------- */

const SALAM = /salam|সালাম|আলাইকুম|alaikum|alaykum/i;

export function socialReply(kind: TurnKind, question: string, language: AnswerLanguage, hasHistory: boolean): string {
  const bn = language === "bn";

  switch (kind) {
    case "greeting":
      if (SALAM.test(question)) {
        return bn
          ? "ওয়ালাইকুম আসসালাম! আমি AinBodh। আমি আপনাকে কীভাবে সাহায্য করতে পারি?"
          : "Wa alaikum assalam! I am AinBodh. How can I help you?";
      }
      return bn ? "হাই, আমি AinBodh। আমি আপনাকে কীভাবে সাহায্য করতে পারি?" : "Hi, I am AinBodh. How can I help you?";

    case "how_are_you":
      return bn
        ? "আমি ভালো আছি, জিজ্ঞেস করার জন্য ধন্যবাদ! আমি AinBodh। আজ আমি আপনাকে কীভাবে সাহায্য করতে পারি?"
        : "I'm doing well, thank you for asking! I am AinBodh. How can I help you today?";

    case "identity":
      return bn
        ? "আমি AinBodh — বাংলাদেশের আইন সহজ ভাষায় বুঝতে সাহায্য করার একটি সহকারী। আপনি আমাকে আপনার পরিস্থিতি বা আইনি প্রশ্ন লিখে জানাতে পারেন, অথবা কোনো চুক্তি, নোটিশ বা সরকারি নথি আপলোড করতে পারেন। আমি সংশ্লিষ্ট আইনের ধারা খুঁজে দেখাব (Laws of Bangladesh-এর লিংকসহ) এবং আপনি কী করতে পারেন তা বুঝিয়ে বলব। আমি আইনজীবীর বিকল্প নই। আপনি কী জানতে চান?"
        : "I am AinBodh — an assistant that helps you understand Bangladesh law in plain language. You can describe your situation or ask a legal question, or upload a contract, notice or official document. I'll find the relevant sections of law (with links to Laws of Bangladesh) and explain what you can do. I'm not a substitute for a lawyer. What would you like to know?";

    case "thanks":
      return bn
        ? "আপনাকেও ধন্যবাদ! সাহায্য করতে পেরে ভালো লাগলো। অন্য কোনো প্রশ্ন থাকলে যেকোনো সময় আমাকে জিজ্ঞেস করবেন।"
        : "You're welcome! I'm glad I could help. If you have any other questions, feel free to ask me anytime.";

    case "goodbye":
      return bn
        ? "ভালো থাকবেন! অন্য কোনো প্রশ্ন থাকলে যেকোনো সময় আমাকে জিজ্ঞেস করবেন।"
        : "Take care! If you have any other questions, feel free to ask me anytime.";

    case "acknowledgement":
      return hasHistory
        ? bn
          ? "ঠিক আছে! এ বিষয়ে আরও কিছু জানতে চাইলে বা অন্য কোনো প্রশ্ন থাকলে জিজ্ঞেস করুন।"
          : "Alright! If you'd like to know more about this or have any other question, just ask."
        : bn
          ? "হাই, আমি AinBodh। আমি আপনাকে কীভাবে সাহায্য করতে পারি?"
          : "Hi, I am AinBodh. How can I help you?";

    default:
      return "";
  }
}

/* ---------------------------------------------------------
   Emotional weight of the conversation
--------------------------------------------------------- */

const DISTRESS = [
  /\b(scared|afraid|terrified|frightened|panic(king)?|anxious|anxiety|depress(ed|ion)|hopeless|helpless|worthless|ashamed|humiliat(ed|ion)|traumati[sz]ed|desperate|devastated|heartbroken|overwhelmed|miserable)\b/i,
  /\b(can'?t|cannot)\s+(sleep|eat|stop crying|take (it|this) anymore|cope|handle (it|this))\b/i,
  /\b(crying|i feel (so )?(alone|lost|broken|trapped|empty))\b/i,
  /\b(no one|nobody)\s+(will )?(help|believe|understand)s?\s+me\b/i,
  /\bmental(ly)?\s+(stress|pressure|health|breakdown|torture)\b/i,
  /ভয়\s*(পাচ্ছি|লাগছে|করছে|পাই)|আতঙ্ক|হতাশ|অসহায়|কান্না|কাঁদছি|কাঁদি|লজ্জা(য়)?|অপমান|মানসিক\s*(চাপ|যন্ত্রণা|নির্যাতন)|ঘুম(াতে)?\s*পারছি\s*না|ঘুম\s*আসে\s*না|দুশ্চিন্তা|একা\s*(লাগছে|হয়ে)|ভেঙে\s*পড়েছি|সহ্য\s*করতে\s*পারছি\s*না|কেউ\s*(সাহায্য|বিশ্বাস)/,
  /\b(bhoy|voy)\s*(pacchi|lagche|lagtese|lage)\b|\b(kanna|kandchi|kantesi|hotash|lojja|opoman|tension|depression|eka lagche|eka lagtese|ghum ashe na|ghumate parina|sojjo korte parchi na)\b/i,
];

export type EmotionalWeight = { heavy: boolean; signals: number };

/**
 * Counts distress signals in the person's recent messages. One signal in the
 * latest message, or two across the recent conversation, counts as heavy.
 */
export function detectEmotionalWeight(question: string, history: Array<{ role: string; content: string }> = []): EmotionalWeight {
  const count = (text: string) => DISTRESS.filter((pattern) => pattern.test(text)).length;
  const current = count(question);
  const recent = history
    .filter((item) => item.role === "user")
    .slice(-6)
    .reduce((sum, item) => sum + count(item.content), 0);
  return { heavy: current >= 1 || current + recent >= 2, signals: current + recent };
}
