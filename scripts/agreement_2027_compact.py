"""Reflow original contract artwork as compact, source-faithful legal bands."""

from pathlib import Path
import hashlib
import re
import xml.etree.ElementTree as ET

import fitz

from agreement_2027_specifications import _blank_body, _stationery_text

SVG = "http://www.w3.org/2000/svg"
HREF = "{http://www.w3.org/1999/xlink}href"
ET.register_namespace("", SVG)
ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")


def _cropped_band(svg, rectangle):
    tree = ET.fromstring(svg)
    x0, y0, x1, y1 = rectangle
    for parent in tree.iter():
        for child in list(parent):
            if child.tag not in ("{" + SVG + "}use", "{" + SVG + "}text"):
                continue
            matrix = re.fullmatch(r"matrix\(([^)]*)\)", child.attrib.get("transform", ""))
            if matrix:
                values = [float(value) for value in re.split(r"[ ,]+", matrix.group(1))]
                if len(values) == 6 and not (x0 <= values[4] <= x1 and y0 <= values[5] <= y1):
                    parent.remove(child)
    # Preserve original glyph outlines/transforms; only the viewport and outside
    # text change. Remove font programs/outlines unused by this specific band.
    referenced = {element.attrib[HREF][1:] for element in tree.iter() if element.attrib.get(HREF, "").startswith("#")}
    families = {element.attrib["font-family"] for element in tree.iter("{" + SVG + "}text") if "font-family" in element.attrib}
    for definitions in tree.iter("{" + SVG + "}defs"):
        for child in list(definitions):
            if child.tag == "{" + SVG + "}path" and child.attrib.get("id", "").startswith("font_") and child.attrib["id"] not in referenced:
                definitions.remove(child)
            if child.tag == "{" + SVG + "}style":
                rules = re.findall(r"@font-face\{font-family:'([^']+)';[^}]*\}", child.text or "")
                complete = re.findall(r"@font-face\{font-family:'[^']+';[^}]*\}", child.text or "")
                child.text = "\n".join(rule for family, rule in zip(rules, complete) if family in families)
    tree.attrib["viewBox"] = f"{x0} {y0} {x1 - x0} {y1 - y0}"
    tree.attrib["width"] = str(x1 - x0)
    tree.attrib["height"] = str(y1 - y0)
    return ET.tostring(tree, encoding="unicode")


def _sanitized_text_page(source, page_number):
    copied = fitz.open()
    copied.insert_pdf(source, from_page=page_number - 1, to_page=page_number - 1)
    page = copied[0]
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                rectangle = fitz.Rect(span["bbox"])
                if span["color"] == 0x5B9BD5 and rectangle.width > 0.02 and rectangle.height > 0.02:
                    page.add_redact_annot(rectangle, fill=False, cross_out=False)
    if page_number == 2:
        for rectangle in ([308, 240, 369, 253], [311, 143.5, 503.8, 154], [144, 151.8, 424.15, 168.6]):
            page.add_redact_annot(fitz.Rect(rectangle), fill=False, cross_out=False)
    if page_number == 6:
        for rectangle in ([325, 623, 506.2, 635], [324, 648, 548.55, 660]):
            page.add_redact_annot(fitz.Rect(rectangle), fill=False, cross_out=False)
    page.apply_redactions(images=0, graphics=0, text=0)
    return copied


