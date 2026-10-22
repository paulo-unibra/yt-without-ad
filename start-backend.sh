#!/bin/bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/backend"

node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (!((major === 22 && minor >= 13) || (major === 24 && minor >= 3) || major >= 26)) {
    console.error("Use Node.js 22.13+ (execute nvm use na raiz do projeto).");
    process.exit(1);
  }
'

echo "🚀 Starting YT Stream Backend..."

if ! npm ls --omit=dev --depth=0 >/dev/null 2>&1; then
  echo "📦 Installing dependencies..."
  npm ci
fi

exec npm start
