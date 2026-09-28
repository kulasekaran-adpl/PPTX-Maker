#!/usr/bin/env python3
"""Render an exported .pptx so we can see what PowerPoint / Google Slides will
draw from the file itself — not from the app's internal model.

This is the check that would have caught the rotated-cover-art bug: it reads
the OOXML PowerPoint actually consumes (offsets, extents, rotation, custom
geometry paths, text runs, colours) and paints it.

    python3 tools/render-pptx.py .tmp/adpl-test-deck.pptx .tmp/render.png

Needs Pillow:  pip install pillow

Deliberate simplifications (it is a layout check, not a full renderer):
  * text is set in DejaVu Sans, which is wider than Arial, so anything that
    fits here will fit in the real thing
  * preset shapes other than rect/roundRect/ellipse are drawn as rectangles
    with a note, unless they are freeform polygons (which are exact)
  * images are drawn stretched to their frame, honouring <a:srcRect> crops
"""

from __future__ import annotations

import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

A = "http://schemas.openxmlformats.org/drawingml/2006/main"
P = "http://schemas.openxmlformats.org/presentationml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
EMU = 914400.0

FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def q(ns: str, tag: str) -> str:
    return f"{{{ns}}}{tag}"


def hexcolour(el) -> str | None:
    if el is None:
        return None
    srgb = el.find(f".//{q(A, 'srgbClr')}")
    if srgb is None:
        return None
    return "#" + srgb.get("val", "000000")


