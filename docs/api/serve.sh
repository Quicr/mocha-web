#!/usr/bin/env bash
# Serve the Mocha API reference locally.
# Usage: ./serve.sh [port]   (default port: 4000)

set -e
PORT=${1:-4000}
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Mocha API Reference — http://localhost:$PORT"
echo "UDL source: $DIR/mocha.udl"
echo ""

# Prefer npx serve; fall back to Python
if command -v npx &>/dev/null; then
  npx serve "$DIR" --listen "$PORT" --no-clipboard
elif command -v python3 &>/dev/null; then
  cd "$DIR" && python3 -m http.server "$PORT"
else
  echo "Error: neither npx nor python3 found. Install Node.js or Python 3."
  exit 1
fi
