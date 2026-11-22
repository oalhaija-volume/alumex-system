"""Source-faithful regions for showing only approved quotation selections.

The original full artwork remains available solely as a clipping source. Blank
stationery removes the complete catalogue body, including its hidden text, so
renderers can add back only the selected system and add-on regions.
"""

from pathlib import Path
import hashlib
import re
import xml.etree.ElementTree as ET

import fitz

SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)
ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")


def _inside(rectangle, x, y):
    return rectangle[0] <= x <= rectangle[2] and rectangle[1] <= y <= rectangle[3]


def _blank_body(svg, rectangle):
    tree = ET.fromstring(svg)
    # Remove original catalogue text rather than only painting over it. Source
    # shape rules are then covered without affecting the page frame or footer.
    for parent in tree.iter():
        for child in list(parent):
            if child.tag not in ("{" + SVG + "}use", "{" + SVG + "}text"):
                continue
            matrix = re.fullmatch(r"matrix\(([^)]*)\)", child.attrib.get("transform", ""))
            if not matrix:
                continue
            values = [float(value) for value in re.split(r"[ ,]+", matrix.group(1))]
            if len(values) == 6 and _inside(rectangle, values[4], values[5]):
                parent.remove(child)
    x0, y0, x1, y1 = rectangle
    ET.SubElement(tree, "{" + SVG + "}rect", {
        "x": str(x0), "y": str(y0), "width": str(x1 - x0),
        "height": str(y1 - y0), "fill": "#ffffff",
    })
    return ET.tostring(tree, encoding="unicode")


def _region_text(page, rectangles):
    text = "\n".join(page.get_text(sort=True, clip=fitz.Rect(rectangle)).strip() for rectangle in rectangles)
    # Source rates are examples. Actual approved prices are separate live fields.
    return re.sub(r"\d{1,3}(?:,\d{3})+", "", text).strip()


def _stationery_text(page, rectangle):
    text = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                if span["color"] == 0x5B9BD5:
                    continue
                x0, y0, x1, y1 = span["bbox"]
                if not _inside(rectangle, (x0 + x1) / 2, (y0 + y1) / 2):
                    value = span["text"].strip()
                    if value:
                        text.append(value)
    return "\n".join(text)


def add_selection_artwork(source_pdf, output_directory, metadata):
    """Add catalogue regions and blank stationery without changing saved fields."""
    directory = Path(output_directory)
    source = fitz.open(source_pdf)
    price_lookup = {
        price["key"]: price
        for prices in metadata["prices"].values() for price in prices
    }
    x0, x1 = 45.0, 565.0
    regions = []

    def system(key, page, parts, order):
        reference = price_lookup[key]
        regions.append({
            "key": key, "label": reference["label"], "page": page,
            "rect": parts[-1], "parts": parts, "priceKeys": [key],
            "height": round(sum(part[3] - part[1] for part in parts), 3),
            "order": order,
            "sourceText": _region_text(source[page - 1], parts),
        })

    page_three = [
        ("alumex-16", 116.3, 178.45),
        ("alumex-16-pro", 178.45, 240.73),
        ("alumex-16-plus", 240.73, 302.92),
        ("alumex-4500", 302.92, 365.08),
        ("alumex-4500-pro", 365.08, 427.38),
        ("alumex-4500-louver", 427.38, 490.38),
        ("alumex-curtain-wall-cw60", 490.38, 567.42),
        ("alumex-skylight-cw60", 567.42, 629.61),
        ("alumex-push-out", 629.61, 662.25),
        ("alumex-swing-door", 662.25, 724.4),
    ]
    for order, (key, top, bottom) in enumerate(page_three):
        system(key, 3, [[x0, top, x1, bottom]], order)

    # The two photocell suppliers share a heading in the source. Each selectable
    # variant gets that heading plus only its own row, excluding the other one.
    system("photo-cell-geze", 4, [[x0, 117.0, x1, 149.5]], 10)
    system("photo-cell-ex", 4, [
        [x0, 117.0, x1, 135.0], [x0, 149.5, x1, 164.4],
    ], 11)
    for order, (key, top, bottom) in enumerate([
        ("the-address-as-a18", 164.4, 226.57),
        ("the-address-as-a15", 226.57, 288.76),
        ("the-address-ah650-660-688", 288.76, 351.04),
        ("the-address-curtain-wall", 351.04, 413.22),
    ], 12):
        system(key, 4, [[x0, top, x1, bottom]], order)

    extras = []
    for order, (key, price_keys, top, bottom) in enumerate([
        ("tempered-glass", ["tempered-glass-single", "tempered-glass-double"], 427.26, 442.63),
        ("low-e-glass", ["low-e-glass"], 442.63, 457.99),
        ("mirror-glass", ["mirror-glass"], 457.99, 473.23),
        ("georgian-bar", ["georgian-bar"], 473.23, 488.59),
        ("turn-and-tilt", ["turn-and-tilt"], 488.59, 503.95),
        ("sub-frame", ["sub-frame"], 503.95, 519.31),
        ("arch", ["arch"], 519.31, 535.15),
    ]):
        rectangle = [x0, top, x1, bottom]
        extras.append({
            "key": key, "page": 4, "rect": rectangle, "parts": [rectangle],
            "priceKeys": price_keys, "height": round(bottom - top, 3),
            "order": order, "sourceText": _region_text(source[3], [rectangle]),
        })

    stationery = []
    content_rectangles = {3: [45, 116.5, 565, 724.4], 4: [45, 117.25, 565, 535.2]}
    for page, rectangle in content_rectangles.items():
        asset = next(item for item in metadata["assets"] if item["page"] == page)
        native_name = f"page-{page}-stationery.svg"
        screen_name = f"page-{page}-stationery-screen.svg"
        native_svg = _blank_body((directory / asset["file"]).read_text(), rectangle)
        screen_svg = _blank_body((directory / asset["screenFile"]).read_text(), rectangle)
        (directory / native_name).write_text(native_svg)
        (directory / screen_name).write_text(screen_svg)
        static_text = _stationery_text(source[page - 1], rectangle)
        stationery.append({
            "page": page, "file": native_name, "screenFile": screen_name,
            "sha256": hashlib.sha256(native_svg.encode()).hexdigest(),
            "screenSha256": hashlib.sha256(screen_svg.encode()).hexdigest(),
            "contentRect": rectangle, "sourceText": static_text,
        })

    metadata["specifications"] = {
        "systems": regions, "extras": extras,
        "extrasHeading": {
            "page": 4, "rect": [45, 413.22, 565, 427.26],
            "sourceText": _region_text(source[3], [[45, 413.22, 565, 427.26]]),
        },
        "stationery": stationery,
        "instructions": "Render only approved selected regions using their parts in source order; never render the full catalogue as a page background.",
    }
    layout = metadata.setdefault("layout", {})
    layout["stationery"] = {str(page["page"]): page for page in stationery}
    layout["systemOrder"] = [region["key"] for region in regions]
    layout["systemRegions"] = {region["key"]: region for region in regions}
    layout["extrasRegions"] = {region["key"]: region for region in extras}
    source.close()
    return metadata
