#!/usr/bin/env python3
"""
Whole-book extractor for the book-indexing pipeline.

Unlike extract.py (built for short question papers), a book can be hundreds of
pages, so the result is written to <output_dir>/book.json instead of stdout,
and pages are never rasterized. For every page it returns the text lines with
their font size and boldness (the signal heading detection runs on), embedded
images with their position, and tables. It also returns the PDF's bookmark
outline, which is the most reliable chapter/section structure when present.

Usage:
    python extract_book.py <input.pdf> <output_dir> [--no-tables] [--min-text-chars 40]

Prints {"path": "<output_dir>/book.json"} to stdout on success. On failure,
prints {"error": "..."} to stderr and exits non-zero.
"""
import sys
import os
import json
import argparse
import io
import contextlib

import pymupdf as fitz

# Images smaller than this on the page (in points) are bullets, icons and rules, not figures.
MIN_IMAGE_SIDE = 40
BOLD_FLAG = 16
MONO_FLAG = 8
BOLD_FONT_HINTS = ("bold", "black", "heavy", "semibold", "demi")
MONO_FONT_HINTS = ("mono", "courier", "consola", "menlo", "code", "cmtt", "lmmono", "inconsolata", "typewriter", "fixed")


def line_style(line):
    """Character-weighted font size, and whether the line is mostly bold and mostly monospace (code)."""
    total = 0
    size_sum = 0.0
    bold_chars = 0
    mono_chars = 0
    for span in line.get("spans", []):
        n = len(span.get("text", "").strip())
        if n == 0:
            continue
        total += n
        size_sum += span.get("size", 0) * n
        font = (span.get("font") or "").lower()
        flags = span.get("flags", 0)
        if flags & BOLD_FLAG or any(h in font for h in BOLD_FONT_HINTS):
            bold_chars += n
        if flags & MONO_FLAG or any(h in font for h in MONO_FONT_HINTS):
            mono_chars += n
    if total == 0:
        return None
    return round(size_sum / total, 2), bold_chars / total >= 0.6, mono_chars / total >= 0.6


def extract_lines(page):
    lines = []
    raw = page.get_text("dict")
    for block in raw.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            direction = line.get("dir", (1, 0))
            # Rotated text is margin notes and watermarks, never body content.
            if abs(direction[1]) > 0.1:
                continue
            raw_text = "".join(span.get("text", "") for span in line.get("spans", []))
            text = raw_text.strip()
            if not text:
                continue
            style = line_style(line)
            if style is None:
                continue
            size, bold, mono = style
            lines.append({
                # Code keeps its trailing whitespace trimmed only; leading spaces inside a span can carry indentation.
                "text": raw_text.rstrip() if mono else text,
                "bbox": [round(v, 2) for v in line["bbox"]],
                "size": size,
                "bold": bold,
                "mono": mono,
            })
    return lines


def save_image(doc, xref, output_dir):
    base = doc.extract_image(xref)
    if not base or not base.get("image"):
        return None
    ext = (base.get("ext") or "").lower()
    path = os.path.join(output_dir, f"img_{xref}.png" if ext not in ("png", "jpg", "jpeg") else f"img_{xref}.{ext}")
    if ext in ("png", "jpg", "jpeg"):
        with open(path, "wb") as f:
            f.write(base["image"])
    else:
        # jpx, jbig2, tiff etc. are converted so every stored image is web-displayable.
        pix = fitz.Pixmap(doc, xref)
        if pix.n - pix.alpha >= 4:
            pix = fitz.Pixmap(fitz.csRGB, pix)
        pix.save(path)
    return {"path": path, "width": base.get("width"), "height": base.get("height")}


def extract_images(doc, page, output_dir, saved):
    images = []
    for img in page.get_images(full=True):
        xref = img[0]
        try:
            rects = page.get_image_rects(xref)
        except Exception:
            rects = []
        if not rects:
            continue
        rect = rects[0]
        if rect.width < MIN_IMAGE_SIDE or rect.height < MIN_IMAGE_SIDE:
            continue
        if xref not in saved:
            try:
                saved[xref] = save_image(doc, xref, output_dir)
            except Exception:
                saved[xref] = None
        info = saved[xref]
        if info is None:
            continue
        images.append({"xref": xref, "bbox": [round(v, 2) for v in rect], **info})
    return images


def extract_tables(page):
    tables = []
    try:
        found = page.find_tables()
    except Exception:
        return tables
    for table in found.tables:
        try:
            rows = table.extract()
        except Exception:
            continue
        header = None
        try:
            if table.header is not None and not table.header.external:
                header = list(table.header.names)
        except Exception:
            header = None
        tables.append({"bbox": [round(v, 2) for v in table.bbox], "header": header, "rows": rows})
    return tables


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input_pdf")
    parser.add_argument("output_dir")
    parser.add_argument("--no-tables", action="store_true")
    parser.add_argument("--min-text-chars", type=int, default=40)
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    try:
        doc = fitz.open(args.input_pdf)
    except Exception as e:
        print(json.dumps({"error": f"failed to open PDF: {e}"}), file=sys.stderr)
        sys.exit(1)

    pages_out = []
    saved_images = {}
    try:
        # PyMuPDF prints advisory notices to stdout, which would corrupt the JSON contract.
        with contextlib.redirect_stdout(io.StringIO()):
            toc = [[level, title, page] for level, title, page in doc.get_toc(simple=True)]
            for index in range(len(doc)):
                page = doc[index]
                text_chars = len(page.get_text("text").strip())
                pages_out.append({
                    "page": index + 1,
                    "width": round(page.rect.width, 2),
                    "height": round(page.rect.height, 2),
                    "hasTextLayer": text_chars >= args.min_text_chars,
                    "lines": extract_lines(page),
                    "images": extract_images(doc, page, args.output_dir, saved_images),
                    "tables": [] if args.no_tables else extract_tables(page),
                })
    except Exception as e:
        print(json.dumps({"error": f"failed while processing page {len(pages_out) + 1}: {e}"}), file=sys.stderr)
        sys.exit(1)

    out_path = os.path.join(args.output_dir, "book.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"pageCount": len(doc), "toc": toc, "pages": pages_out}, f, ensure_ascii=False)

    print(json.dumps({"path": out_path}))


if __name__ == "__main__":
    main()
