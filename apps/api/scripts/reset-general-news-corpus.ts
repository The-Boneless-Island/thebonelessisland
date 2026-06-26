import { loadSettings } from "../src/lib/serverSettings.js";
import { ingestAndCurateGeneralNews } from "../src/lib/generalNewsIngestion.js";
import {
  CORPUS_RESET_CONFIRM_PHRASE,
  resetGeneralNewsCorpus
} from "../src/lib/news/newsCorpusReset.js";

async function main() {
  const args = new Set(process.argv.slice(2));
  if (!args.has("--confirm")) {
    console.error(
      `[reset-corpus] Refusing to run without --confirm. This deletes every general_news row.`
    );
    console.error(`[reset-corpus] Example: tsx scripts/reset-general-news-corpus.ts --confirm --ingest`);
    process.exit(1);
  }

  await loadSettings();
  console.log(`[reset-corpus] wiping general news corpus (${CORPUS_RESET_CONFIRM_PHRASE})…`);
  const result = await resetGeneralNewsCorpus();
  console.log("[reset-corpus] done:", result);

  if (args.has("--ingest")) {
    console.log("[reset-corpus] running fresh ingest + curation pass…");
    const ingest = await ingestAndCurateGeneralNews(true);
    console.log("[reset-corpus] ingest:", ingest);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("[reset-corpus] fatal:", err);
  process.exit(1);
});
