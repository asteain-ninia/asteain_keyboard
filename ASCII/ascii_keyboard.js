//ASCII 系キーボード（ASCII.html / QWERTY.html）共通のスクリプト。
//Shift・CapsLock によるキーラベルの切替と Tab 挿入を担当する。
let shiftOn = false;
let capsOn = false;

function insertLogic(value1, insertChar) {
  return value1 + insertChar;
}

function isLetterKey(key) {
  const normal = key.dataset.normal;
  const shifted = key.dataset.shift;
  if (typeof normal !== "string" || typeof shifted !== "string") {
    return false;
  }
  if (normal.length !== 1 || shifted.length !== 1) {
    return false;
  }
  return normal.toLowerCase() === shifted.toLowerCase();
}

function updateKeyLabels() {
  const keys = document.querySelectorAll(".ascii-key");
  keys.forEach((key) => {
    const normal = key.dataset.normal;
    const shifted = key.dataset.shift;
    if (typeof normal !== "string" || typeof shifted !== "string") {
      return;
    }
    let next = normal;
    if (isLetterKey(key)) {
      let upper = shiftOn;
      if (capsOn) {
        upper = !shiftOn;
      }
      if (upper) {
        next = shifted;
      }
    } else if (shiftOn) {
      next = shifted;
    }
    if (typeof next === "string") {
      key.textContent = next;
    }
  });
}

function Shift() {
  shiftOn = !shiftOn;
  updateKeyLabels();
}

function CapsLock() {
  capsOn = !capsOn;
  updateKeyLabels();
}

updateKeyLabels();
