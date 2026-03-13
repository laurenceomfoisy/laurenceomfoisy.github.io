#!/bin/bash
# Wrapper script for generate_thumbnail.py
# Usage: ./generate_thumbnail.sh <html_file> <output_image.png>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_SCRIPT="$SCRIPT_DIR/generate_thumbnail.py"

# Check if Python script exists
if [ ! -f "$PYTHON_SCRIPT" ]; then
    echo "Error: Python script not found at $PYTHON_SCRIPT" >&2
    exit 1
fi

# Check if correct number of arguments
if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <html_file> <output_image.png>" >&2
    echo "" >&2
    echo "Example:" >&2
    echo "  $0 1_introduction/cours_1_intro.html thumbnails/intro.png" >&2
    exit 1
fi

# Run the Python script
python3 "$PYTHON_SCRIPT" "$1" "$2"
