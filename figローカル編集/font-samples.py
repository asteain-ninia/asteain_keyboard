"""Generate Figma cached text outlines from a locally installed font."""
import base64
import json
import struct
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen


class BlobPen(BasePen):
    def __init__(self, glyphs, em):
        super().__init__(glyphs)
        self.em = em
        self.data = bytearray([0])

    def command(self, opcode, *points):
        self.data.append(opcode)
        for x, y in points:
            self.data.extend(struct.pack('<ff', x / self.em, y / self.em))

    def _moveTo(self, p): self.command(1, p)
    def _lineTo(self, p): self.command(2, p)
    def _qCurveToOne(self, p1, p2): self.command(3, p1, p2)
    def _curveToOne(self, p1, p2, p3): self.command(4, p1, p2, p3)
    def _closePath(self): self.command(0)
    def _endPath(self): pass


font = TTFont('C:/Windows/Fonts/msgothic.ttc', fontNumber=0)
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
em = font['head'].unitsPerEm
result = {}
for ch in json.loads(sys.stdin.buffer.read()):
    if ord(ch) not in cmap:
        raise ValueError(f'MS Gothic has no U+{ord(ch):04X}')
    name = cmap[ord(ch)]
    pen = BlobPen(glyphs, em)
    glyphs[name].draw(pen)
    result[ch] = dict(blob=base64.b64encode(pen.data).decode('ascii'),
                      advance=font['hmtx'][name][0] / em)
sys.stdout.buffer.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
