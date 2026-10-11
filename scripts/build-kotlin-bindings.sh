#!/usr/bin/env bash
set -euo pipefail

# Build the mocha-core native library and generate Kotlin UniFFI bindings.
#
# Prerequisites:
#   cargo install uniffi-bindgen-cli
#
# This script:
# 1. Builds mocha-core as a cdylib (shared library)
# 2. Generates Kotlin sources via uniffi-bindgen
# 3. Copies them into the Kotlin project

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/.."

echo ">>> Building mocha-core (release)..."
cargo build -p mocha-core --release --manifest-path "$ROOT/Cargo.toml"

LIB_PATH="$ROOT/target/release/libmocha_core.dylib"
if [[ ! -f "$LIB_PATH" ]]; then
    # Linux
    LIB_PATH="$ROOT/target/release/libmocha_core.so"
fi

echo ">>> Generating Kotlin bindings..."
KOTLIN_OUT="$ROOT/kotlin/mocha-chat/src/main/kotlin"
uniffi-bindgen generate \
    --library "$LIB_PATH" \
    --language kotlin \
    --out-dir "$KOTLIN_OUT"

echo ">>> Done! Kotlin sources at: $KOTLIN_OUT"
echo ""
echo "To run the Kotlin chat:"
echo "  cd $ROOT/kotlin/mocha-chat"
echo "  ./gradlew run --args='--room general --nick bob'"
