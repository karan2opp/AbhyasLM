#!/usr/bin/env python3
"""
One-shot PDF page extractor for the document-ingestion pipeline.

For every page it returns: the plain text, any tables PyMuPDF's layout
analysis can find, any embedded raster images (saved to output_dir), a naive
bullet/numbered-list grouping over the text, and whether the page has a
usable text layer at all (the digital-vs-scanned signal). Pages with no text
layer, or that contain an image, are also rasterized to PNG so a vision model
can be used as a fallback for exactly those pages.

Usage:
    python extract.py <input.pdf> <output_dir> [--render-dpi 200] [--min-text-chars 40]

Prints one JSON object to stdout: {"pages": [...]}. On failure, prints
{"error": "..."} to stderr and exits non-zero. This stdout/stderr JSON
contract is the entire interface — nothing else should be written to stdout.
"""
import sys
import os
import json
import re
import argparse
import io
import contextlib

import pymupdf as fitz  # PyMuPDF; "fitz" is the legacy import name, deprecated as of 1.24+

BULLET_RE = re.compile(r"^\s*([•\-\*]|\d+[\.\)]|[a-zA-Z][\.\)])\s+")


def detect_lists(text: str):
    """Groups consecutive bullet/numbered lines into lists. This is a text
    heuristic, not layout analysis — PyMuPDF has no native list detector."""
    lists = []
    current = []
    for line in text.split("\n"):
        if BULLET_RE.match(line):
            current.append(BULLET_RE.sub("", line).strip())
        else:
            if len(current) >= 2:
                lists.append({"items": current})
            current = []
    if len(current) >= 2:
        lists.append({"items": current})
    return lists


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
            rows = []
        header_names = None
        try:
            if table.header is not None:
                header_names = list(table.header.names)
        except Exception:
            header_names = None
        tables.append({
            "bbox": list(table.bbox),
            "header": header_names,
            "rows": rows,
        })
    return tables


def extract_images(doc, page, page_index, output_dir):
    images = []
    for img_index, img in enumerate(page.get_images(full=True)):
        xref = img[0]
        try:
            base = doc.extract_image(xref)
        except Exception:
            continue
        ext = base["ext"]
        filename = f"page{page_index + 1}_img{img_index}_{xref}.{ext}"
        out_path = os.path.join(output_dir, filename)
        with open(out_path, "wb") as f:
            f.write(base["image"])

        # Bbox lets a caller figure out which chunk of text (e.g. which
        # question, in the question-bank pipeline) an image visually belongs
        # to, by comparing vertical position on the page. An image can be
        # placed more than once; we only report where it first appears.
        bbox = None
        try:
            rects = page.get_image_rects(xref)
            if rects:
                bbox = list(rects[0])
        except Exception:
            bbox = None

        images.append({
            "index": img_index,
            "xref": xref,
            "ext": ext,
            "width": base.get("width"),
            "height": base.get("height"),
            "path": out_path,
            "bbox": bbox,
        })
    return images


def extract_lines(page):
    """Per-line text with bounding boxes, in reading order. This is generic
    geometry (no question/list/table awareness) so any downstream pipeline —
    question-bank chunking, book indexing — can build its own positional
    logic on top of it without extract.py knowing about that logic."""
    lines = []
    try:
        raw = page.get_text("dict")
    except Exception:
        return lines
    for block in raw.get("blocks", []):
        for line in block.get("lines", []):
            text = "".join(span.get("text", "") for span in line.get("spans", []))
            if not text.strip():
                continue
            lines.append({"text": text, "bbox": list(line.get("bbox", [0, 0, 0, 0]))})
    return lines


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input_pdf")
    parser.add_argument("output_dir")
    parser.add_argument("--render-dpi", type=int, default=200)
    parser.add_argument(
        "--min-text-chars",
        type=int,
        default=40,
        help="pages with fewer extracted characters than this are flagged as having no usable text layer",
    )
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    try:
        doc = fitz.open(args.input_pdf)
    except Exception as e:
        print(json.dumps({"error": f"failed to open PDF: {e}"}), file=sys.stderr)
        sys.exit(1)

    # PyMuPDF (e.g. find_tables()) occasionally prints advisory notices
    # straight to stdout, which would corrupt the JSON contract below —
    # swallow anything the library itself writes there while we process.
    pages_out = []
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            for page_index in range(len(doc)):
                page = doc[page_index]

                text = page.get_text("text")
                has_text_layer = len(text.strip()) >= args.min_text_chars

                images = extract_images(doc, page, page_index, args.output_dir)
                tables = extract_tables(page)
                lists_found = detect_lists(text)
                lines = extract_lines(page)

                render_path = None
                if not has_text_layer or images:
                    pix = page.get_pixmap(dpi=args.render_dpi)
                    render_path = os.path.join(args.output_dir, f"page{page_index + 1}.png")
                    pix.save(render_path)

                pages_out.append({
                    "page": page_index + 1,
                    "hasTextLayer": has_text_layer,
                    "text": text,
                    "lists": lists_found,
                    "tables": tables,
                    "images": images,
                    "lines": lines,
                    "renderPath": render_path,
                })
    except Exception as e:
        print(json.dumps({"error": f"failed while processing page: {e}"}), file=sys.stderr)
        sys.exit(1)

    print(json.dumps({"pages": pages_out}))


if __name__ == "__main__":
    main()
