const fs = require("fs");
const path = require("path");

const source = path.join(process.cwd(), "npmrc.vercel");
const target = path.join(process.cwd(), ".npmrc");

if (!process.env.TRIMBLE_ARTIFACTORY_TOKEN) {
  throw new Error("TRIMBLE_ARTIFACTORY_TOKEN is required to install Trimble Agent Studio packages.");
}

fs.copyFileSync(source, target);
