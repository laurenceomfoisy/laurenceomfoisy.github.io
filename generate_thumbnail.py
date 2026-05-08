#!/usr/bin/env python3
"""
Generate thumbnail from the first slide of a reveal.js presentation.

Single mode:  python generate_thumbnail.py <html_file> <output_image.png>
Batch mode:   python generate_thumbnail.py --batch
              Processes all known presentations and writes thumbnails to images/
"""

import sys
import os
from pathlib import Path
from playwright.sync_api import sync_playwright


# ── Batch configuration ──────────────────────────────────────────────────────
# Each entry: (html_path_relative_to_repo_root, output_png_in_images/)
PRESENTATIONS = [
    # Grid presentations
    ("presentation_t2c_maple_meth_2025/pres.html", "images/pres_t2c.png"),
    ("presentation_fonctions/pres.html", "images/pres_clessnize.png"),
    ("presentation_spsa2024/index.html", "images/pres_gpt_party.png"),
    ("presentation_github/git_github.html", "images/pres_git.png"),
    ("presentation_goa/index.html", "images/pres_goa.png"),
    (
        "presentation_eiom_2025_intro_r/eiom_2025_intro_r.html",
        "images/pres_intro_r.png",
    ),
    ("presentation_ollama/index.html", "images/pres_beyond.png"),
    ("presentation_retro/index.html", "images/pres_retro.png"),
    ("presentation_mpsa_2025/pres.html", "images/pres_mpsa_2025.png"),
    # Non-grid presentations (thumbnails generated for future use)
    ("presentation_automatisation/index.html", "images/pres_automatisation.png"),
    ("presentation_zotero_mq/index.html", "images/pres_zotero.png"),
    ("presentation_intro_r/index.html", "images/pres_intro_r_clessn.png"),
    (
        "presentation_capsules_intro_r/intro_r/pres.html",
        "images/pres_capsules_intro_r.png",
    ),
    (
        "presentation_capsules_intro_r/analyses_r/pres.html",
        "images/pres_capsules_analyses_r.png",
    ),
]


def generate_thumbnail(html_path, output_path, width=1920, height=1080):
    """
    Generate a thumbnail from the first slide of a reveal.js presentation.

    Args:
        html_path: Path to the HTML file
        output_path: Path where to save the thumbnail PNG
        width: Screenshot width in pixels (default: 1920)
        height: Screenshot height in pixels (default: 1080)
    """
    # Convert to absolute paths
    html_path = Path(html_path).resolve()
    output_path = Path(output_path).resolve()

    # Ensure output directory exists
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Check if input file exists
    if not html_path.exists():
        print(f"Error: HTML file not found: {html_path}", file=sys.stderr)
        sys.exit(1)

    # Use file:// URL for local files
    url = f"file://{html_path}"

    print(f"Generating thumbnail from: {html_path}")
    print(f"Output will be saved to: {output_path}")

    with sync_playwright() as p:
        # Launch browser in headless mode
        browser = p.chromium.launch(headless=True)

        # Create a new page with specified viewport
        page = browser.new_page(viewport={"width": width, "height": height})

        try:
            # Navigate to the presentation
            page.goto(url, wait_until="networkidle")

            # Wait for reveal.js to initialize
            page.wait_for_selector(".reveal .slides", timeout=10000)

            # Additional wait to ensure fonts and images are loaded
            page.wait_for_timeout(1000)

            # Full viewport at 1920×1080 — reveal.js margin creates natural
            # breathing room around the slide, matching the fullscreen browser view
            page.screenshot(path=str(output_path))

            print(f"✓ Thumbnail generated successfully: {output_path}")

        except Exception as e:
            print(f"Error generating thumbnail: {e}", file=sys.stderr)
            sys.exit(1)
        finally:
            browser.close()


def batch_generate(repo_root=None):
    """Generate thumbnails for all known presentations."""
    if repo_root is None:
        repo_root = Path(__file__).resolve().parent

    repo_root = Path(repo_root)
    errors = []

    for html_rel, output_rel in PRESENTATIONS:
        html_path = repo_root / html_rel
        output_path = repo_root / output_rel

        if not html_path.exists():
            print(f"  SKIP (not found): {html_rel}", file=sys.stderr)
            errors.append(html_rel)
            continue

        output_path.parent.mkdir(parents=True, exist_ok=True)
        url = f"file://{html_path}"

        print(f"\n→ {html_rel}")
        print(f"  Output: {output_rel}")

        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1920, "height": 1080})
            try:
                page.goto(url, wait_until="networkidle")
                page.wait_for_selector(".reveal .slides", timeout=10000)
                page.wait_for_timeout(1000)
                page.screenshot(path=str(output_path))
                print(f"  ✓ {output_path.name}")
            except Exception as e:
                print(f"  ✗ Error: {e}", file=sys.stderr)
                errors.append(html_rel)
            finally:
                browser.close()

    print(f"\n{'─' * 60}")
    print(
        f"Batch complete: {len(PRESENTATIONS) - len(errors)}/{len(PRESENTATIONS)} thumbnails generated."
    )
    if errors:
        print("Failed:")
        for e in errors:
            print(f"  - {e}")


def main():
    if len(sys.argv) == 2 and sys.argv[1] == "--batch":
        batch_generate()
        return

    if len(sys.argv) != 3:
        print("Usage:", file=sys.stderr)
        print(
            "  Single:  generate_thumbnail.py <html_file> <output_image.png>",
            file=sys.stderr,
        )
        print("  Batch:   generate_thumbnail.py --batch", file=sys.stderr)
        print("\nExample:", file=sys.stderr)
        print(
            "  generate_thumbnail.py presentation_spsa2024/index.html images/pres_gpt_party.png",
            file=sys.stderr,
        )
        sys.exit(1)

    html_file = sys.argv[1]
    output_file = sys.argv[2]

    generate_thumbnail(html_file, output_file)


if __name__ == "__main__":
    main()
