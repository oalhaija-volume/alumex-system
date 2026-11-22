"""Keep exact PDF glyph geometry while embedding compact native print fonts.

The management PDF contains already-shaped Arabic text and incomplete embedded
font subsets. Ordinary Unicode rendering would shape it again or substitute
missing glyphs. A private-use cmap selects each original glyph directly, while
the source SVG keeps every glyph's original affine transform and position.

Only the cmap and required SFNT checksums change. Outlines, metrics, font
programs and hinting instructions remain the original supplied PDF data.
"""

from pathlib import Path
import base64
import hashlib
import re
import struct
import xml.etree.ElementTree as ET

import fitz

SVG = "http://www.w3.org/2000/svg"
HREF = "{http://www.w3.org/1999/xlink}href"
ET.register_namespace("", SVG)
ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")


def _checksum(data):
    padded = data + b"\0" * (-len(data) % 4)
    return sum(struct.unpack(">" + str(len(padded) // 4) + "I", padded)) & 0xFFFFFFFF


def _with_private_use_cmap(data):
    """Map U+E000 + glyph ID directly to the original TrueType glyph ID."""
    count = struct.unpack(">H", data[4:6])[0]
    tables = {}
    for index in range(count):
        offset = 12 + 16 * index
        tag = data[offset:offset + 4]
        _, start, length = struct.unpack(">III", data[offset + 4:offset + 16])
        tables[tag] = data[start:start + length]

    glyph_count = struct.unpack(">H", tables[b"maxp"][4:6])[0]
    # Every glyph used by this PDF lies in this BMP private-use range. The
    # highest source glyph ID is 6374, within the 6400 available code points.
    end = 0xE000 + min(glyph_count - 1, 6399)
    format_four = (
        struct.pack(">HHHHHHH", 4, 32, 0, 4, 4, 1, 0)
        + struct.pack(">HHHHHHHHH", end, 0xFFFF, 0, 0xE000, 0xFFFF, 0x2000, 1, 0, 0)
    )
    tables[b"cmap"] = (
        struct.pack(">HH", 0, 2)
        + struct.pack(">HHI", 0, 3, 20)
        + struct.pack(">HHI", 3, 1, 20)
        + format_four
    )
    head = bytearray(tables[b"head"])
    head[8:12] = b"\0" * 4
    tables[b"head"] = bytes(head)

    count = len(tables)
    power = 2 ** (count.bit_length() - 1)
    result = bytearray(
        data[:4]
        + struct.pack(">HHHH", count, power * 16, power.bit_length() - 1, count * 16 - power * 16)
    )
    result.extend(b"\0" * (16 * count))
    cursor = 12 + 16 * count
    head_offset = None
    for index, (tag, body) in enumerate(sorted(tables.items())):
        result[12 + 16 * index:28 + 16 * index] = (
            tag + struct.pack(">III", _checksum(body), cursor, len(body))
        )
        if tag == b"head":
            head_offset = cursor
        result.extend(body)
        padding = -len(body) % 4
        result.extend(b"\0" * padding)
        cursor += len(body) + padding
    result[head_offset + 8:head_offset + 12] = struct.pack(
        ">I", (0xB1B0AFBA - _checksum(result)) & 0xFFFFFFFF
    )
    return bytes(result), glyph_count


def create_print_artwork(source_pdf, output_directory, filenames):
    """Convert sanitized source outline SVGs into exact-position native text.

    Caller preserves the outline versions as screen artwork first. Chromium's
    SVG-image rasterizer can cull sparse-subset glyphs on screen, whereas native
    PDF rendering embeds and paints every original glyph correctly. Keeping
    each version for its intended medium avoids that browser rasterizer bug.
    """
    directory = Path(output_directory)
    source = fitz.open(source_pdf)
    fonts = {}
    seen = set()
    for page in source:
        for info in page.get_fonts():
            name, extension, _, data = source.extract_font(info[0])
            digest = hashlib.sha256(data).hexdigest()
            if digest in seen:
                continue
            if extension != "ttf":
                raise ValueError("Expected an original TrueType source font")
            seen.add(digest)
            mapped, count = _with_private_use_cmap(data)
            fonts[f"source-{info[0]}"] = {"name": name, "data": mapped, "count": count}

    required = {}
    trees = {}
    for filename in filenames:
        tree = ET.fromstring((directory / filename).read_text())
        trees[filename] = tree
        for path in tree.iter("{" + SVG + "}path"):
            match = re.fullmatch(r"font_(\d+)_(\d+)", path.attrib.get("id", ""))
            if match and path.attrib.get("d"):
                required.setdefault(match.group(1), {})[int(match.group(2))] = path.attrib["d"]
    glyph_ids = {glyph for shapes in required.values() for glyph in shapes}
    if not glyph_ids or max(glyph_ids) >= 6400:
        raise ValueError("Source glyph set no longer fits the verified private-use mapping")

    # Match source SVG font prefixes to the original embedded font program by
    # exact outline commands. Resource names alone cannot distinguish subsets.
    for font in fonts.values():
        temporary = fitz.open()
        page = temporary.new_page()
        page.insert_font(fontname="original", fontbuffer=font["data"])
        characters = "".join(chr(0xE000 + glyph) for glyph in sorted(glyph_ids) if glyph < font["count"])
        page.insert_text((50, 50), characters, fontname="original", fontsize=1)
        tree = ET.fromstring(page.get_svg_image(text_as_path=True))
        outlines = {}
        for path in tree.iter("{" + SVG + "}path"):
            match = re.fullmatch(r"font_(\d+)_(\d+)", path.attrib.get("id", ""))
            if match and path.attrib.get("d"):
                outlines[int(match.group(2))] = path.attrib["d"]
        font["outlines"] = outlines
        temporary.close()

    mapping = {}
    for prefix, shapes in required.items():
        matches, font_key = max(
            (sum(font["outlines"].get(glyph) == shape for glyph, shape in shapes.items()), key)
            for key, font in fonts.items()
        )
        if matches != len(shapes):
            raise ValueError("An original source glyph has no exact embedded-font outline match")
        mapping[prefix] = {"font": font_key, "matched": matches, "total": len(shapes), "missing": []}

    for filename, tree in trees.items():
        used_fonts = set()
        for parent in tree.iter():
            for child in list(parent):
                if child.tag != "{" + SVG + "}use":
                    continue
                match = re.fullmatch(r"#font_(\d+)_(\d+)", child.attrib.get(HREF, ""))
                if not match:
                    continue
                prefix, glyph = match.group(1), int(match.group(2))
                font_key = mapping[prefix]["font"]
                used_fonts.add(font_key)
                matrix = re.fullmatch(r"matrix\(([^)]*)\)", child.attrib["transform"])
                a, b, c, d, x, y = [float(value) for value in re.split(r"[ ,]+", matrix.group(1))]
                attributes = {
                    key: value for key, value in child.attrib.items()
                    if key not in (HREF, "transform", "data-text")
                }
                attributes.update({
                    "font-family": "Canonical" + font_key,
                    "font-size": "1",
                    # Original outline coordinates point up; SVG text points down.
                    "transform": f"matrix({a},{b},{-c},{-d},{x},{y})",
                    "font-kerning": "none",
                    "font-feature-settings": "'kern' 0, 'liga' 0",
                    "text-rendering": "geometricPrecision",
                })
                text = ET.Element("{" + SVG + "}text", attributes)
                text.text = chr(0xE000 + glyph)
                index = list(parent).index(child)
                parent.remove(child)
                parent.insert(index, text)
        definitions = tree.find("{" + SVG + "}defs")
        for child in list(definitions):
            if child.tag == "{" + SVG + "}path" and child.attrib.get("id", "").startswith("font_"):
                definitions.remove(child)
        style = ET.SubElement(definitions, "{" + SVG + "}style", {"type": "text/css"})
        style.text = "\n".join(
            "@font-face{font-family:'Canonical" + key + "';src:url(data:font/ttf;base64,"
            + base64.b64encode(fonts[key]["data"]).decode()
            + ") format('truetype');font-weight:normal;font-style:normal;}"
            for key in sorted(used_fonts)
        )
        (directory / filename).write_text(ET.tostring(tree, encoding="unicode"))
    source.close()
    return mapping
