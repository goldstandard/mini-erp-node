const fs = require('fs');
const path = require('path');

function parseEnvLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const equalsIndex = trimmed.indexOf('=');
  if (equalsIndex <= 0) return null;

  const key = trimmed.slice(0, equalsIndex).trim();
  if (!key) return null;

  let value = trimmed.slice(equalsIndex + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function loadEnvFiles(options = {}) {
  const {
    projectRoot = path.join(__dirname, '..', '..', '..'),
    fileNames = ['.env', '.env.local']
  } = options;

  for (const fileName of fileNames) {
    const filePath = path.join(projectRoot, fileName);
    if (!fs.existsSync(filePath)) continue;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;

      // Keep existing process/env values authoritative (Azure App Settings, shell env, etc.)
      if (process.env[parsed.key] === undefined) {
        process.env[parsed.key] = parsed.value;
      }
    }
  }
}

module.exports = {
  loadEnvFiles
};
