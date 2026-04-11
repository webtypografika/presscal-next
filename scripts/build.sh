#!/usr/bin/env bash
# build.sh — Build Next.js outside Dropbox to avoid AsyncLocalStorage corruption
# Dropbox's file-system filter driver on Windows breaks Node.js AsyncLocalStorage
# context propagation in build workers, causing "Expected workStore to be initialized"
# errors during static page generation. This script builds in a temp directory.

set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${TEMP:-/tmp}/presscal-next-build"

echo "[build] Cleaning previous build..."
rm -rf "$BUILD_DIR" 2>/dev/null || true
mkdir -p "$BUILD_DIR"

echo "[build] Copying project to $BUILD_DIR..."
# Copy everything except .next, node_modules, .git
for item in "$PROJECT_DIR"/*; do
  name=$(basename "$item")
  case "$name" in
    .next|node_modules|.git) continue ;;
    *) cp -r "$item" "$BUILD_DIR/" 2>/dev/null || true ;;
  esac
done

# Copy dotfiles
for item in "$PROJECT_DIR"/.[!.]*; do
  name=$(basename "$item")
  case "$name" in
    .next|.git) continue ;;
    *) cp -r "$item" "$BUILD_DIR/" 2>/dev/null || true ;;
  esac
done

echo "[build] Installing dependencies..."
cd "$BUILD_DIR"
npm install --prefer-offline 2>&1 | tail -3

echo "[build] Generating Prisma client..."
npx prisma generate 2>&1 | tail -2

echo "[build] Running next build..."
npx next build

echo "[build] Copying .next back to project..."
rm -rf "$PROJECT_DIR/.next" 2>/dev/null || true
cp -r "$BUILD_DIR/.next" "$PROJECT_DIR/.next"

echo "[build] Cleaning up..."
rm -rf "$BUILD_DIR"

echo "[build] Done! Build output is in $PROJECT_DIR/.next"
