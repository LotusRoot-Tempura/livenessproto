import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const packageJsonPath = path.resolve(process.cwd(), "package.json");
const appVersionPath = path.resolve(process.cwd(), "src/lib/appVersion.ts");
const trackedRoots = ["src", "public", "scripts"];
const trackedFiles = ["next.config.ts", "tsconfig.json"];
const excludedRelativePaths = new Set(["src/lib/appVersion.ts"]);

function getTrackedFilePaths() {
  const files = [];

  for (const root of trackedRoots) {
    const absoluteRoot = path.resolve(process.cwd(), root);
    if (!fs.existsSync(absoluteRoot)) continue;
    walkDirectory(absoluteRoot, files);
  }

  for (const file of trackedFiles) {
    const absoluteFile = path.resolve(process.cwd(), file);
    if (fs.existsSync(absoluteFile)) {
      files.push(absoluteFile);
    }
  }

  return files.sort();
}

function walkDirectory(directoryPath, files) {
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const absoluteEntryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      walkDirectory(absoluteEntryPath, files);
      continue;
    }

    files.push(absoluteEntryPath);
  }
}

function getSourceSignature() {
  const hash = crypto.createHash("sha256");
  const filePaths = getTrackedFilePaths();

  for (const filePath of filePaths) {
    const relativePath = path.relative(process.cwd(), filePath).replaceAll("\\", "/");
    if (excludedRelativePaths.has(relativePath)) continue;
    hash.update(relativePath);
    hash.update("\n");
    hash.update(fs.readFileSync(filePath));
    hash.update("\n");
  }

  return hash.digest("hex");
}

function readStoredSignature() {
  if (!fs.existsSync(appVersionPath)) return null;

  const content = fs.readFileSync(appVersionPath, "utf8");
  const match = content.match(/APP_SOURCE_SIGNATURE = "([a-f0-9]+)"/);
  return match?.[1] ?? null;
}

function getNextVersion(currentVersion) {
  const parts = String(currentVersion ?? "0.1.20")
    .split(".")
    .map((value) => Number.parseInt(value, 10));

  if (parts.length !== 3 || parts.some((value) => Number.isNaN(value))) {
    throw new Error(`Unsupported version format: ${currentVersion}`);
  }

  parts[2] += 1;
  return parts.join(".");
}

function writeAppVersionFile(version, updatedAt, signature) {
  const lines = [
    `export const APP_VERSION = "${version}";`,
    `export const APP_VERSION_UPDATED_AT = "${updatedAt}";`,
    `export const APP_SOURCE_SIGNATURE = "${signature}";`,
    "",
  ];

  fs.writeFileSync(appVersionPath, lines.join("\n"), "utf8");
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
const nextSignature = getSourceSignature();
const currentSignature = readStoredSignature();

if (currentSignature === nextSignature) {
  const updatedAt = new Date().toISOString();
  writeAppVersionFile(String(packageJson.version ?? "0.1.20"), updatedAt, nextSignature);
  console.log(`Version unchanged at ${packageJson.version}`);
  process.exit(0);
}

const nextVersion = getNextVersion(packageJson.version);
const updatedAt = new Date().toISOString();

packageJson.version = nextVersion;

fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
writeAppVersionFile(nextVersion, updatedAt, nextSignature);
console.log(`Version bumped to ${nextVersion}`);
