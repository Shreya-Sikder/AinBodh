import type {
  ChatResponse,
  LegalCitation,
} from "./api";

/*
 * =========================================================
 * AINBODH OFFLINE DEMO
 *
 * Exhibition-only offline legal QA.
 *
 * This does NOT replace the online retrieval system.
 * It does NOT call:
 * - Supabase
 * - Groq
 * - Express backend
 * - Any external API
 *
 * The purpose is to demonstrate the core AinBodh flow
 * when internet access is unavailable.
 *
 * Flow:
 *
 * Natural-language situation
 *          ↓
 * Situation detection
 *          ↓
 * Curated legal evidence
 *          ↓
 * Grounded explanation
 *
 * Unsupported questions are rejected rather than guessed.
 * =========================================================
 */

type DemoCase = {
  id: string;
  keywords: string[];
  requiredConcepts: string[];
  citation: LegalCitation;
  answer: string;
};

const RENT_REFUSAL_CITATION: LegalCitation = {
  id: "C1",
  title: "বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১",
  actFile: "748.json",
  sectionNumber: "19",
  content:
    "ধারা ১৯(১) এমন পরিস্থিতি নিয়ে বিধান দেয় যেখানে বাড়ী-মালিক ডাক মনি অর্ডারের মাধ্যমে প্রেরিত ভাড়া গ্রহণ করতে অস্বীকার করেন।",
  sourceName:
    "Laws of Bangladesh — বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১, ধারা ১৯",
};

const RENT_RECEIPT_CITATION: LegalCitation = {
  id: "C1",
  title: "বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১",
  actFile: "748.json",
  sectionNumber: "13",
  content:
    "ধারা ১৩(১) অনুযায়ী ভাড়া পরিশোধ করা হলে বাড়ী-মালিককে ভাড়া প্রাপ্তির রশিদ দেওয়ার বিধান রয়েছে।",
  sourceName:
    "Laws of Bangladesh — বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১, ধারা ১৩",
};

const EVICTION_CITATION: LegalCitation = {
  id: "C1",
  title: "বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১",
  actFile: "748.json",
  sectionNumber: "18",
  content:
    "ধারা ১৮ অনুমোদনযোগ্য ভাড়া পরিশোধ ও ভাড়ার শর্ত পূরণের ক্ষেত্রে দখল পুনরুদ্ধার সংক্রান্ত বিধান নির্ধারণ করে, তবে এতে নির্দিষ্ট ব্যতিক্রম রয়েছে।",
  sourceName:
    "Laws of Bangladesh — বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১, ধারা ১৮",
};

