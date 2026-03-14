const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const { URL } = require("url");

const repository = process.env.GITHUB_REPO;
const version = process.env.VERSION;
const file = process.env.FILE;
const changelog = process.env.CHANGELOG || `See the full changelog at [GitHub](https://github.com/${repository}/releases/tag/v${version})`;
const targetAbi = "10.11.0.0";

if (!repository || !version || !file) {
  console.error("Missing required environment variables: GITHUB_REPO, VERSION, FILE");
  process.exit(1);
}

console.log(`Updating manifest for ${version} with file ${file}`);

// Read manifest.json
const manifestPath = "./manifest.json";
if (!fs.existsSync(manifestPath)) {
  console.error("manifest.json file not found");
  process.exit(1);
}

const jsonData = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

const newVersion = {
  version,
  changelog,
  targetAbi,
  sourceUrl: `https://github.com/${repository}/releases/download/v${version}/${file}`,
  checksum: getMD5FromFile(),
  timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
};

async function updateManifest() {
  console.log(`Validating version ${version}...`);

  // Add the new version to the manifest (prepend to versions array)
  jsonData[0].versions.unshift(newVersion);

  // Write the updated manifest to file
  fs.writeFileSync(manifestPath, JSON.stringify(jsonData, null, 2) + "\n");
  console.log("Manifest updated successfully.");
  console.log(`New version entry:`, JSON.stringify(newVersion, null, 2));
  process.exit(0);
}

function getMD5FromFile() {
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }
  const fileBuffer = fs.readFileSync(file);
  return crypto.createHash("md5").update(fileBuffer).digest("hex");
}

updateManifest();