class SlideRenderer:
    def __init__(self, pptx: Path, px_per_inch: float = 120.0):
        self.zip = zipfile.ZipFile(pptx)
        self.scale = px_per_inch
        pres = ET.fromstring(self.zip.read("ppt/presentation.xml"))
        sld_sz = pres.find(f"{q(P, 'sldSz')}")
        self.slide_w = int(sld_sz.get("cx")) / EMU
        self.slide_h = int(sld_sz.get("cy")) / EMU

    # -- helpers ---------------------------------------------------------
    def px(self, inches: float) -> float:
        return inches * self.scale

    def font(self, size_pt: float, bold: bool):
        path = FONT_BOLD if bold else FONT_REG
        return ImageFont.truetype(path, max(5, int(round(size_pt * self.scale / 72))))

    def slide_names(self) -> list[str]:
        names = [n for n in self.zip.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)]
        return sorted(names, key=lambda n: int(re.findall(r"\d+", n)[-1]))

    def rels(self, slide_name: str) -> dict[str, str]:
        rel_name = slide_name.replace("slides/", "slides/_rels/") + ".rels"
        out: dict[str, str] = {}
        try:
            root = ET.fromstring(self.zip.read(rel_name))
        except KeyError:
            return out
        for rel in root:
            target = rel.get("Target", "")
            base = "ppt/"
            if target.startswith("../"):
                base = "ppt/"
                target = target[3:]
            out[rel.get("Id")] = base + target
        return out

    def wrap(self, draw, text: str, font, max_w: float) -> list[str]:
        lines: list[str] = []
        for para in text.split("\n"):
            if not para:
                lines.append("")
                continue
            words = para.split(" ")
            cur = ""
            for w in words:
                trial = f"{cur} {w}".strip()
                if draw.textlength(trial, font=font) <= max_w or not cur:
                    cur = trial
                else:
                    lines.append(cur)
                    cur = w
            lines.append(cur)
        return lines

    # -- pieces ----------------------------------------------------------
    def draw_shape(self, im, draw, sp, rels: dict[str, str], notes: list[str]):
        xfrm = sp.find(f".//{q(A, 'xfrm')}")
        if xfrm is None:
            return
        off = xfrm.find(q(A, "off"))
        ext = xfrm.find(q(A, "ext"))
        if off is None or ext is None:
            return
        x = self.px(int(off.get("x")) / EMU)
        y = self.px(int(off.get("y")) / EMU)
        w = self.px(int(ext.get("cx")) / EMU)
        h = self.px(int(ext.get("cy")) / EMU)
        rot = int(xfrm.get("rot", "0")) / 60000.0

        spPr = sp.find(f"{q(P, 'spPr')}")
        name_el = sp.find(f".//{q(P, 'cNvPr')}")
        name = name_el.get("name", "?") if name_el is not None else "?"

        fill = None
        if spPr is not None:
            solid = spPr.find(q(A, "solidFill"))
            if solid is not None:
                fill = hexcolour(solid)
            no_fill = spPr.find(q(A, "noFill")) is not None
            if no_fill:
                fill = None

        outline = None
        lw = 0
        if spPr is not None:
            ln = spPr.find(q(A, "ln"))
            if ln is not None:
                col = ln.find(q(A, "solidFill"))
                if col is not None:
                    outline = hexcolour(col)
                    lw = max(1, int(int(ln.get("w", "12700")) / 12700 * self.scale / 72 * 72 / 72))

        geom = spPr.find(q(A, "prstGeom")) if spPr is not None else None
        preset = geom.get("prst") if geom is not None else None
        cust = spPr.find(q(A, "custGeom")) if spPr is not None else None

        layer = Image.new("RGBA", im.size, (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer)

        if cust is not None:
            path = cust.find(f".//{q(A, 'path')}")
            pw = int(path.get("w"))
            ph = int(path.get("h"))
            pts = []
            for pt in path.iter(q(A, "pt")):
                pts.append((x + w * int(pt.get("x")) / pw, y + h * int(pt.get("y")) / ph))
            if pts:
                ld.polygon(pts, fill=fill, outline=outline)
            if rot:
                notes.append(f"{name}: freeform with rot={rot} (unexpected)")
        elif preset == "ellipse":
            ld.ellipse([x, y, x + w, y + h], fill=fill, outline=outline, width=lw)
        elif preset == "roundRect":
            ld.rounded_rectangle([x, y, x + w, y + h], radius=min(w, h) * 0.12, fill=fill, outline=outline, width=lw)
        elif preset == "line":
            ld.line([x, y + h / 2, x + w, y + h / 2], fill=outline or fill, width=max(1, int(h)))
        else:
            if preset != "rect" and preset is not None:
                notes.append(f"{name}: preset '{preset}' drawn as a rectangle")
            ld.rectangle([x, y, x + w, y + h], fill=fill, outline=outline, width=lw)

        if rot:
            layer = layer.rotate(-rot, resample=Image.BICUBIC, center=(x + w / 2, y + h / 2))
        im.alpha_composite(layer)

    def draw_picture(self, im, sp, rels: dict[str, str]):
        xfrm = sp.find(f".//{q(A, 'xfrm')}")
        off, ext = xfrm.find(q(A, "off")), xfrm.find(q(A, "ext"))
        x = self.px(int(off.get("x")) / EMU)
        y = self.px(int(off.get("y")) / EMU)
        w = max(1, self.px(int(ext.get("cx")) / EMU))
        h = max(1, self.px(int(ext.get("cy")) / EMU))
        blip = sp.find(f".//{q(A, 'blip')}")
        rid = blip.get(q(R, "embed")) if blip is not None else None
        target = rels.get(rid or "", "")
        if not target:
            return
        try:
            from io import BytesIO

            img = Image.open(BytesIO(self.zip.read(target))).convert("RGBA")
        except Exception:
            return
        src_rect = sp.find(f".//{q(A, 'srcRect')}")
        if src_rect is not None:
            def frac(v):
                return int(src_rect.get(v, "0")) / 100000.0

            l, t, r, b = frac("l"), frac("t"), frac("r"), frac("b")
            img = img.crop(
                (
                    int(img.width * l),
                    int(img.height * t),
                    int(img.width * (1 - r)),
                    int(img.height * (1 - b)),
                )
            )
        img = img.resize((max(1, int(w)), max(1, int(h))))
        im.alpha_composite(img, (int(x), int(y)))

    def draw_text(self, im, draw, sp, rels: dict[str, str]):
        tx = sp.find(f"{q(P, 'txBody')}")
        if tx is None:
            return
        xfrm = sp.find(f".//{q(A, 'xfrm')}")
        off, ext = xfrm.find(q(A, "off")), xfrm.find(q(A, "ext"))
        x = self.px(int(off.get("x")) / EMU)
        y = self.px(int(off.get("y")) / EMU)
        w = self.px(int(ext.get("cx")) / EMU)
        h = self.px(int(ext.get("cy")) / EMU)

        bodyPr = tx.find(q(A, "bodyPr"))
        l_ins = int(bodyPr.get("lIns", "91440")) / EMU
        t_ins = int(bodyPr.get("tIns", "45720")) / EMU
        r_ins = int(bodyPr.get("rIns", "91440")) / EMU
        b_ins = int(bodyPr.get("bIns", "45720")) / EMU
        wrap = bodyPr.get("wrap", "square") != "none"
        anchor = bodyPr.get("anchor", "t")

        fill = None
        spPr = sp.find(f"{q(P, 'spPr')}")
        if spPr is not None:
            solid = spPr.find(q(A, "solidFill"))
            if solid is not None:
                fill = hexcolour(solid)
        if fill:
            draw.rectangle([x, y, x + w, y + h], fill=fill)

        pad_l = self.px(l_ins)
        pad_t = self.px(t_ins)
        avail_w = max(8, w - pad_l - self.px(r_ins))

        blocks = []
        for para in tx.findall(q(A, "p")):
            ppr = para.find(q(A, "pPr"))
            algn = ppr.get("algn", "l") if ppr is not None else "l"
            marl = int(ppr.get("marL", "0")) / EMU if ppr is not None else 0.0
            bullet = ppr is not None and ppr.find(q(A, "buChar")) is not None
            lnspc = None
            if ppr is not None:
                spc = ppr.find(f"{q(A, 'lnSpc')}/{q(A, 'spcPts')}")
                if spc is not None:
                    lnspc = int(spc.get("val")) / 100.0
            runs = []
            for run in para.findall(q(A, "r")):
                rpr = run.find(q(A, "rPr"))
                t = run.find(q(A, "t"))
                if t is None or rpr is None:
                    continue
                size = int(rpr.get("sz", "1800")) / 100.0
                runs.append(
                    {
                        "text": t.text or "",
                        "size": size,
                        "bold": rpr.get("b") == "1",
                        "italic": rpr.get("i") == "1",
                        "color": hexcolour(rpr.find(q(A, "solidFill"))) or "#000000",
                        "spc": int(rpr.get("spc", "0")) / 100.0,
                        "lnspc": lnspc,
                    }
                )
            if runs:
                blocks.append({"runs": runs, "algn": algn, "bullet": bullet, "marl": marl, "lnspc": lnspc})

        # measure
        total_h = 0
        laid_out = []
        for blk in blocks:
            sz = blk["runs"][0]["size"]
            bold = blk["runs"][0]["bold"]
            f = self.font(sz, bold)
            text = "".join(r["text"] for r in blk["runs"])
            width = avail_w - (self.px(blk["marl"]) if blk["bullet"] else 0)
            lines = self.wrap(draw, text, f, width) if wrap else [text]
            lh = (blk["lnspc"] or sz * 1.2) * self.scale / 72.0
            for i, line in enumerate(lines):
                prefix = "• " if blk["bullet"] else ""
                laid_out.append(
                    {
                        "line": prefix + line,
                        "font": f,
                        "color": blk["runs"][0]["color"],
                        "algn": blk["algn"],
                        "y": total_h + i * lh,
                        "x": self.px(blk["marl"]) if blk["bullet"] else 0,
                    }
                )
            total_h += lh * len(lines)

        start_y = y + pad_t
        if anchor == "ctr":
            start_y = y + (h - total_h) / 2
        elif anchor == "b":
            start_y = y + h - total_h - self.px(b_ins)

        for item in laid_out:
            tw = draw.textlength(item["line"], font=item["font"])
            tx_x = x + pad_l + item["x"]
            if item["algn"] == "ctr":
                tx_x = x + (w - tw) / 2
            elif item["algn"] == "r":
                tx_x = x + w - pad_l - tw
            draw.text((tx_x, start_y + item["y"]), item["line"], font=item["font"], fill=item["color"])

    # -- slides ----------------------------------------------------------
    def render_slide(self, name: str, notes: list[str]) -> Image.Image:
        root = ET.fromstring(self.zip.read(name))
        rels = self.rels(name)
        W = int(self.px(self.slide_w))
        H = int(self.px(self.slide_h))

        im = Image.new("RGBA", (W, H), (255, 255, 255, 255))
        bg = root.find(f".//{q(P, 'bg')}")
        if bg is not None:
            col = hexcolour(bg)
            if col:
                im = Image.new("RGBA", (W, H), col)
        draw = ImageDraw.Draw(im)

        tree = root.find(f"{q(P, 'cSld')}/{q(P, 'spTree')}")
        if tree is None:
            return im.convert("RGB")

        for el in list(tree):
            tag = el.tag.split("}")[-1]
            if tag == "sp":
                has_text = el.find(f"{q(P, 'txBody')}") is not None and el.find(f".//{q(A, 't')}") is not None
                if has_text:
                    self.draw_text(im, draw, el, rels)
                self.draw_shape(im, draw, el, rels, notes)
            elif tag == "pic":
                self.draw_picture(im, el, rels)
        return im.convert("RGB")


def main() -> int:
    src = Path(sys.argv[1] if len(sys.argv) > 1 else ".tmp/adpl-test-deck.pptx")
    out = Path(sys.argv[2] if len(sys.argv) > 2 else ".tmp/render.png")
    cols = int(sys.argv[3]) if len(sys.argv) > 3 else 2

    R_ = SlideRenderer(src, px_per_inch=110)
    names = R_.slide_names()
    notes: list[str] = []
    thumbs = [R_.render_slide(n, notes) for n in names]

    tw, th = thumbs[0].size
    tw, th = int(tw * 0.5), int(th * 0.5)
    rows = (len(thumbs) + cols - 1) // cols
    pad = 10
    sheet = Image.new("RGB", (cols * tw + pad * (cols + 1), rows * (th + 22) + pad), (238, 243, 248))
    d = ImageDraw.Draw(sheet)
    label = ImageFont.truetype(FONT_REG, 13)
    for i, t in enumerate(thumbs):
        c, r = i % cols, i // cols
        x = pad + c * (tw + pad)
        y = pad + r * (th + 22)
        sheet.paste(t.resize((tw, th)), (x, y))
        d.text((x, y + th + 4), f"slide {i + 1}", font=label, fill=(20, 50, 70))
    sheet.save(out)

    print(f"rendered {len(thumbs)} slides from {src} -> {out}")
    print(f"slide size {R_.slide_w:.3f} x {R_.slide_h:.3f} in")
    if notes:
        print("notes:")
        for n in sorted(set(notes)):
            print("  •", n)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
