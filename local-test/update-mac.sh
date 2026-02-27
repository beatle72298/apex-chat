#!/bin/bash
# update-apex.sh

REPO="beatle72298/apex-chat"
API_URL="https://api.github.com/repos/$REPO/releases/latest"

# Detect architecture
ARCH=$(uname -m)
if [ "$ARCH" == "x86_64" ]; then
    ARCH_TAG="x64"
else
    ARCH_TAG="arm64"
fi

echo "Checking for latest macOS ($ARCH_TAG) release..."
RELEASE_JSON=$(curl -s $API_URL)
DOWNLOAD_URL=$(echo "$RELEASE_JSON" | grep -o "https://github.com/[^\"]*/releases/download/[^\"]*ApexChat-Mac-[^\"]*${ARCH_TAG}.pkg" | head -n 1)

if [ -n "$DOWNLOAD_URL" ]; then
    FILE_NAME=$(basename "$DOWNLOAD_URL")
    echo "Found $FILE_NAME. Downloading..."
    curl -L "$DOWNLOAD_URL" -o "$FILE_NAME"
    echo "Download complete. Opening installer..."
    open "$FILE_NAME"
else
    echo "No matching macOS installer found."
fi
