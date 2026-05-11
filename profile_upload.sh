#!/bin/bash
# Profile script for upload endpoints

ETTM1="/home/crispy/edatime/ETTm1.csv"
BASE="http://127.0.0.1:3000"

echo "=== Testing preview ==="
curl -s -X POST "$BASE/api/upload/preview" \
  -F "file=@$ETTM1" \
  -w "\nHTTP Status: %{http_code}\n" | head -c 500

echo -e "\n\n=== Testing full ingest ==="
curl -s -X POST "$BASE/api/upload" \
  -F "file=@$ETTM1" \
  -w "\nHTTP Status: %{http_code}\n"

echo -e "\n\n=== Testing partial ingest (n_rows=10000) ==="
curl -s -X POST "$BASE/api/upload" \
  -F "file=@$ETTM1" \
  -F "n_rows=10000" \
  -w "\nHTTP Status: %{http_code}\n"