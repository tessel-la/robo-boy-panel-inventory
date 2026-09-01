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
const integrityPattern = /^sha256-[A-Za-z0-9+/]{43}=$/;
const rosResourcePattern = /^\/[A-Za-z0-9_~{}*][A-Za-z0-9_~{}/*-]*$/;
const hostEndpoints = new Set(["videoStream"]);

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
const isUniqueStringArray = (value, validator, maxItems = 100) =>
  Array.isArray(value) &&
  value.length <= maxItems &&
  new Set(value).size === value.length &&
  value.every((item) => typeof item === "string" && validator(item));
const hasOnlyKeys = (value, allowed) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => allowed.has(key));

const validatePermissions = (entry, label) => {
  const declared = new Set(entry.latest.capabilities);
  const permissions = entry.latest.permissions;
  assert(
    permissions === undefined ||
      hasOnlyKeys(permissions, new Set(["ros", "network"])),
    `${label}: permissions may contain only ros and network grants.`,
  );

  if (declared.has("ros")) {
    const ros = permissions?.ros;
    assert(
      hasOnlyKeys(
        ros,
        new Set(["discover", "selectTopic", "subscribe", "publish", "services"]),
      ),
      `${label}: the ros capability requires explicit ROS permissions.`,
    );
    assert(
      ros.discover === undefined || typeof ros.discover === "boolean",
      `${label}: permissions.ros.discover must be boolean.`,
    );
    assert(
      ros.selectTopic === undefined || typeof ros.selectTopic === "boolean",
      `${label}: permissions.ros.selectTopic must be boolean.`,
    );
    for (const key of ["subscribe", "publish", "services"]) {
      assert(
        ros[key] === undefined ||
          isUniqueStringArray(ros[key], (resource) => rosResourcePattern.test(resource)),
        `${label}: permissions.ros.${key} contains an invalid ROS resource pattern.`,
      );
    }
  } else {
    assert(
      permissions?.ros === undefined,
      `${label}: ROS permissions require the ros capability.`,
    );
  }

  if (declared.has("network")) {
    const network = permissions?.network;
    assert(
      hasOnlyKeys(network, new Set(["origins", "hostEndpoints"])),
      `${label}: the network capability requires explicit network permissions.`,
    );
    assert(
      network.origins === undefined ||
        isUniqueStringArray(
          network.origins,
          (origin) => {
            if (origin === "self" || origin === "https:") return true;
            try {
              const url = new URL(origin);
              return url.protocol === "https:" && url.origin === origin;
            } catch {
              return false;
            }
          },
          30,
        ),
      `${label}: permissions.network.origins contains an invalid HTTPS origin.`,
    );
    assert(
      network.hostEndpoints === undefined ||
        isUniqueStringArray(
          network.hostEndpoints,
          (endpoint) => hostEndpoints.has(endpoint),
          hostEndpoints.size,
        ),
      `${label}: permissions.network.hostEndpoints contains an unknown endpoint.`,
    );
  } else {
    assert(
      permissions?.network === undefined,
      `${label}: network permissions require the network capability.`,
    );
  }
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
  validatePermissions(entry, label);
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
  assert(
    integrityPattern.test(entry.latest.distribution?.integrity),
    `${label}: distribution integrity must be a SHA-256 SRI value.`,
  );
  assert(
    new URL(entry.latest.distribution.bundleUrl).pathname
      .split("/")
      .some(
        (segment) =>
          segment === entry.latest.version ||
          segment === `v${entry.latest.version}`,
      ),
    `${label}: bundleUrl must identify the immutable release version.`,
  );
}

console.log(
  `Validated ${ids.size} panel inventory entr${ids.size === 1 ? "y" : "ies"}.`,
);
