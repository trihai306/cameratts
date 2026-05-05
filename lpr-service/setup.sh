#!/bin/bash
# Setup script for TTS Camera LPR Service v2.0 (Vietnamese Plate Recognition)
# Run: chmod +x setup.sh && ./setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  TTS Camera LPR Service v2.0 Setup"
echo "  Vietnamese Plate Recognition"
echo "=========================================="

# Check Python version
PYTHON_CMD=""
for cmd in python3.12 python3.11 python3.10 python3; do
    if command -v "$cmd" &> /dev/null; then
        version=$("$cmd" --version 2>&1 | awk '{print $2}')
        major=$(echo "$version" | cut -d. -f1)
        minor=$(echo "$version" | cut -d. -f2)
        if [ "$major" -eq 3 ] && [ "$minor" -ge 9 ] && [ "$minor" -le 12 ]; then
            PYTHON_CMD="$cmd"
            break
        fi
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    echo "ERROR: Python 3.9-3.12 required (PaddleOCR compatibility)"
    echo "Install: brew install python@3.12"
    exit 1
fi

echo "Using: $PYTHON_CMD ($($PYTHON_CMD --version))"

# Create virtual environment
if [ ! -d "venv" ]; then
    echo ""
    echo ">> Creating virtual environment..."
    $PYTHON_CMD -m venv venv
fi

# Activate venv
source venv/bin/activate

# Upgrade pip
echo ""
echo ">> Upgrading pip..."
pip install --upgrade pip setuptools wheel

# Install dependencies
echo ""
echo ">> Installing dependencies (this may take a few minutes)..."
pip install -r requirements.txt

# Verify installation
echo ""
echo ">> Verifying installation..."
python -c "
import sys
print(f'Python: {sys.version}')

try:
    from ultralytics import YOLO
    print('  YOLO (ultralytics): OK')
except ImportError as e:
    print(f'  YOLO: FAILED - {e}')

try:
    from paddleocr import PaddleOCR
    print('  PaddleOCR: OK')
except ImportError as e:
    print(f'  PaddleOCR: FAILED - {e}')

try:
    from fastapi import FastAPI
    print('  FastAPI: OK')
except ImportError as e:
    print(f'  FastAPI: FAILED - {e}')

try:
    from vn_plate_validator import format_plate, parse_vietnamese_plate
    result = parse_vietnamese_plate('30A12345')
    assert result is not None
    assert result['formatted'] == '30A-123.45'
    print('  VN Plate Validator: OK')
except Exception as e:
    print(f'  VN Plate Validator: FAILED - {e}')

print()
print('All checks passed! Run: python server.py')
"

echo ""
echo "=========================================="
echo "  Setup complete!"
echo "  Start server: cd lpr-service && source venv/bin/activate && python server.py"
echo "=========================================="
