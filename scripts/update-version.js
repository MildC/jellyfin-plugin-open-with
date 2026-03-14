const fs = require("fs");

const VERSION = process.env.VERSION;

if (!VERSION) {
  console.error("VERSION environment variable not set");
  process.exit(1);
}

// Read csproj
const csprojPath = "./Jellyfin.Plugin.OpenWith.csproj";
if (!fs.existsSync(csprojPath)) {
  console.error("Jellyfin.Plugin.OpenWith.csproj file not found");
  process.exit(1);
}

// Read the .csproj file
fs.readFile(csprojPath, "utf8", (err, data) => {
  if (err) {
    return console.error("Failed to read .csproj file:", err);
  }

  // Use regex to replace versions
  const updatedData = data
    .replace(/<AssemblyVersion>.*?<\/AssemblyVersion>/, `<AssemblyVersion>${VERSION}</AssemblyVersion>`)
    .replace(/<FileVersion>.*?<\/FileVersion>/, `<FileVersion>${VERSION}</FileVersion>`);

  // Write the updated XML back to the .csproj file
  fs.writeFile(csprojPath, updatedData, "utf8", (err) => {
    if (err) {
      return console.error("Failed to write .csproj file:", err);
    }
    console.log(`Version updated to ${VERSION} successfully!`);
  });
});