const DEMO_CASES: DemoCase[] = [
  /*
   * =======================================================
   * CASE 1 — LANDLORD REFUSES RENT
   * =======================================================
   */
  {
    id: "rent_refusal",

    keywords: [
      "landlord refuses rent",
      "landlord refuse rent",
      "landlord refusing rent",
      "landlord refused rent",
      "refuses to accept rent",
      "refused to accept rent",
      "refusing to accept rent",
      "not accepting rent",
      "won't accept rent",
      "will not accept rent",
      "landlord won't take rent",
      "landlord will not take rent",
      "cannot pay landlord",
      "cannot give rent to landlord",
      "landlord does not take rent",

      "বাড়িওয়ালা ভাড়া নিচ্ছে না",
      "বাড়িওয়ালা ভাড়া নিতে চাচ্ছে না",
      "বাড়িওয়ালা ভাড়া নিতে চাইছে না",
      "বাড়িওয়ালা ভাড়া গ্রহণ করছে না",
      "বাড়িওয়ালা ভাড়া নিচ্ছেন না",
      "বাড়িওয়ালা ভাড়া নিচ্ছে না",
      "বাড়িওয়ালা ভাড়া নিতে রাজি না",
      "বাড়িওয়ালা ভাড়া নিতে অস্বীকার করছে",
      "বাড়িওয়ালা ভাড়া গ্রহণ করতে অস্বীকার করছে",
      "ভাড়া নিতে চাচ্ছে না",
      "ভাড়া নিতে চাইছে না",
      "ভাড়া নিচ্ছে না",
      "ভাড়া গ্রহণ করছে না",
      "ভাড়া গ্রহণ করতে অস্বীকার",
      "ভাড়া নিতে অস্বীকার",

      "bariwala bhara nicche na",
      "bariwala bhara nite chacche na",
      "bariwala bhara nite chaiche na",
      "bariwala bhara nite rajি na",
      "bariwala bhara grohon korche na",
      "bariwala bhara nite oswikar korche",
      "bhara nicche na",
      "bhara nite chacche na",
    ],

    requiredConcepts: [
      "landlord",
      "rent",
      "refusal",
    ],

    citation: RENT_REFUSAL_CITATION,

    answer:
      "⚖️ **সরাসরি উত্তর**\n\n" +
      "যদি বাড়ী-মালিক ডাক মনি অর্ডারের মাধ্যমে পাঠানো ভাড়া গ্রহণ করতে অস্বীকার করেন, বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১-এর ধারা ১৯(১)-এ নির্দিষ্ট পরিস্থিতিতে ভাড়া জমা দেওয়ার একটি ব্যবস্থা রাখা হয়েছে। [C1]\n\n" +
      "ধারা ১৯(১)(ক)-এ ডাক কর্তৃপক্ষের মাধ্যমে পাঠানো ভাড়া ফেরত পাওয়ার পর নির্দিষ্ট সময়ের মধ্যে ভাড়া জমা দেওয়ার বিধানের কথা রয়েছে। [C1]\n\n" +
      "⚠️ **আপনার পরিস্থিতি সম্পর্কে**\n\n" +
      "আপনি ঠিক কীভাবে ভাড়া দেওয়ার চেষ্টা করেছেন, ডাক মনি অর্ডার ব্যবহার করা হয়েছিল কি না এবং আইনে উল্লেখিত অন্যান্য শর্ত পূরণ হয়েছে কি না—এসব তথ্য এখানে জানা নেই। তাই AinBodh সাধারণ প্রযোজ্য বিধানটি দেখাচ্ছে; এটি আপনার নির্দিষ্ট মামলার চূড়ান্ত সিদ্ধান্ত নয়।",
  },

  /*
   * =======================================================
   * CASE 2 — RENT RECEIPT
   * =======================================================
   */
  {
    id: "rent_receipt",

    keywords: [
      "rent receipt",
      "receipt for rent",
      "rent payment receipt",
      "landlord won't give receipt",
      "landlord does not give receipt",
      "landlord not giving receipt",
      "landlord refused receipt",
      "no rent receipt",
      "rent receipt not given",

      "ভাড়ার রশিদ",
      "ভাড়া রশিদ",
      "ভাড়ার রসিদ",
      "বাড়িওয়ালা রশিদ দেয় না",
      "বাড়িওয়ালা ভাড়ার রশিদ দেয় না",
      "বাড়িওয়ালা ভাড়ার রসিদ দিচ্ছে না",
      "ভাড়া দেওয়ার পর রশিদ",
      "ভাড়া দেওয়ার পরে রশিদ",
      "ভাড়া পরিশোধের রশিদ",
      "রশিদ প্রদান",
      "রশিদ দিচ্ছে না",
      "রশিদ দেয় না",

      "bhara receipt",
      "bariwala receipt dey na",
      "bariwala bhara receipt dey na",
      "bhara dewar por receipt",
      "receipt dicche na",
    ],

    requiredConcepts: [
      "rent",
      "receipt",
    ],

    citation: RENT_RECEIPT_CITATION,

    answer:
      "⚖️ **সরাসরি উত্তর**\n\n" +
      "বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১-এর ধারা ১৩(১)-এ ভাড়া পরিশোধের পর বাড়ী-মালিক কর্তৃক ভাড়া প্রাপ্তির রশিদ দেওয়ার বিধান রয়েছে। [C1]\n\n" +
      "📌 **আইনের সঙ্গে আপনার পরিস্থিতি**\n\n" +
      "আপনার প্রশ্নটি ভাড়া পরিশোধের পর রশিদ না পাওয়ার পরিস্থিতির সঙ্গে সম্পর্কিত। ধারা ১৩(১) এই বিষয়টি সরাসরি উল্লেখ করে। [C1]\n\n" +
      "তবে আপনার নির্দিষ্ট পরিস্থিতিতে অন্য কোনো আইনগত বিষয় প্রযোজ্য কি না, তা নির্ধারণের জন্য অতিরিক্ত তথ্য প্রয়োজন হতে পারে।",
  },

  /*
   * =======================================================
   * CASE 3 — EVICTION
   * =======================================================
   */
  {
    id: "eviction",

    keywords: [
      "can landlord evict me",
      "can my landlord evict me",
      "landlord evict me",
      "landlord wants to evict me",
      "landlord is evicting me",
      "eviction",
      "eviction notice",
      "landlord eviction",
      "evict me if i pay rent",
      "eviction if rent paid",
      "rent paid eviction",

      "বাড়িওয়ালা কি আমাকে উচ্ছেদ করতে পারবে",
      "বাড়িওয়ালা আমাকে উচ্ছেদ",
      "বাড়িওয়ালা উচ্ছেদ করতে চায়",
      "বাড়িওয়ালা উচ্ছেদ করছে",
      "উচ্ছেদ করতে পারবে",
      "উচ্ছেদ",
      "উচ্ছেদের নোটিশ",
      "উচ্ছেদের নোটিশ দিয়েছে",
      "ভাড়া দিলে উচ্ছেদ",
      "ভাড়া পরিশোধ করলে উচ্ছেদ",
      "ভাড়া দেওয়ার পর উচ্ছেদ",
      "বাড়িওয়ালা বের করে দিতে চায়",

      "bariwala ki amake uchhed korte parbe",
      "bariwala amake uchhed korte chacche",
      "bariwala uchhed korte chacche",
      "uchhed",
      "uchheder notice",
      "bhara dile uchhed",
      "bhara dile bari theke ber kore dibe",
    ],

    requiredConcepts: [
      "eviction",
    ],

    citation: EVICTION_CITATION,

    answer:
      "⚖️ **সরাসরি উত্তর**\n\n" +
      "বাড়ী ভাড়া নিয়ন্ত্রণ আইন, ১৯৯১-এর ধারা ১৮ অনুমোদনযোগ্য ভাড়া পরিশোধ এবং ভাড়ার শর্ত পূরণের ক্ষেত্রে বাড়ীর দখল পুনরুদ্ধার সংক্রান্ত বিধান নির্ধারণ করে। [C1]\n\n" +
      "তবে একই ধারায় কিছু ব্যতিক্রমও উল্লেখ রয়েছে। [C1]\n\n" +
      "⚠️ **আপনার পরিস্থিতি সম্পর্কে**\n\n" +
      "শুধু আপনি ভাড়া দিচ্ছেন—এই একটি তথ্যের ভিত্তিতে আপনার নির্দিষ্ট ক্ষেত্রে উচ্ছেদ হবে কি না তা নিশ্চিত করা যায় না। চুক্তির শর্ত এবং ধারা ১৮-এ উল্লেখিত অন্যান্য পরিস্থিতি গুরুত্বপূর্ণ হতে পারে।",
  },
];

