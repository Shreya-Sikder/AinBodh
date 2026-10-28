export type TermDefinition = {
  term: string;
  en: { simple: string; document: string };
  bn: { simple: string; document: string };
  reference: string;
};

export const legalTerms: TermDefinition[] = [
  {
    term: "Indemnification",
    en: {
      simple: "One party agrees to protect the other from certain losses or legal claims.",
      document: "The tenant may have responsibility for losses caused by actions connected to the property.",
    },
    bn: {
      simple: "এক পক্ষ অন্য পক্ষকে নির্দিষ্ট ক্ষতি বা আইনি দাবির ক্ষেত্রে সুরক্ষা দিতে সম্মত হয়।",
      document: "সম্পত্তির সঙ্গে যুক্ত কাজের কারণে সৃষ্ট কিছু ক্ষতির দায় ভাড়াটিয়ার হতে পারে।",
    },
    reference: "Page 6 · Section 12",
  },
  {
    term: "Liability",
    en: {
      simple: "Responsibility for a loss, damage, or legal obligation.",
      document: "The document assigns responsibility for certain property-related losses.",
    },
    bn: {
      simple: "ক্ষতি, সম্পত্তি বা আইনি দায়ের জন্য কার দায়িত্ব রয়েছে।",
      document: "নথিটি কিছু সম্পত্তি-সংক্রান্ত ক্ষতির দায় নির্ধারণ করে।",
    },
    reference: "Page 6 · Section 12",
  },
  {
    term: "Termination",
    en: {
      simple: "Ending the agreement under the conditions written in it.",
      document: "Either party may end the agreement with written notice.",
    },
    bn: {
      simple: "চুক্তিতে লেখা শর্ত অনুযায়ী চুক্তি শেষ করা।",
      document: "যেকোনো পক্ষ লিখিত নোটিশে চুক্তি শেষ করতে পারে।",
    },
    reference: "Page 5 · Section 9",
  },
  {
    term: "Jurisdiction",
    en: {
      simple: "The court or legal area whose rules may apply to a dispute.",
      document: "The document identifies the applicable legal area in its final section.",
    },
    bn: {
      simple: "কোন আদালত বা আইনি এলাকার নিয়ম কোনো বিরোধে প্রযোজ্য হতে পারে।",
      document: "নথির শেষ অংশে প্রযোজ্য আইনি এলাকা উল্লেখ করা হয়েছে।",
    },
    reference: "Page 8 · Section 16",
  },
  {
    term: "Security Deposit",
    en: {
      simple: "Money paid at the start of a tenancy that may be held as security for certain obligations.",
      document: "The agreement states a security deposit of BDT 50,000 but does not fully explain the return timeline.",
    },
    bn: {
      simple: "ভাড়ার শুরুতে নিরাপত্তা হিসেবে রাখা টাকা, যা নির্দিষ্ট দায়ের জন্য ব্যবহার হতে পারে।",
      document: "চুক্তিতে ৳৫০,০০০ নিরাপত্তা জমার কথা আছে, তবে ফেরতের সময়সীমা সম্পূর্ণ স্পষ্ট নয়।",
    },
    reference: "Page 2 · Section 4",
  },
  {
    term: "Notice Period",
    en: {
      simple: "The amount of advance notice a party must give before taking a stated action.",
      document: "The agreement refers to 30 days' written notice for termination.",
    },
    bn: {
      simple: "কোনো পদক্ষেপ নেওয়ার আগে কত সময় আগে জানাতে হবে।",
      document: "চুক্তি সমাপ্তির জন্য ৩০ দিনের লিখিত নোটিশের কথা বলা হয়েছে।",
    },
    reference: "Page 5 · Section 9",
  },
  {
    term: "Late Payment Penalty",
    en: {
      simple: "An amount stated in an agreement that may become payable when a payment is late.",
      document: "The document states a BDT 500 per day late-payment penalty.",
    },
    bn: {
      simple: "পেমেন্ট দেরি হলে চুক্তিতে নির্ধারিত অতিরিক্ত টাকা।",
      document: "নথিতে দেরিতে পরিশোধের জন্য প্রতিদিন ৳৫০০ জরিমানার কথা আছে।",
    },
    reference: "Page 3 · Section 5",
  },
  {
    term: "Dispute Resolution",
    en: {
      simple: "The process parties use to address a disagreement.",
      document: "No clear dispute-resolution procedure was identified in the provided document.",
    },
    bn: {
      simple: "দুই পক্ষের মতবিরোধ হলে তা সমাধানের পদ্ধতি।",
      document: "প্রদত্ত নথিতে কোনো স্পষ্ট বিরোধ নিষ্পত্তি প্রক্রিয়া শনাক্ত করা যায়নি।",
    },
    reference: "Not found in the provided document",
  },
];

