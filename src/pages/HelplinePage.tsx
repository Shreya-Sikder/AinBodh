import { AlertTriangle, Ambulance, Building2, HeartHandshake, Phone, ShieldAlert, UsersRound } from "lucide-react";
import { useLanguage } from "../context/LanguageContext";
import PageFooter from "../components/PageFooter";
const groups = [
  { title: "Immediate Emergency", titleBn: "তাৎক্ষণিক জরুরি", icon: ShieldAlert, contacts: [{ name: "National Emergency Service", nameBn: "জাতীয় জরুরি সেবা", desc: "Police, fire, and ambulance emergency assistance", descBn: "পুলিশ, অগ্নিনির্বাপণ ও অ্যাম্বুলেন্স সহায়তা", number: "999", time: "24/7" }, { name: "Fire Service", nameBn: "ফায়ার সার্ভিস", desc: "Fire and related emergency assistance", descBn: "অগ্নিকাণ্ড ও সংশ্লিষ্ট জরুরি সহায়তা", number: "102", time: "24/7" }] },
  { title: "Legal Support", titleBn: "আইনি সহায়তা", icon: Building2, contacts: [{ name: "National Legal Aid Helpline", nameBn: "জাতীয় আইনি সহায়তা হেল্পলাইন", desc: "Government legal aid assistance (toll-free)", descBn: "সরকারি আইনি সহায়তা (টোল-ফ্রি)", number: "16430", time: "Office hours" }] },
  { title: "Women & Children", titleBn: "নারী ও শিশু", icon: UsersRound, contacts: [{ name: "Violence Against Women & Children Helpline", nameBn: "নারী ও শিশু নির্যাতন হেল্পলাইন", desc: "Support for violence against women and children", descBn: "নারী ও শিশু নির্যাতন সংক্রান্ত সহায়তা", number: "109", time: "24/7" }, { name: "Child Helpline", nameBn: "শিশু হেল্পলাইন", desc: "Child protection-related assistance", descBn: "শিশু সুরক্ষা সংক্রান্ত সহায়তা", number: "1098", time: "24/7" }, { name: "Police Cyber Support for Women (PCSW)", nameBn: "পুলিশ সাইবার সাপোর্ট ফর উইমেন (PCSW)", desc: "Online harassment, blackmail and image abuse against women", descBn: "নারীদের প্রতি অনলাইন হয়রানি, ব্ল্যাকমেইল ও ছবি অপব্যবহার", number: "01320-000888", tel: "01320000888", time: "Contact for hours" }] },
  { title: "Emotional Support", titleBn: "মানসিক সহায়তা", icon: HeartHandshake, contacts: [{ name: "Kaan Pete Roi", nameBn: "কান পেতে রই", desc: "Free, confidential emotional support and suicide prevention", descBn: "বিনামূল্যে ও গোপনীয় মানসিক সহায়তা এবং আত্মহত্যা প্রতিরোধ", number: "09612-119911", tel: "+8809612119911", time: "3 PM – 3 AM" }] },
];

const TIME_BN: Record<string, string> = {
  "24/7": "২৪ ঘণ্টা, প্রতিদিন",
  "Office hours": "অফিস চলাকালীন",
  "3 PM – 3 AM": "বিকাল ৩টা – রাত ৩টা",
  "Contact for hours": "সময় জেনে নিন",
};

export default function HelplinePage() {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  return (
    <div className="mx-auto max-w-[1144px] bg-[#f4f6f9]">
      <section className="bg-[#7f1d1d] px-6 pb-5 pt-5 text-white md:px-[52px]">
        <div className="flex items-center gap-2.5"><span className="text-lg">🚨</span><h1 className={`text-[20px] font-bold ${bn ? "bn" : ""}`}>{bn ? "জরুরি হেল্পলাইন" : "Emergency Helpline"}</h1></div>
        <p className={`pt-1 text-[12px] text-white/75 ${bn ? "bn" : ""}`}>{bn ? "বাংলাদেশের গুরুত্বপূর্ণ জরুরি ও সহায়তা যোগাযোগ নম্বর" : "Important emergency and support contacts in Bangladesh"}</p>
        <div className="mt-3 flex gap-2 rounded-lg border border-white/15 bg-white/10 px-3.5 py-2.5 text-[11px]"><AlertTriangle className="size-4 shrink-0" /><span className={bn ? "bn" : ""}>{bn ? "আপনি যদি তাৎক্ষণিক বিপদে থাকেন, সরাসরি উপযুক্ত জরুরি সেবায় যোগাযোগ করুন।" : "If you are in immediate danger, contact the appropriate emergency service directly."}</span></div>
      </section>

      <div className="space-y-6 px-6 py-6 md:px-[52px]">
        {groups.map(({ title, titleBn, icon: Icon, contacts }) => (
          <section key={title}><div className="flex items-center gap-2"><Icon className="size-4 text-navy" /><h2 className={`section-title ${bn ? "bn" : ""}`}>{bn ? titleBn : title}</h2></div><div className="space-y-2 pt-3">{contacts.map((contact) => <div key={contact.number} className="card grid gap-3 p-5 md:grid-cols-[minmax(0,1fr)_150px_290px] md:items-center md:gap-6"><div className="min-w-0"><p className={`text-[14px] font-bold text-navy ${bn ? "bn" : ""}`}>{bn ? contact.nameBn : contact.name}</p><p className={`pt-1 text-[11px] text-muted ${bn ? "bn" : ""}`}>{bn ? contact.descBn : contact.desc}</p></div><div><p className="text-[9px] font-semibold uppercase tracking-wider text-muted">{bn ? "সময়" : "Available"}</p><p className={`pt-1 text-[11px] font-semibold text-emerald-700 ${bn ? "bn" : ""}`}>{bn ? TIME_BN[contact.time] ?? contact.time : contact.time}</p></div><div className="flex items-center justify-between gap-3 md:justify-end"><p className="whitespace-nowrap text-[22px] font-bold tabular-nums text-navy">{contact.number}</p><a href={`tel:${"tel" in contact && contact.tel ? contact.tel : contact.number}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#b91c1c] px-4 py-2.5 text-[12px] font-bold text-white hover:bg-red-800"><Phone className="size-3.5" />{bn ? "কল করুন" : "Call"}</a></div></div>)}</div></section>
        ))}
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-[10px] leading-4 text-sky-800"><Ambulance className="mr-1.5 inline size-3.5" /> <span className={bn ? "bn" : ""}>{bn ? "নম্বরগুলো অক্টোবর ২০২৬-এ সরকারি ও প্রতিষ্ঠানের উৎস থেকে যাচাই করা হয়েছে; সময় ও প্রাপ্যতা বদলাতে পারে। জীবন-বিপন্ন জরুরি অবস্থায় সর্বদা ৯৯৯ কল করুন।" : "Numbers were checked against official and organisation sources in October 2026; hours and availability can change. In a life-threatening emergency, call 999 immediately."}</span></div>
      </div>
    </div>
  );
}

