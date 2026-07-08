#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
OUTPUT_DIR="${REPO_ROOT}/.transformed-docs"

echo "=== CI/CD Action Documentation Sync - Local Test ==="
echo ""
echo "Repository root: ${REPO_ROOT}"
echo "Output directory: ${OUTPUT_DIR}"
echo ""

if [ -d "${OUTPUT_DIR}" ]; then
  echo "Cleaning existing output directory..."
  rm -rf "${OUTPUT_DIR}"
fi

VENV_DIR="${SCRIPT_DIR}/.venv"

if [ ! -d "${VENV_DIR}" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv "${VENV_DIR}"
fi

echo "Installing dependencies..."
"${VENV_DIR}/bin/pip" install -q -r "${SCRIPT_DIR}/requirements.txt"

echo ""
echo "Running transformations..."
"${VENV_DIR}/bin/python" "${SCRIPT_DIR}/apply-transformations.py" \
  "${REPO_ROOT}" \
  "${SCRIPT_DIR}/transformations.yaml" \
  "${OUTPUT_DIR}"

echo ""
echo "=== Transformation complete ==="
echo ""
echo "Generated files:"
find "${OUTPUT_DIR}" -name '*.md' -type f | while read -r file; do
  lines=$(wc -l < "$file")
  echo "  - $file ($lines lines)"
done

echo ""
echo "Review the transformed documentation in: ${OUTPUT_DIR}"
echo "To clean up: rm -rf ${OUTPUT_DIR} ${VENV_DIR}"
