#!/bin/bash
# Usage: bash generate_pdf.sh <url_or_file_path> <output_pdf_path>
# Example: bash generate_pdf.sh "http://localhost:9191/manual.html" "/Users/higormanoel/Desktop/Motions/COM IA/Manual_da_Marca_brand.pdf"

set -e

URL="$1"
OUTPUT="$2"

if [[ -z "$URL" || -z "$OUTPUT" ]]; then
  echo "Usage: bash generate_pdf.sh <url> <output_pdf_path>"
  exit 1
fi

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if [[ ! -f "$CHROME" ]]; then
  echo "Chrome not found at: $CHROME"
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"

"$CHROME" \
  --headless=new \
  --print-to-pdf="$OUTPUT" \
  --print-to-pdf-no-header \
  --no-margins \
  --no-sandbox \
  "$URL" 2>&1 | grep -v "^$" | tail -3

if [[ -f "$OUTPUT" ]]; then
  SIZE=$(du -h "$OUTPUT" | cut -f1)
  echo "PDF saved: $OUTPUT ($SIZE)"
else
  echo "ERROR: PDF was not created."
  exit 1
fi
