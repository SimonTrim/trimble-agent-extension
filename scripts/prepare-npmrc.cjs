const fs = require("fs");
const path = require("path");

const target = path.join(process.cwd(), ".npmrc");
const token = process.env.TRIMBLE_ARTIFACTORY_TOKEN?.trim();

if (!token) {
  throw new Error("TRIMBLE_ARTIFACTORY_TOKEN is required to install Trimble Agent Studio packages.");
}

fs.writeFileSync(
  target,
  [
    "registry=https://registry.npmjs.org/",
    "",
    "@trimble-agentic-external-npm-local:registry=https://artifactory.trimble.tools/artifactory/api/npm/trimble-agentic-external-npm-local/",
    `//artifactory.trimble.tools/artifactory/api/npm/trimble-agentic-external-npm-local/:_authToken=${token}`,
    "",
  ].join("\n")
);
