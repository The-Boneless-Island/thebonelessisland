import { loadSettings } from "../src/lib/serverSettings.js";
import { curateUncuratedGeneralNews } from "../src/lib/generalNewsIngestion.js";

async function main() {
  await loadSettings();
  console.log("[diag] Running curateUncuratedGeneralNews...");
  try {
    const n = await curateUncuratedGeneralNews();
    console.log("[diag] Result:", n);
  } catch (e) {
    console.error("[diag] Threw:", e instanceof Error ? e.message : String(e));
    if (e instanceof Error && e.stack) console.error(e.stack);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[diag] fatal:", err);
    process.exit(1);
  });