def add_compact_artwork(source_pdf, output_directory, metadata):
    directory = Path(output_directory)
    source = fitz.open(source_pdf)
    source_assets = {asset["page"]: asset for asset in metadata["assets"] if asset.get("kind") is None}
    residential = next(asset for asset in metadata["assets"] if asset.get("kind") == "residential")
    commercial = next(asset for asset in metadata["assets"] if asset.get("kind") == "commercial")
    source_assets[2] = residential

    # Page 3 provides the original two-party initials strip at a stable footer
    # position. Remove the entire body, including the old clause-four heading.
    clear_rectangle = [45, 103.5, 565, 724.4]
    content_rectangle = [45, 117, 565, 710]
    base = source_assets[3]
    stationery = {"file": "compact-stationery.svg", "screenFile": "compact-stationery-screen.svg"}
    for key, hash_key in (("file", "sha256"), ("screenFile", "screenSha256")):
        data = _blank_body((directory / base[key]).read_text(), clear_rectangle)
        (directory / stationery[key]).write_text(data)
        stationery[hash_key] = hashlib.sha256(data.encode()).hexdigest()
    stationery["contentRect"] = content_rectangle
    stationery["sourceText"] = _stationery_text(source[2], clear_rectangle)

    # Coordinates include each complete semantic paragraph and its original
    # fonts, rules, colours and line spacing. Between-band whitespace can reflow.
    definitions = [
        ("parties-client", 2, 127.6, 170, "parties", None, [], False),
        ("parties-company", 2, 183, 227, "parties", None, [], False),
        ("agreement-intro", 2, 234.8, 265, "intro", None, [], False),
        ("clauses-1-3", 2, 271.5, 336.3, "clauses", None, [1, 2, 3], True),
        ("payment-residential", 2, 347, 410.5, "payments", "residential", [3], False),
        ("payment-commercial", 2, 426.8, 642.5, "payments", "commercial", [3], False),
        ("under-threshold-note", 2, 657.8, 675, "payment-note", None, [3], False),
        ("warranty-and-quotation", 2, 682.5, 711.5, "warranty", None, [3], False),
        ("clause-4-heading", 3, 103.6, 116.5, "specifications-heading", None, [4], True),
        ("common-exclusions", 4, 536, 643.5, "specification-exclusions", None, [4], False),
        ("measurement-notes", 4, 653.6, 714, "specification-notes", None, [4], False),
        ("clause-5", 5, 103.6, 236.8, "clause", None, [5], False),
        ("clause-6", 5, 246, 299.6, "clause", None, [6], False),
        ("clause-7", 5, 309.8, 347.7, "clause", None, [7], False),
        ("clause-8", 5, 354.8, 408.3, "clause", None, [8], False),
        ("clause-9", 5, 418, 438.2, "clause", None, [9], False),
        ("clause-10", 5, 445.4, 468.5, "clause", None, [10], False),
        ("clause-11", 5, 475.5, 529, "clause", None, [11], False),
        ("clause-12", 5, 539.3, 587.7, "clause", None, [12], False),
        ("clause-13", 5, 594.8, 635.4, "clause", None, [13], False),
        ("clause-14", 5, 648.5, 711.1, "clause", None, [14], False),
        ("clause-15", 6, 115.5, 220.1, "clause", None, [15], False),
        ("clause-16", 6, 223.8, 294, "clause", None, [16], False),
        ("clause-17", 6, 310, 388.5, "clause", None, [17], False),
        ("clause-18", 6, 405.2, 457, "clause", None, [18], False),
        ("clause-18-notes", 6, 473.3, 563.2, "clause-continuation", None, [18], False),
        ("clause-19", 6, 567, 580.5, "clause", None, [19], True),
        ("formal-signatures", 6, 589, 735, "signatures", None, [], False),
    ]
    text_pages = {page: _sanitized_text_page(source, page) for page in (2, 3, 4, 5, 6)}
    bands = []
    for identity, page, top, bottom, role, kind, clauses, keep_with_next in definitions:
        asset = commercial if kind == "commercial" else source_assets[page]
        rectangle = [45, top, 565, bottom]
        band = {
            "id": identity, "sourcePage": page, "rect": rectangle,
            "role": role, "clauseNumbers": clauses, "height": round(bottom - top, 3),
            "file": f"compact-{identity}.svg", "screenFile": f"compact-{identity}-screen.svg",
            "keepWithNext": keep_with_next,
        }
        if kind is not None:
            band["kind"] = kind
        fields = [
            field for field in metadata["fields"].get(str(page), [])
            if top <= (field["rect"][1] + field["rect"][3]) / 2 <= bottom
        ]
        band["fieldKeys"] = [field["key"] for field in fields]
        band["fields"] = fields
        band["sourceText"] = text_pages[page][0].get_text(sort=True, clip=fitz.Rect(rectangle)).strip()
        for key, hash_key in (("file", "sha256"), ("screenFile", "screenSha256")):
            data = _cropped_band((directory / asset[key]).read_text(), rectangle)
            (directory / band[key]).write_text(data)
            band[hash_key] = hashlib.sha256(data.encode()).hexdigest()
        bands.append(band)

    def sequence(kind):
        return [band["id"] for band in bands if band.get("kind", kind) == kind]

    metadata.setdefault("layout", {})["compact"] = {
        "contentRect": content_rectangle, "gap": 6,
        "stationery": stationery, "bands": bands,
        "sequence": {kind: sequence(kind) for kind in ("residential", "commercial")},
        "selectedSpecificationsAfter": "clause-4-heading",
        "fixedPages": [
            {"role": "handover", "sourcePage": 1, "wholePage": True},
            {"role": "annex", "sourcePage": 7, "wholePage": True},
        ],
    }
    for document in text_pages.values():
        document.close()
    source.close()
    return metadata
