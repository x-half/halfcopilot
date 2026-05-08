#!/bin/bash
# HalfCopilot One-Line Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/halfcopilot/halfcopilot/main/install.sh | bash

set -e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║     HalfCopilot CLI Installer                   ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Detect OS
OS="$(uname -s)"
case "$OS" in
  Linux*)   OS="linux" ;;
  Darwin*)  OS="macos" ;;
  MSYS*|MINGW*) OS="windows" ;;
  *)        echo "Unknown OS: $OS"; exit 1 ;;
esac

echo "📦 Detected OS: $OS"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed."
    echo ""
    echo "Please install Node.js first:"
    echo "  https://nodejs.org/ (version 20+)"
    echo ""
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
echo "✅ Node.js $(node -v)"

if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 20+ is required. Current: $(node -v)"
    exit 1
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
fi
echo "✅ npm $(npm -v)"
echo ""

# Install HalfCopilot
echo "📦 Installing halfcopilot..."
echo ""

if command -v pnpm &> /dev/null; then
    echo "   Using pnpm..."
    pnpm add -g halfcopilot
else
    echo "   Using npm..."
    npm install -g halfcopilot
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║     Installation Complete! 🎉                   ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Get started:"
echo ""
echo "    halfcop              # Start interactive chat"
echo "    halfcop run \"prompt\"  # Run single prompt"
echo "    halfcop models       # List available models"
echo "    halfcop doctor       # Check configuration"
echo ""
echo "  Configure your API keys:"
echo ""
echo "    Edit ~/.halfcopilot/settings.json"
echo ""
