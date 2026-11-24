#!/usr/bin/env node
// Unpack / repack the app code that lives inside index.html.
//
// index.html is a self-contained "bundled page": a small loader script plus
// a few <script type="__bundler/..."> blocks. Two of those hold our own code:
//   - __bundler/template  -> the main page (JSON-encoded string)
//   - __bundler/manifest  -> every embedded file (gzip + base64), including
//                            "Player Card.dc.html" (our card component)
// Everything else in the manifest (React, the dc runtime, fonts) is library
// code we never edit.
//
// Usage:
//   node tools/bundle.js unpack   index.html -> src/
//   node tools/bundle.js pack     src/       -> index.html
//   node tools/bundle.js check    fails if src/ and index.html disagree

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const SRC = path.join(ROOT, 'src');

// Our own files inside the bundle. 'template' = the main page;
// anything else is a manifest uuid.
const FILES = [
  { file: 'app.dc.html', where: 'template' },
  { file: 'Player Card.dc.html', where: '903eba40-3a1f-4512-bf89-cd1a3387844e' },
];

function readIndex() {
  const raw = fs.readFileSync(INDEX, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(eol);
  // Each __bundler block is: opening tag line, one data line, closing tag line.
  const dataLine = (type) => {
    const i = lines.findIndex((l) => l.trim() === `<script type="__bundler/${type}">`);
    if (i < 0) throw new Error(`index.html: missing __bundler/${type} block`);
    return i + 1;
  };
  return { eol, lines, templateAt: dataLine('template'), manifestAt: dataLine('manifest') };
}

// Same escaping the bundler uses so the text can sit inside a <script> tag.
function encodeTemplate(str) {
  return JSON.stringify(str).replace(/<\//g, '<\\u002F');
}

function readEmbedded(idx, where) {
  if (where === 'template') return JSON.parse(idx.lines[idx.templateAt]);
  const entry = JSON.parse(idx.lines[idx.manifestAt])[where];
  if (!entry) throw new Error(`manifest entry ${where} not found`);
  let buf = Buffer.from(entry.data, 'base64');
  if (entry.compressed) buf = zlib.gunzipSync(buf);
  return buf.toString('utf8');
}

function unpack() {
  const idx = readIndex();
  fs.mkdirSync(SRC, { recursive: true });
  for (const { file, where } of FILES) {
    const text = readEmbedded(idx, where);
    fs.writeFileSync(path.join(SRC, file), text);
    console.log(`unpacked src/${file} (${text.split('\n').length} lines)`);
  }
}

function readSrc(file) {
  // Editors on Windows may add CRLF; the bundle always uses LF.
  return fs.readFileSync(path.join(SRC, file), 'utf8').replace(/\r\n/g, '\n');
}

function pack() {
  const idx = readIndex();
  const manifest = JSON.parse(idx.lines[idx.manifestAt]);
  let changed = 0;
  for (const { file, where } of FILES) {
    const text = readSrc(file);
    if (text === readEmbedded(idx, where)) continue; // keep bytes stable if untouched
    changed++;
    if (where === 'template') {
      idx.lines[idx.templateAt] = encodeTemplate(text);
    } else {
      manifest[where].data = zlib.gzipSync(Buffer.from(text, 'utf8'), { level: 9 }).toString('base64');
      manifest[where].compressed = true;
    }
    console.log(`packed src/${file}`);
  }
  if (!changed) return console.log('nothing changed; index.html left as is');
  idx.lines[idx.manifestAt] = JSON.stringify(manifest);
  fs.writeFileSync(INDEX, idx.lines.join(idx.eol));
  console.log('index.html updated');
}

function check() {
  const idx = readIndex();
  let ok = true;
  for (const { file, where } of FILES) {
    if (readSrc(file) !== readEmbedded(idx, where)) {
      console.log(`OUT OF SYNC: src/${file} differs from index.html (run pack or unpack)`);
      ok = false;
    }
  }
  if (encodeTemplate(readEmbedded(idx, 'template')) !== idx.lines[idx.templateAt]) {
    console.log('WARNING: template encoding does not round-trip byte-for-byte');
    ok = false;
  }
  if (ok) console.log('in sync');
  process.exit(ok ? 0 : 1);
}

const cmd = process.argv[2];
({ unpack, pack, check }[cmd] || (() => {
  console.log('usage: node tools/bundle.js unpack|pack|check');
  process.exit(1);
}))();
