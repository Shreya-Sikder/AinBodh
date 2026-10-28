/* Run: npx tsx src/conversation.test.ts */
import { classifyTurn, resolveAnswerLanguage, detectEmotionalWeight, socialReply, isBanglish } from "./conversation";
const cases: Array<[string, string]> = [
  ["hi","greeting"],["Hello!","greeting"],["hey there 👋","greeting"],["Assalamu Alaikum","greeting"],["আসসালামু আলাইকুম","greeting"],["হ্যালো","greeting"],
  ["thanks","thanks"],["Thank you so much!","thanks"],["dhonnobad","thanks"],["অনেক ধন্যবাদ","thanks"],["ধন্যবাদ ভাই","thanks"],["thanks, bye","goodbye"],["ok thanks","thanks"],
  ["bye","goodbye"],["Allah hafez","goodbye"],["ok","acknowledgement"],["কেমন আছেন?","how_are_you"],["who are you","identity"],
  ["hi, my landlord won't return my deposit","legal"],["thanks but what about section 25?","legal"],["Hi I need help","legal"],["hello amar bariwala vara barachhe","legal"],
];
let fail=0;
for (const [q,want] of cases){const got=classifyTurn(q); if(got!==want){fail++;console.log("FAIL",q,got,"want",want);}}
const lang: Array<[string, any, string]> = [["what is the punishment for theft","en","en"],["what is the punishment for theft","bn","bn"],["amar bariwala vara barachhe ki korbo","en","bn"],["আমার বাড়িওয়ালা","en","bn"],["hi","en","en"],["please answer in English: ভাড়া","bn","en"],["I need help with a problem at work","en","en"]];
for (const [q,app,want] of lang){const got=resolveAnswerLanguage(q,app); if(got!==want){fail++;console.log("LANG FAIL",q,app,got);}}
if(!detectEmotionalWeight("I am so scared, I can't sleep").heavy) {fail++;console.log("distress fail");}
if(detectEmotionalWeight("What is section 13 of the rent act").heavy) {fail++;console.log("distress false pos");}
if(!detectEmotionalWeight("আমি খুব ভয় পাচ্ছি").heavy) {fail++;console.log("bn distress fail");}
console.log(socialReply("greeting","hi","en",false)); console.log(socialReply("thanks","dhonnobad","bn",true));
if (fail) { console.error(`${fail} failures`); process.exit(1); } console.log("conversation tests passed");
