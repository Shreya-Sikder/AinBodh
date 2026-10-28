import { supabase } from "./supabase";

async function test() {
  const { data, error } = await supabase
    .from("legal_metadata")
    .select("*")
    .limit(1);

  if (error) {
    console.error("❌ Supabase connection failed:");
    console.error(error);
    process.exit(1);
  }

  console.log("✅ Supabase connected!");
  console.log("Sample record:");
  console.log(data);
}

test();