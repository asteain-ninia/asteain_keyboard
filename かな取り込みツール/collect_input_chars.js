const fs = require("fs");
const path = require("path");
const vm = require("vm");

// 読み取り基準はキーボード置き場 (かな文字/)。共有スクリプトは ../ で参照する。
const HERE = path.join(__dirname, "..", "かな文字");

function read(name) {
  return fs.readFileSync(path.join(HERE, name), "utf8");
}

function decodeHtml(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal) => String.fromCodePoint(parseInt(decimal, 10)));
}

function dataName(name) {
  return name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function makeClassList(className) {
  const names = new Set(className.split(/\s+/).filter(Boolean));
  return {
    contains(name) {
      return names.has(name);
    },
    toggle(name, force) {
      let enabled = force;
      if (force === undefined) {
        enabled = !names.has(name);
      }
      if (enabled) names.add(name);
      else names.delete(name);
      return enabled;
    },
  };
}

function parseElements(html) {
  return [...html.matchAll(/<(button|span)\b([^>]*)>([\s\S]*?)<\/\1>/g)].map(([, tag, source, body]) => {
    const attributes = {};
    for (const match of source.matchAll(/([\w-]+)="([^"]*)"/g)) {
      attributes[match[1]] = decodeHtml(match[2]);
    }

    const dataset = {};
    for (const [name, value] of Object.entries(attributes)) {
      if (name.startsWith("data-")) dataset[dataName(name)] = value;
    }

    return {
      tag,
      id: attributes.id || "",
      dataset,
      textContent: decodeHtml(body.replace(/<[^>]+>/g, "").trim()),
      value: attributes.value || "",
      disabled: false,
      classList: makeClassList(attributes.class || ""),
      setAttribute(name, value) {
        this[name] = value;
      },
    };
  });
}

// 改行・タブなどの制御文字は「入力可能文字」に数えない (Enter/Tab キーの value)。
function addText(output, value) {
  if (typeof value !== "string") return;
  for (const character of value) {
    const codepoint = character.codePointAt(0);
    if (codepoint < 0x20) continue;
    output.add(codepoint);
  }
}

// 対応するセレクタは ".x" と ".x:not(.y)" だけ (ページ側が使う形)。
function selectByClass(list, selector) {
  const match = /^\.([\w-]+)(?::not\(\.([\w-]+)\))?$/.exec(selector);
  if (!match) return [];
  const [, className, excluded] = match;
  return list.filter((element) => {
    if (!element.classList.contains(className)) return false;
    if (excluded && element.classList.contains(excluded)) return false;
    return true;
  });
}

// keyboardRow の入れ子ごと再現したミニ DOM (両キーボードページ共通)。
// キーのラベルは行位置から描画されるので、行構造が無いとスクリプトが走らない。
function makeDocument(html) {
  const rows = [...html.matchAll(/<div class="keyboardRow">([\s\S]*?)<\/div>/g)]
    .map((match) => parseElements(match[1]));
  const elements = rows.flat();
  const ids = Object.fromEntries(elements.filter((element) => element.id).map((element) => [element.id, element]));
  const rowObjects = rows.map((rowElements) => ({
    querySelectorAll(selector) {
      return selectByClass(rowElements, selector);
    },
  }));
  return {
    ids,
    document: {
      querySelectorAll(selector) {
        if (selector === ".keyboardRow") return rowObjects;
        return selectByClass(elements, selector);
      },
      getElementById(id) {
        return ids[id] || null;
      },
    },
  };
}

