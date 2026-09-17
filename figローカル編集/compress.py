"""Local binary stdin/stdout helper. No network or Figma API calls."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / '.python-libs'))
import zstandard

sys.stdout.buffer.write(zstandard.ZstdCompressor(level=3).compress(sys.stdin.buffer.read()))
