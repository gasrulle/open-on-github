const { name, version } = require("../package.json");
const { execSync } = require("child_process");

const outFile = `${name}-${version}.vsix`;
console.log(`Packaging ${outFile}...`);
execSync(`npx vsce package -o ${outFile}`, { stdio: "inherit" });