function collectQwerty() {
  const html = read("QWERTY.html");
  const { ids, document } = makeDocument(html);
  const context = { document };
  vm.createContext(context);
  vm.runInContext(
    read("kana_data.js") + "\n" + read("romaji_keyboard.js")
      + "\nglobalThis.__inputTables = { ひらがな変換表, カタカナ変換表, 半角カナ変換表 };"
      + "\nglobalThis.__jisKeyRows = JIS配列;"
      + "\nglobalThis.__全角英数化 = 全角英数化;",
    context,
  );

  // 文字キーの通常面と Shift 面は JIS配列 が正 (HTML はラベルの初期値のみ)。
  const inputCharacters = new Set();
  for (const [normals, shifts] of context.__jisKeyRows) {
    addText(inputCharacters, normals);
    addText(inputCharacters, shifts);
  }

  const output = new Set(inputCharacters);
  for (const table of Object.values(context.__inputTables)) {
    for (const [input, value] of Object.entries(table)) {
      if ([...input].every((character) => inputCharacters.has(character.codePointAt(0)))) {
        addText(output, value);
      }
    }
  }
  // space キーの value は半角空白。全角英数モードでは insertLogic が全角にする。
  const hasWidthToggle = idsPresent(html, "widthToggle");
  if (html.includes('value="&#32;"')) {
    addText(output, " ");
    if (hasWidthToggle) addText(output, "　");
  }
  if (hasWidthToggle) {
    for (const codepoint of inputCharacters) {
      addText(output, context.__全角英数化(String.fromCodePoint(codepoint)));
    }
  }
  return output;
}

function idsPresent(html, id) {
  return html.includes(`id="${id}"`);
}

function collectKanaTable() {
  const html = read("かな文字.html");
  const { ids, document } = makeDocument(html);
  const context = { document };
  vm.createContext(context);
  vm.runInContext(
    read("kana_data.js") + "\n" + read("../syllabary.js") + "\n" + read("kana_table.js")
      + "\nglobalThis.__voicingTables = { 濁音化表, 半濁音化表 };"
      + "\nglobalThis.__voicingMarks = { 濁点記号, 半濁点記号 };"
      + "\nglobalThis.__半角カタカナ化 = 半角カタカナ化;",
    context,
  );

  const output = new Set();
  // 挿入される文字はキーのラベル (value があればそれ) なので、押せる .button を全部読む。
  const collectVisibleKeys = () => {
    for (const key of context.document.querySelectorAll(".button")) {
      if (key.disabled) continue;
      let inserted = key.textContent;
      if (key.value) {
        inserted = key.value;
      }
      addText(output, inserted);
    }
  };
  // CapsLock で小書き・二重括弧の層を固定して収集する。
  // space の全半角反転は 1 回限りの Shift にしか掛からないので、Shift 点灯中も一度読む。
  const collectWithShiftLayer = () => {
    collectVisibleKeys();
    context.CapsLock();
    collectVisibleKeys();
    context.CapsLock();
    context.Shift();
    collectVisibleKeys();
    context.Shift();
  };

  collectWithShiftLayer();
  context.toggleKanaMode();
  collectWithShiftLayer();
  if (ids.widthToggle) {
    context.toggleWidthMode();
    collectWithShiftLayer();
    context.toggleWidthMode();
  }
  context.toggleKanaMode();

  // Shift+゛ の単独記号・対が無い字への結合濁点・半角ｶﾅ中の半角記号は、
  // kana_table.js の定数 (濁点記号 等) から読む。
  if (html.includes("濁点適用()")) {
    Object.values(context.__voicingTables.濁音化表).forEach((value) => addText(output, value));
    const marks = context.__voicingMarks.濁点記号;
    addText(output, marks.単独 + marks.結合);
    if (ids.widthToggle) addText(output, context.__半角カタカナ化(marks.単独));
  }
  if (html.includes("半濁点適用()")) {
    Object.values(context.__voicingTables.半濁音化表).forEach((value) => addText(output, value));
    const marks = context.__voicingMarks.半濁点記号;
    addText(output, marks.単独 + marks.結合);
    if (ids.widthToggle) addText(output, context.__半角カタカナ化(marks.単独));
  }

  return output;
}

function sorted(set) {
  return [...set].sort((a, b) => a - b);
}

const qwerty = collectQwerty();
const kanaTable = collectKanaTable();
const all = new Set([...qwerty, ...kanaTable]);

process.stdout.write(JSON.stringify({
  qwerty: sorted(qwerty),
  kana_table: sorted(kanaTable),
  all: sorted(all),
}));
