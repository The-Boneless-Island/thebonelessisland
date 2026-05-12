const fs = require("fs");
const path = "c:/Code/GitHub/thebonelessisland/apps/api/src/lib/generalNewsIngestion.ts";
let content = fs.readFileSync(path, "utf8");

const startMarker = "  const raw = result.text.trim();";
const endMarker = "  const parsed = JSON.parse(jsonText) as GeneralCurationResult[];";
const start = content.indexOf(startMarker);
if (start < 0) {
  console.error("start marker not found");
  process.exit(1);
}
const end = content.indexOf(endMarker, start);
if (end < 0) {
  console.error("end marker not found");
  process.exit(1);
}
const endFull = end + endMarker.length;

const fence = String.fromCharCode(96); // backtick
const tripleFence = fence + fence + fence;

const newBlock =
  "  const raw = result.text.trim();\n" +
  "  const jsonText = raw.startsWith(\"" + tripleFence + "\")\n" +
  "    ? raw.replace(/^" + tripleFence + "(?:json)?\\n?/, \"\").replace(/\\n?" + tripleFence + "$/, \"\")\n" +
  "    : raw;\n" +
  "  const parsed = parseAiJsonArray(jsonText) as GeneralCurationResult[];";

content = content.slice(0, start) + newBlock + content.slice(endFull);
fs.writeFileSync(path, content);
console.log("replaced", end - start, "bytes with", newBlock.length);
