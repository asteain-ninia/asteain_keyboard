"use strict";
// プラグインのメイン関数
function main() {
  // 現在の選択範囲を取得する
  const selection = figma.currentPage.selection;
  if (!selection[0]) {
    figma.closePlugin("対象が選択されていません。");
    return;
  }

  const entries = selection.map((node) => {
    const markerY = calculateMarkerY(node);
    const snappedX = Math.floor(node.x / 56) * 56;
    return { node, markerY, snappedX };
  });

  const sortedEntries = entries.sort((a, b) => {
    const yDiff = a.markerY - b.markerY;
    if (Math.abs(yDiff) > 1e-3) {
      return yDiff;
    }
    const xDiff = a.snappedX - b.snappedX;
    if (Math.abs(xDiff) > 1e-3) {
      return xDiff;
    }
    return a.node.x - b.node.x;
  });

  let lastMarkerY = null;
  let indexInRow = 0;

  for (const { node, markerY, snappedX } of sortedEntries) {
    if (lastMarkerY === null || Math.abs(markerY - lastMarkerY) > 1e-3) {
      indexInRow = 0;
      lastMarkerY = markerY;
    }

    // グループに差し込む目印用矩形を作成する
    const rect = figma.createRectangle();
    rect.x = snappedX;
    rect.y = markerY;
    rect.resize(2, 64);
    // 目印矩形の塗りを設定する
    rect.fills = [
      { type: "SOLID", color: figma.util.rgb("#D9D9D9"), opacity: 1 },
    ];

    const parent = node.parent;
    const newGroup = figma.group([node, rect], parent);
    const seq = String(indexInRow).padStart(2, "0");
    newGroup.name = `${seq}_${node.name}`;
    indexInRow += 1;
  }

  figma.closePlugin("すべての処理が完了しました。");
}

function calculateMarkerY(node) {
  let y = Math.floor(node.y / 64) * 64;
  if (node.y > 124 && node.y < 160 && node.y + node.height === 204) {
    y = 140;
  }
  return y;
}

// プラグインを実行する
main();

