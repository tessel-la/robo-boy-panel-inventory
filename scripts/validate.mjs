import { readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const panelsRoot = resolve(projectRoot, "panels");
const capabilities = new Set([
  "ros",
  "storage",
  "network",
  "web-bluetooth",
  "web-usb",
  "web-serial",
  "camera",
  "microphone",
]);
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const idPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const isHttpsUrl = (value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const catalog = await readJson(resolve(projectRoot, "catalog.json"));
assert(catalog.schemaVersion === 1, "catalog.json must use schemaVersion 1.");
assert(
  Array.isArray(catalog.panels),
  "catalog.json must contain a panels array.",
);

const ids = new Set();
for (const relativePath of catalog.panels) {
  assert(
    typeof relativePath === "string",
    "Every catalog entry must be a relative JSON path.",
  );
  const path = resolve(projectRoot, relativePath);
  assert(
    path.startsWith(`${panelsRoot}${sep}`),
    `${relativePath} must resolve inside panels/.`,
  );
  const entry = await readJson(path);
  const label = relativePath;

  assert(entry.schemaVersion === 1, `${label}: schemaVersion must be 1.`);
  assert(idPattern.test(entry.id), `${label}: invalid panel ID.`);
  assert(!ids.has(entry.id), `${label}: duplicate panel ID ${entry.id}.`);
  ids.add(entry.id);
  assert(
    typeof entry.name === "string" && entry.name.trim(),
    `${label}: name is required.`,
  );
  assert(
    typeof entry.description === "string" && entry.description.trim(),
    `${label}: description is required.`,
  );
  assert(
    isHttpsUrl(entry.repository),
    `${label}: repository must be an HTTPS URL.`,
  );
  assert(
    entry.author &&
      typeof entry.author.name === "string" &&
      entry.author.name.trim(),
    `${label}: author.name is required.`,
  );
  assert(
    entry.latest && semverPattern.test(entry.latest.version),
    `${label}: latest.version must be SemVer.`,
  );
  assert(
    entry.latest.compatibility?.panelApi,
    `${label}: panel API compatibility is required.`,
  );
  assert(
    entry.latest.compatibility?.roboboy,
    `${label}: Robo-Boy compatibility is required.`,
  );
  assert(
    Array.isArray(entry.latest.capabilities),
    `${label}: capabilities must be an array.`,
  );
  assert(
    entry.latest.capabilities.every((capability) =>
      capabilities.has(capability),
    ),
    `${label}: unknown capability declaration.`,
  );
  assert(
    entry.latest.distribution?.type === "javascript-bundle",
    `${label}: unsupported distribution type.`,
  );
  assert(
    isHttpsUrl(entry.latest.distribution?.manifestUrl),
    `${label}: manifestUrl must be HTTPS.`,
  );
  assert(
    isHttpsUrl(entry.latest.distribution?.bundleUrl),
    `${label}: bundleUrl must be HTTPS.`,
  );
  assert(
    entry.latest.distribution?.entryPoint,
    `${label}: distribution entryPoint is required.`,
  );
}

console.log(
  `Validated ${ids.size} panel inventory entr${ids.size === 1 ? "y" : "ies"}.`,
);
