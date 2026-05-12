import { loadSettings } from "../src/lib/serverSettings.js";
import { curateUncuratedGeneralNews } from "../src/lib/generalNewsIngestion.js";
import { db } from "../src/db/client.js";

async function main() {
  await loadSettings();
  let total = 0;
  let zeroPasses = 0;
  for (let pass = 1; pass <= 60; pass++) {
    const { rows } = await db.query("SELECT 1 FROM general_news WHERE ai_curated_at IS NULL LIMIT 1");
    if (rows.length === 0) {
      console.log(`[drain] queue empty after pass ${pass - 1}`);
      break;
    }
    const n = await curateUncuratedGeneralNews();
    total += n;
    console.log(`[drain] pass ${pass} → ${n} curated (running total: ${total})`);
    if (n === 0) {
      zeroPasses++;
      if (zeroPasses >= 3) {
        console.log("[drain] 3 consecutive zero passes — stopping");
        break;
      }
      console.log(`[drain] zero pass (${zeroPasses}/3) — continuing`);
    } else {
      zeroPasses = 0;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`[drain] complete: ${total} curated`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[drain] fatal:", err);
    process.exit(1);
  });
