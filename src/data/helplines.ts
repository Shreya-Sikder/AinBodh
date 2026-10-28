export type Helpline = {
  id: string;
  number: string;
  availability: string;
  en: { group: string; name: string; description: string };
  bn: { group: string; name: string; description: string };
  priority: "emergency" | "support";
};

export const helplines: Helpline[] = [
  {
    id: "999",
    number: "999",
    availability: "24/7",
    priority: "emergency",
    en: { group: "Immediate Emergency", name: "National Emergency Service", description: "Police, fire, and ambulance emergency assistance" },
    bn: { group: "তাৎক্ষণিক জরুরি", name: "জাতীয় জরুরি সেবা", description: "পুলিশ, অগ্নিনির্বাপণ ও অ্যাম্বুলেন্স সহায়তা" },
  },
  {
    id: "102",
    number: "102",
    availability: "24/7",
    priority: "emergency",
    en: { group: "Immediate Emergency", name: "Fire Service", description: "Fire and related emergency assistance" },
    bn: { group: "তাৎক্ষণিক জরুরি", name: "ফায়ার সার্ভিস", description: "অগ্নিকাণ্ড ও সংশ্লিষ্ট জরুরি সহায়তা" },
  },
  {
    id: "16430",
    number: "16430",
    availability: "Office hours",
    priority: "support",
    en: { group: "Legal Support", name: "National Legal Aid Helpline", description: "Government legal aid assistance (toll-free)" },
    bn: { group: "আইনি সহায়তা", name: "জাতীয় আইনি সহায়তা হেল্পলাইন", description: "সরকারি আইনি সহায়তা (টোল-ফ্রি)" },
  },
  {
    id: "109",
    number: "109",
    availability: "24/7",
    priority: "support",
    en: { group: "Women & Children", name: "Violence Against Women & Children Helpline", description: "Support for violence against women and children" },
    bn: { group: "নারী ও শিশু", name: "নারী ও শিশু নির্যাতন হেল্পলাইন", description: "নারী ও শিশু নির্যাতন সংক্রান্ত সহায়তা" },
  },
  {
    id: "1098",
    number: "1098",
    availability: "24/7",
    priority: "support",
    en: { group: "Women & Children", name: "Child Helpline", description: "Child protection-related assistance" },
    bn: { group: "নারী ও শিশু", name: "শিশু হেল্পলাইন", description: "শিশু সুরক্ষা সংক্রান্ত সহায়তা" },
  },
];

export const helplineDisclaimer = {
  en: "Phone numbers should be verified against official Bangladesh government sources before production. AinBodh does not guarantee availability. In a life-threatening emergency, call 999 immediately.",
  bn: "ফোন নম্বরগুলো প্রোডাকশনে ব্যবহারের আগে বাংলাদেশ সরকারের সরকারি উৎস থেকে যাচাই করুন। AinBodh প্রাপ্যতার নিশ্চয়তা দেয় না। জীবন-বিপন্ন জরুরি অবস্থায় তাৎক্ষণিকভাবে ৯৯৯ কল করুন।",
};