/*
 * =========================================================
 * NORMALIZATION
 * =========================================================
 */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”‘’"']/g, " ")
    .replace(/[।,!?;:()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/*
 * =========================================================
 * TOKENIZATION
 * =========================================================
 */

function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter(Boolean);
}

/*
 * =========================================================
 * CONCEPT DETECTION
 *
 * This makes matching less dependent on one exact sentence.
 * =========================================================
 */

function detectConcepts(question: string): Set<string> {
  const text = normalize(question);

  const concepts = new Set<string>();

  const hasLandlord =
    /landlord|owner|bariwala|বাড়িওয়ালা|বাড়িওয়ালা|বাড়ী-মালিক|বাড়ী-মালিক/.test(
      text,
    );

  const hasRent =
    /rent|bhara|ভাড়া|ভাড়া|ভাড়ার|ভাড়ার/.test(text);

  const hasRefusal =
    /refus|reject|won.?t|will not|not accept|not taking|does not take|nicche na|nite chacche na|nite chaiche na|oswikar|অস্বীকার|নিচ্ছে না|নিতে চাচ্ছে না|নিতে চাইছে না|গ্রহণ করছে না|নিতে রাজি না/.test(
      text,
    );

  const hasReceipt =
    /receipt|রশিদ|রসিদ|receipt dey na|রশিদ দেয় না|রশিদ দিচ্ছে না/.test(
      text,
    );

  const hasEviction =
    /evict|eviction|uchhed|উচ্ছেদ|বের করে|নোটিশ|notice/.test(
      text,
    );

  if (hasLandlord) {
    concepts.add("landlord");
  }

  if (hasRent) {
    concepts.add("rent");
  }

  if (hasRefusal) {
    concepts.add("refusal");
  }

  if (hasReceipt) {
    concepts.add("receipt");
  }

  if (hasEviction) {
    concepts.add("eviction");
  }

  return concepts;
}

/*
 * =========================================================
 * CASE MATCHING
 *
 * Exact phrases get the strongest score.
 * Concept combinations provide a fallback for natural
 * variations that were not explicitly listed.
 * =========================================================
 */

function findDemoCase(
  question: string,
): DemoCase | null {
  const normalizedQuestion = normalize(question);
  const concepts = detectConcepts(question);

  let bestCase: DemoCase | null = null;
  let bestScore = 0;

  for (const demoCase of DEMO_CASES) {
    let score = 0;

    // Exact / phrase matching
    for (const keyword of demoCase.keywords) {
      const normalizedKeyword = normalize(keyword);

      if (
        normalizedKeyword.length >= 4 &&
        normalizedQuestion.includes(normalizedKeyword)
      ) {
        score += Math.min(
          30,
          Math.max(8, normalizedKeyword.length / 2),
        );
      }
    }

    // Concept matching
    for (const concept of demoCase.requiredConcepts) {
      if (concepts.has(concept)) {
        score += 15;
      }
    }

    // Strong situation combinations
    if (
      demoCase.id === "rent_refusal" &&
      concepts.has("landlord") &&
      concepts.has("rent") &&
      concepts.has("refusal")
    ) {
      score += 40;
    }

    if (
      demoCase.id === "rent_receipt" &&
      concepts.has("rent") &&
      concepts.has("receipt")
    ) {
      score += 40;
    }

    if (
      demoCase.id === "eviction" &&
      concepts.has("eviction")
    ) {
      score += 35;
    }

    // Additional natural-language fallbacks
    if (
      demoCase.id === "rent_refusal" &&
      /landlord.*rent|rent.*landlord|bariwala.*bhara|bhara.*bariwala/.test(
        normalizedQuestion,
      ) &&
      /not|no|won.?t|refus|nicche na|nite na|oswikar|chacche na/.test(
        normalizedQuestion,
      )
    ) {
      score += 35;
    }

    if (
      demoCase.id === "rent_receipt" &&
      /rent.*receipt|receipt.*rent|bhara.*receipt|receipt.*bhara/.test(
        normalizedQuestion,
      )
    ) {
      score += 35;
    }

    if (
      demoCase.id === "eviction" &&
      /landlord.*evict|evict.*landlord|landlord.*notice|eviction.*notice|bariwala.*uchhed|uchhed.*bariwala/.test(
        normalizedQuestion,
      )
    ) {
      score += 35;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCase = demoCase;
    }
  }

  // Keep the safety mechanism:
  // weak matches are rejected instead of guessed.
  if (bestScore < 25) {
    return null;
  }

  return bestCase;
}

/*
 * =========================================================
 * OFFLINE ASK
 * =========================================================
 */

export async function askQuestionOffline(
  question: string,
): Promise<ChatResponse> {
  await new Promise((resolve) =>
    window.setTimeout(resolve, 350),
  );

  const cleanQuestion = question.trim();

  if (!cleanQuestion) {
    return {
      answer:
        "⚠️ **Offline Demo Mode**\n\n" +
        "Please describe your legal situation or question.",
      citations: [],
      grounded: false,
    };
  }

  const demoCase = findDemoCase(cleanQuestion);

  if (!demoCase) {
    return {
      answer:
        "⚠️ **Offline Demo Mode**\n\n" +
        "I could not find sufficiently relevant evidence in the local exhibition dataset for this situation.\n\n" +
        "AinBodh will not guess or invent a legal answer without supporting evidence.\n\n" +
        "For the full Bangladesh-law corpus and broader situation-based retrieval, switch to **Online Mode** when an internet connection is available.",
      citations: [],
      grounded: false,
    };
  }

  return {
    answer: demoCase.answer,
    citations: [demoCase.citation],
    grounded: true,
  };
}

/*
 * =========================================================
 * MODE DETECTION
 *
 * Activate with:
 *
 * /upload?demo=offline
 *
 * Normal:
 *
 * /upload
 * =========================================================
 */

export function isOfflineDemoMode(): boolean {
  const params = new URLSearchParams(
    window.location.search,
  );

  return (
    params.get("demo")?.toLowerCase() ===
    "offline"
  );
}