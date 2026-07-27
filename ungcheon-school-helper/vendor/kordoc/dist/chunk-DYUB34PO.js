#!/usr/bin/env node

// src/detect.ts
function magicBytes(buffer) {
  return new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
}
function isHwpxFile(buffer) {
  const b = magicBytes(buffer);
  return b[0] === 80 && b[1] === 75 && b[2] === 3 && b[3] === 4;
}
function isOldHwpFile(buffer) {
  const b = magicBytes(buffer);
  return b[0] === 208 && b[1] === 207 && b[2] === 17 && b[3] === 224;
}
function isPdfFile(buffer) {
  const b = magicBytes(buffer);
  return b[0] === 37 && b[1] === 80 && b[2] === 68 && b[3] === 70;
}
function detectFormat(buffer) {
  if (buffer.byteLength < 4) return "unknown";
  if (isHwpxFile(buffer)) return "hwpx";
  if (isOldHwpFile(buffer)) return "hwp";
  if (isPdfFile(buffer)) return "pdf";
  return "unknown";
}

// src/table/builder.ts
var MAX_COLS = 200;
var MAX_ROWS = 1e4;
function buildTable(rows) {
  if (rows.length > MAX_ROWS) rows = rows.slice(0, MAX_ROWS);
  const numRows = rows.length;
  const tempOccupied = /* @__PURE__ */ new Set();
  let maxCols = 0;
  for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
    let colIdx = 0;
    for (const cell of rows[rowIdx]) {
      while (colIdx < MAX_COLS && tempOccupied.has(rowIdx * MAX_COLS + colIdx)) colIdx++;
      if (colIdx >= MAX_COLS) break;
      for (let r = rowIdx; r < Math.min(rowIdx + cell.rowSpan, numRows); r++) {
        for (let c = colIdx; c < Math.min(colIdx + cell.colSpan, MAX_COLS); c++) {
          tempOccupied.add(r * MAX_COLS + c);
        }
      }
      colIdx += cell.colSpan;
      if (colIdx > maxCols) maxCols = colIdx;
    }
  }
  tempOccupied.clear();
  if (maxCols === 0) return { rows: 0, cols: 0, cells: [], hasHeader: false };
  const grid = Array.from(
    { length: numRows },
    () => Array.from({ length: maxCols }, () => ({ text: "", colSpan: 1, rowSpan: 1 }))
  );
  const occupied = Array.from({ length: numRows }, () => Array(maxCols).fill(false));
  for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
    let colIdx = 0;
    let cellIdx = 0;
    while (colIdx < maxCols && cellIdx < rows[rowIdx].length) {
      while (colIdx < maxCols && occupied[rowIdx][colIdx]) colIdx++;
      if (colIdx >= maxCols) break;
      const cell = rows[rowIdx][cellIdx];
      grid[rowIdx][colIdx] = {
        text: cell.text.trim(),
        colSpan: cell.colSpan,
        rowSpan: cell.rowSpan
      };
      for (let r = rowIdx; r < Math.min(rowIdx + cell.rowSpan, numRows); r++) {
        for (let c = colIdx; c < Math.min(colIdx + cell.colSpan, maxCols); c++) {
          occupied[r][c] = true;
        }
      }
      colIdx += cell.colSpan;
      cellIdx++;
    }
  }
  return { rows: numRows, cols: maxCols, cells: grid, hasHeader: numRows > 1 };
}
function convertTableToText(rows) {
  return rows.map(
    (row) => row.map((c) => c.text.trim().replace(/\n/g, " ")).filter(Boolean).join(" | ")
  ).filter(Boolean).join("\n");
}
function blocksToMarkdown(blocks) {
  const lines = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === "heading" && block.text) {
      const prefix = "#".repeat(Math.min(block.level || 2, 6));
      lines.push("", `${prefix} ${block.text}`, "");
      continue;
    }
    if (block.type === "separator") {
      lines.push("", "---", "");
      continue;
    }
    if (block.type === "list" && block.text) {
      const alreadyNumbered = block.listType === "ordered" && /^\d+\.\s/.test(block.text);
      const prefix = alreadyNumbered ? "" : block.listType === "ordered" ? "1. " : "- ";
      lines.push(`${prefix}${block.text}`);
      if (block.children) {
        for (const child of block.children) {
          const childPrefix = child.listType === "ordered" ? "1." : "-";
          lines.push(`  ${childPrefix} ${child.text || ""}`);
        }
      }
      continue;
    }
    if (block.type === "paragraph" && block.text) {
      let text = block.text;
      if (/^\[별표\s*\d+/.test(text)) {
        const nextBlock = blocks[i + 1];
        if (nextBlock?.type === "paragraph" && nextBlock.text && /관련\)?$/.test(nextBlock.text)) {
          lines.push("", `## ${text} ${nextBlock.text}`, "");
          i++;
        } else {
          lines.push("", `## ${text}`, "");
        }
        continue;
      }
      if (/^\([^)]*조[^)]*관련\)$/.test(text)) {
        lines.push(`*${text}*`, "");
        continue;
      }
      if (block.href) {
        text = `[${text}](${block.href})`;
      }
      if (block.footnoteText) {
        text += ` (\uC8FC: ${block.footnoteText})`;
      }
      lines.push(text);
    } else if (block.type === "table" && block.table) {
      if (lines.length > 0 && lines[lines.length - 1] !== "") {
        lines.push("");
      }
      lines.push(tableToMarkdown(block.table));
      lines.push("");
    }
  }
  return lines.join("\n").trim();
}
function tableToMarkdown(table) {
  if (table.rows === 0 || table.cols === 0) return "";
  const { cells, rows: numRows, cols: numCols } = table;
  if (numRows === 1 && numCols === 1) {
    const content = cells[0][0].text;
    return content.split(/\n/).map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      if (/^\d+\.\s/.test(trimmed)) return `**${trimmed}**`;
      if (/^[가-힣]\.\s/.test(trimmed)) return `  ${trimmed}`;
      return trimmed;
    }).filter(Boolean).join("\n");
  }
  const display = Array.from({ length: numRows }, () => Array(numCols).fill(""));
  const skip = /* @__PURE__ */ new Set();
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      if (skip.has(`${r},${c}`)) continue;
      const cell = cells[r][c];
      display[r][c] = cell.text.replace(/\n/g, "<br>");
      for (let dr = 0; dr < cell.rowSpan; dr++) {
        for (let dc = 0; dc < cell.colSpan; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (r + dr < numRows && c + dc < numCols) {
            skip.add(`${r + dr},${c + dc}`);
          }
        }
      }
    }
  }
  const uniqueRows = [];
  for (const row of display) {
    const isEmptyPlaceholder = row.every((cell) => cell === "");
    if (!isEmptyPlaceholder) uniqueRows.push(row);
  }
  if (uniqueRows.length === 0) return "";
  const md = [];
  md.push("| " + uniqueRows[0].join(" | ") + " |");
  md.push("| " + uniqueRows[0].map(() => "---").join(" | ") + " |");
  for (let i = 1; i < uniqueRows.length; i++) {
    md.push("| " + uniqueRows[i].join(" | ") + " |");
  }
  return md.join("\n");
}

// src/utils.ts
var VERSION = true ? "1.6.1" : "0.0.0-dev";
function toArrayBuffer(buf) {
  if (buf.byteOffset === 0 && buf.byteLength === buf.buffer.byteLength) {
    return buf.buffer;
  }
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}
var KordocError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "KordocError";
  }
};
function sanitizeError(err) {
  if (err instanceof KordocError) return err.message;
  return "\uBB38\uC11C \uCC98\uB9AC \uC911 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4";
}
function isPathTraversal(name) {
  const normalized = name.replace(/\\/g, "/");
  return normalized.includes("..") || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized);
}
function classifyError(err) {
  if (!(err instanceof Error)) return "PARSE_ERROR";
  const msg = err.message;
  if (msg.includes("\uC554\uD638\uD654")) return "ENCRYPTED";
  if (msg.includes("DRM")) return "DRM_PROTECTED";
  if (msg.includes("ZIP bomb") || msg.includes("ZIP \uBE44\uC555\uCD95 \uD06C\uAE30 \uCD08\uACFC") || msg.includes("ZIP \uC5D4\uD2B8\uB9AC \uC218 \uCD08\uACFC")) return "ZIP_BOMB";
  if (msg.includes("bomb") || msg.includes("\uD06C\uAE30 \uCD08\uACFC") || msg.includes("\uC555\uCD95 \uD574\uC81C")) return "DECOMPRESSION_BOMB";
  if (msg.includes("\uC774\uBBF8\uC9C0 \uAE30\uBC18")) return "IMAGE_BASED_PDF";
  if (msg.includes("\uC139\uC158") && (msg.includes("\uCC3E\uC744 \uC218 \uC5C6") || msg.includes("\uC5C6\uC74C"))) return "NO_SECTIONS";
  if (msg.includes("\uC2DC\uADF8\uB2C8\uCC98") || msg.includes("\uBCF5\uAD6C\uD560 \uC218 \uC5C6")) return "CORRUPTED";
  return "PARSE_ERROR";
}

// src/hwpx/parser.ts
import JSZip from "jszip";
import { inflateRawSync } from "zlib";
import { DOMParser } from "@xmldom/xmldom";

// src/page-range.ts
function parsePageRange(spec, maxPages) {
  const result = /* @__PURE__ */ new Set();
  if (maxPages <= 0) return result;
  if (Array.isArray(spec)) {
    for (const n of spec) {
      const page = Math.round(n);
      if (page >= 1 && page <= maxPages) result.add(page);
    }
    return result;
  }
  if (typeof spec !== "string" || spec.trim() === "") return result;
  const parts = spec.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      const start = Math.max(1, parseInt(rangeMatch[1], 10));
      const end = Math.min(maxPages, parseInt(rangeMatch[2], 10));
      for (let i = start; i <= end; i++) result.add(i);
    } else {
      const page = parseInt(trimmed, 10);
      if (!isNaN(page) && page >= 1 && page <= maxPages) result.add(page);
    }
  }
  return result;
}

// src/hwpx/parser.ts
var MAX_DECOMPRESS_SIZE = 100 * 1024 * 1024;
var MAX_ZIP_ENTRIES = 500;
function clampSpan(val, max) {
  return Math.max(1, Math.min(val, max));
}
async function extractHwpxStyles(zip) {
  const result = {
    charProperties: /* @__PURE__ */ new Map(),
    styles: /* @__PURE__ */ new Map()
  };
  const headerPaths = ["Contents/header.xml", "header.xml", "Contents/head.xml", "head.xml"];
  for (const hp of headerPaths) {
    const hpLower = hp.toLowerCase();
    const file = zip.file(hp) || Object.values(zip.files).find((f) => f.name.toLowerCase() === hpLower) || null;
    if (!file) continue;
    try {
      const xml = await file.async("text");
      const parser = new DOMParser();
      const doc = parser.parseFromString(stripDtd(xml), "text/xml");
      if (!doc.documentElement) continue;
      parseCharProperties(doc, result.charProperties);
      parseStyleElements(doc, result.styles);
      break;
    } catch {
      continue;
    }
  }
  return result;
}
function parseCharProperties(doc, map) {
  const tagNames = ["hh:charPr", "charPr", "hp:charPr"];
  for (const tagName of tagNames) {
    const elements = doc.getElementsByTagName(tagName);
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const id = el.getAttribute("id") || el.getAttribute("IDRef") || "";
      if (!id) continue;
      const prop = {};
      const height = el.getAttribute("height");
      if (height) prop.fontSize = parseInt(height, 10) / 100;
      const bold = el.getAttribute("bold");
      if (bold === "true" || bold === "1") prop.bold = true;
      const italic = el.getAttribute("italic");
      if (italic === "true" || italic === "1") prop.italic = true;
      const fontFaces = el.getElementsByTagName("*");
      for (let j = 0; j < fontFaces.length; j++) {
        const ff = fontFaces[j];
        const localTag = (ff.tagName || "").replace(/^[^:]+:/, "");
        if (localTag === "fontface" || localTag === "fontRef") {
          const face = ff.getAttribute("face") || ff.getAttribute("FontFace");
          if (face) {
            prop.fontName = face;
            break;
          }
        }
      }
      map.set(id, prop);
    }
  }
}
function parseStyleElements(doc, map) {
  const tagNames = ["hh:style", "style", "hp:style"];
  for (const tagName of tagNames) {
    const elements = doc.getElementsByTagName(tagName);
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      const id = el.getAttribute("id") || el.getAttribute("IDRef") || String(i);
      const name = el.getAttribute("name") || el.getAttribute("engName") || "";
      const charPrId = el.getAttribute("charPrIDRef") || void 0;
      const paraPrId = el.getAttribute("paraPrIDRef") || void 0;
      map.set(id, { name, charPrId, paraPrId });
    }
  }
}
function stripDtd(xml) {
  return xml.replace(/<!DOCTYPE\s[^[>]*(\[[\s\S]*?\])?\s*>/gi, "");
}
async function parseHwpxDocument(buffer, options) {
  const precheck = precheckZipSize(buffer);
  if (precheck.totalUncompressed > MAX_DECOMPRESS_SIZE) {
    throw new KordocError("ZIP \uBE44\uC555\uCD95 \uD06C\uAE30 \uCD08\uACFC (ZIP bomb \uC758\uC2EC)");
  }
  if (precheck.entryCount > MAX_ZIP_ENTRIES) {
    throw new KordocError("ZIP \uC5D4\uD2B8\uB9AC \uC218 \uCD08\uACFC (ZIP bomb \uC758\uC2EC)");
  }
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return extractFromBrokenZip(buffer);
  }
  const actualEntryCount = Object.keys(zip.files).length;
  if (actualEntryCount > MAX_ZIP_ENTRIES) {
    throw new KordocError("ZIP \uC5D4\uD2B8\uB9AC \uC218 \uCD08\uACFC (ZIP bomb \uC758\uC2EC)");
  }
  const metadata = {};
  await extractHwpxMetadata(zip, metadata);
  const styleMap = await extractHwpxStyles(zip);
  const warnings = [];
  const sectionPaths = await resolveSectionPaths(zip);
  if (sectionPaths.length === 0) throw new KordocError("HWPX\uC5D0\uC11C \uC139\uC158 \uD30C\uC77C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4");
  metadata.pageCount = sectionPaths.length;
  const pageFilter = options?.pages ? parsePageRange(options.pages, sectionPaths.length) : null;
  let totalDecompressed = 0;
  const blocks = [];
  for (let si = 0; si < sectionPaths.length; si++) {
    if (pageFilter && !pageFilter.has(si + 1)) continue;
    const file = zip.file(sectionPaths[si]);
    if (!file) continue;
    const xml = await file.async("text");
    totalDecompressed += xml.length * 2;
    if (totalDecompressed > MAX_DECOMPRESS_SIZE) throw new KordocError("ZIP \uC555\uCD95 \uD574\uC81C \uD06C\uAE30 \uCD08\uACFC (ZIP bomb \uC758\uC2EC)");
    blocks.push(...parseSectionXml(xml, styleMap, warnings, si + 1));
  }
  detectHwpxHeadings(blocks, styleMap);
  const outline = blocks.filter((b) => b.type === "heading" && b.level && b.text).map((b) => ({ level: b.level, text: b.text, pageNumber: b.pageNumber }));
  const markdown = blocksToMarkdown(blocks);
  return { markdown, blocks, metadata, outline: outline.length > 0 ? outline : void 0, warnings: warnings.length > 0 ? warnings : void 0 };
}
async function extractHwpxMetadata(zip, metadata) {
  try {
    const metaPaths = ["meta.xml", "META-INF/meta.xml", "docProps/core.xml"];
    for (const mp of metaPaths) {
      const file = zip.file(mp) || Object.values(zip.files).find((f) => f.name.toLowerCase() === mp.toLowerCase()) || null;
      if (!file) continue;
      const xml = await file.async("text");
      parseDublinCoreMetadata(xml, metadata);
      if (metadata.title || metadata.author) return;
    }
  } catch {
  }
}
function parseDublinCoreMetadata(xml, metadata) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(stripDtd(xml), "text/xml");
  if (!doc.documentElement) return;
  const getText = (tagNames) => {
    for (const tag of tagNames) {
      const els = doc.getElementsByTagName(tag);
      if (els.length > 0) {
        const text = els[0].textContent?.trim();
        if (text) return text;
      }
    }
    return void 0;
  };
  metadata.title = metadata.title || getText(["dc:title", "title"]);
  metadata.author = metadata.author || getText(["dc:creator", "creator", "cp:lastModifiedBy"]);
  metadata.description = metadata.description || getText(["dc:description", "description", "dc:subject", "subject"]);
  metadata.createdAt = metadata.createdAt || getText(["dcterms:created", "meta:creation-date"]);
  metadata.modifiedAt = metadata.modifiedAt || getText(["dcterms:modified", "meta:date"]);
  const keywords = getText(["dc:keyword", "cp:keywords", "meta:keyword"]);
  if (keywords && !metadata.keywords) {
    metadata.keywords = keywords.split(/[,;]/).map((k) => k.trim()).filter(Boolean);
  }
}
async function extractHwpxMetadataOnly(buffer) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new KordocError("HWPX ZIP\uC744 \uC5F4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4");
  }
  const metadata = {};
  await extractHwpxMetadata(zip, metadata);
  const sectionPaths = await resolveSectionPaths(zip);
  metadata.pageCount = sectionPaths.length;
  return metadata;
}
function precheckZipSize(buffer) {
  try {
    const data = new DataView(buffer);
    const len = buffer.byteLength;
    if (len < 22) return { totalUncompressed: 0, entryCount: 0 };
    const searchStart = Math.max(0, len - 22 - 65535);
    let eocdOffset = -1;
    for (let i = len - 22; i >= searchStart; i--) {
      if (data.getUint32(i, true) === 101010256) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset < 0) return { totalUncompressed: 0, entryCount: 0 };
    const entryCount = data.getUint16(eocdOffset + 10, true);
    const cdSize = data.getUint32(eocdOffset + 12, true);
    const cdOffset = data.getUint32(eocdOffset + 16, true);
    if (cdOffset + cdSize > len) return { totalUncompressed: 0, entryCount };
    let totalUncompressed = 0;
    let pos = cdOffset;
    for (let i = 0; i < entryCount && pos + 46 <= cdOffset + cdSize; i++) {
      if (data.getUint32(pos, true) !== 33639248) break;
      totalUncompressed += data.getUint32(pos + 24, true);
      const nameLen = data.getUint16(pos + 28, true);
      const extraLen = data.getUint16(pos + 30, true);
      const commentLen = data.getUint16(pos + 32, true);
      pos += 46 + nameLen + extraLen + commentLen;
    }
    return { totalUncompressed, entryCount };
  } catch {
    return { totalUncompressed: 0, entryCount: 0 };
  }
}
function extractFromBrokenZip(buffer) {
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let pos = 0;
  const blocks = [];
  let totalDecompressed = 0;
  let entryCount = 0;
  while (pos < data.length - 30) {
    if (data[pos] !== 80 || data[pos + 1] !== 75 || data[pos + 2] !== 3 || data[pos + 3] !== 4) break;
    if (++entryCount > MAX_ZIP_ENTRIES) break;
    const method = view.getUint16(pos + 8, true);
    const compSize = view.getUint32(pos + 18, true);
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);
    if (nameLen > 1024 || extraLen > 65535) {
      pos += 30 + nameLen + extraLen;
      continue;
    }
    const fileStart = pos + 30 + nameLen + extraLen;
    if (fileStart + compSize > data.length) break;
    if (compSize === 0 && method !== 0) {
      pos = fileStart;
      continue;
    }
    const nameBytes = data.slice(pos + 30, pos + 30 + nameLen);
    const name = new TextDecoder().decode(nameBytes);
    if (isPathTraversal(name)) {
      pos = fileStart + compSize;
      continue;
    }
    const fileData = data.slice(fileStart, fileStart + compSize);
    pos = fileStart + compSize;
    if (!name.toLowerCase().includes("section") || !name.endsWith(".xml")) continue;
    try {
      let content;
      if (method === 0) {
        content = new TextDecoder().decode(fileData);
      } else if (method === 8) {
        const decompressed = inflateRawSync(Buffer.from(fileData), { maxOutputLength: MAX_DECOMPRESS_SIZE });
        content = new TextDecoder().decode(decompressed);
      } else {
        continue;
      }
      totalDecompressed += content.length * 2;
      if (totalDecompressed > MAX_DECOMPRESS_SIZE) throw new KordocError("\uC555\uCD95 \uD574\uC81C \uD06C\uAE30 \uCD08\uACFC");
      blocks.push(...parseSectionXml(content));
    } catch {
      continue;
    }
  }
  if (blocks.length === 0) throw new KordocError("\uC190\uC0C1\uB41C HWPX\uC5D0\uC11C \uC139\uC158 \uB370\uC774\uD130\uB97C \uBCF5\uAD6C\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4");
  const markdown = blocksToMarkdown(blocks);
  return { markdown, blocks };
}
async function resolveSectionPaths(zip) {
  const manifestPaths = ["Contents/content.hpf", "content.hpf"];
  for (const mp of manifestPaths) {
    const mpLower = mp.toLowerCase();
    const file = zip.file(mp) || Object.values(zip.files).find((f) => f.name.toLowerCase() === mpLower) || null;
    if (!file) continue;
    const xml = await file.async("text");
    const paths = parseSectionPathsFromManifest(xml);
    if (paths.length > 0) return paths;
  }
  const sectionFiles = zip.file(/[Ss]ection\d+\.xml$/);
  return sectionFiles.map((f) => f.name).sort();
}
function parseSectionPathsFromManifest(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(stripDtd(xml), "text/xml");
  const items = doc.getElementsByTagName("opf:item");
  const spine = doc.getElementsByTagName("opf:itemref");
  const isSectionId = (id) => /^s/i.test(id) || id.toLowerCase().includes("section");
  const idToHref = /* @__PURE__ */ new Map();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const id = item.getAttribute("id") || "";
    let href = item.getAttribute("href") || "";
    const mediaType = item.getAttribute("media-type") || "";
    if (!isSectionId(id) && !mediaType.includes("xml")) continue;
    if (!href.startsWith("/") && !href.startsWith("Contents/") && isSectionId(id))
      href = "Contents/" + href;
    idToHref.set(id, href);
  }
  if (spine.length > 0) {
    const ordered = [];
    for (let i = 0; i < spine.length; i++) {
      const href = idToHref.get(spine[i].getAttribute("idref") || "");
      if (href) ordered.push(href);
    }
    if (ordered.length > 0) return ordered;
  }
  return Array.from(idToHref.entries()).filter(([id]) => isSectionId(id)).sort((a, b) => a[0].localeCompare(b[0])).map(([, href]) => href);
}
function detectHwpxHeadings(blocks, styleMap) {
  let baseFontSize = 0;
  const sizeFreq = /* @__PURE__ */ new Map();
  for (const b of blocks) {
    if (b.style?.fontSize) {
      sizeFreq.set(b.style.fontSize, (sizeFreq.get(b.style.fontSize) || 0) + 1);
    }
  }
  let maxCount = 0;
  for (const [size, count] of sizeFreq) {
    if (count > maxCount) {
      maxCount = count;
      baseFontSize = size;
    }
  }
  for (const block of blocks) {
    if (block.type !== "paragraph" || !block.text) continue;
    const text = block.text.trim();
    if (text.length === 0 || text.length > 200 || /^\d+$/.test(text)) continue;
    let level = 0;
    if (baseFontSize > 0 && block.style?.fontSize) {
      const ratio = block.style.fontSize / baseFontSize;
      if (ratio >= 1.5) level = 1;
      else if (ratio >= 1.3) level = 2;
      else if (ratio >= 1.15) level = 3;
    }
    if (/^제\d+[조장절편]/.test(text) && text.length <= 50) {
      if (level === 0) level = 3;
    }
    if (level > 0) {
      block.type = "heading";
      block.level = level;
    }
  }
}
function parseSectionXml(xml, styleMap, warnings, sectionNum) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(stripDtd(xml), "text/xml");
  if (!doc.documentElement) return [];
  const blocks = [];
  walkSection(doc.documentElement, blocks, null, [], styleMap, warnings, sectionNum);
  return blocks;
}
function walkSection(node, blocks, tableCtx, tableStack, styleMap, warnings, sectionNum) {
  const children = node.childNodes;
  if (!children) return;
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.nodeType !== 1) continue;
    const tag = el.tagName || el.localName || "";
    const localTag = tag.replace(/^[^:]+:/, "");
    switch (localTag) {
      case "tbl": {
        if (tableCtx) tableStack.push(tableCtx);
        const newTable = { rows: [], currentRow: [], cell: null };
        walkSection(el, blocks, newTable, tableStack, styleMap, warnings, sectionNum);
        if (newTable.rows.length > 0) {
          if (tableStack.length > 0) {
            const parentTable = tableStack.pop();
            const nestedText = convertTableToText(newTable.rows);
            if (parentTable.cell) {
              parentTable.cell.text += (parentTable.cell.text ? "\n" : "") + nestedText;
            }
            tableCtx = parentTable;
          } else {
            blocks.push({ type: "table", table: buildTable(newTable.rows), pageNumber: sectionNum });
            tableCtx = null;
          }
        } else {
          tableCtx = tableStack.length > 0 ? tableStack.pop() : null;
        }
        break;
      }
      case "tr":
        if (tableCtx) {
          tableCtx.currentRow = [];
          walkSection(el, blocks, tableCtx, tableStack, styleMap, warnings, sectionNum);
          if (tableCtx.currentRow.length > 0) tableCtx.rows.push(tableCtx.currentRow);
          tableCtx.currentRow = [];
        }
        break;
      case "tc":
        if (tableCtx) {
          tableCtx.cell = { text: "", colSpan: 1, rowSpan: 1 };
          walkSection(el, blocks, tableCtx, tableStack, styleMap, warnings, sectionNum);
          if (tableCtx.cell) {
            tableCtx.currentRow.push(tableCtx.cell);
            tableCtx.cell = null;
          }
        }
        break;
      case "cellSpan":
        if (tableCtx?.cell) {
          const cs = parseInt(el.getAttribute("colSpan") || "1", 10);
          const rs = parseInt(el.getAttribute("rowSpan") || "1", 10);
          tableCtx.cell.colSpan = clampSpan(cs, MAX_COLS);
          tableCtx.cell.rowSpan = clampSpan(rs, MAX_ROWS);
        }
        break;
      case "p": {
        const { text, href, footnote, style } = extractParagraphInfo(el, styleMap);
        if (text) {
          if (tableCtx?.cell) {
            tableCtx.cell.text += (tableCtx.cell.text ? "\n" : "") + text;
          } else if (!tableCtx) {
            const block = { type: "paragraph", text, pageNumber: sectionNum };
            if (style) block.style = style;
            if (href) block.href = href;
            if (footnote) block.footnoteText = footnote;
            blocks.push(block);
          }
        }
        tableCtx = walkParagraphChildren(el, blocks, tableCtx, tableStack, styleMap, warnings, sectionNum);
        break;
      }
      // 이미지/그림 — 경고 수집
      case "pic":
      case "shape":
      case "drawingObject":
        if (warnings && sectionNum) {
          warnings.push({ page: sectionNum, message: `\uC2A4\uD0B5\uB41C \uC694\uC18C: ${localTag}`, code: "SKIPPED_IMAGE" });
        }
        break;
      default:
        walkSection(el, blocks, tableCtx, tableStack, styleMap, warnings, sectionNum);
        break;
    }
  }
}
function walkParagraphChildren(node, blocks, tableCtx, tableStack, styleMap, warnings, sectionNum) {
  const children = node.childNodes;
  if (!children) return tableCtx;
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (el.nodeType !== 1) continue;
    const tag = el.tagName || el.localName || "";
    const localTag = tag.replace(/^[^:]+:/, "");
    if (localTag === "tbl") {
      if (tableCtx) tableStack.push(tableCtx);
      const newTable = { rows: [], currentRow: [], cell: null };
      walkSection(el, blocks, newTable, tableStack, styleMap, warnings, sectionNum);
      if (newTable.rows.length > 0) {
        if (tableStack.length > 0) {
          const parentTable = tableStack.pop();
          const nestedText = convertTableToText(newTable.rows);
          if (parentTable.cell) {
            parentTable.cell.text += (parentTable.cell.text ? "\n" : "") + nestedText;
          }
          tableCtx = parentTable;
        } else {
          blocks.push({ type: "table", table: buildTable(newTable.rows), pageNumber: sectionNum });
          tableCtx = null;
        }
      } else {
        tableCtx = tableStack.length > 0 ? tableStack.pop() : null;
      }
    } else if (localTag === "pic" || localTag === "shape" || localTag === "drawingObject") {
      if (warnings && sectionNum) {
        warnings.push({ page: sectionNum, message: `\uC2A4\uD0B5\uB41C \uC694\uC18C: ${localTag}`, code: "SKIPPED_IMAGE" });
      }
    }
  }
  return tableCtx;
}
function extractParagraphInfo(para, styleMap) {
  let text = "";
  let href;
  let footnote;
  let charPrId;
  const walk = (node) => {
    const children = node.childNodes;
    if (!children) return;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.nodeType === 3) {
        text += child.textContent || "";
        continue;
      }
      if (child.nodeType !== 1) continue;
      const tag = (child.tagName || child.localName || "").replace(/^[^:]+:/, "");
      switch (tag) {
        case "t":
          text += child.textContent || "";
          break;
        case "tab":
          text += "	";
          break;
        case "br":
          if ((child.getAttribute("type") || "line") === "line") text += "\n";
          break;
        case "fwSpace":
        case "hwSpace":
          text += " ";
          break;
        case "tbl":
          break;
        // 테이블은 walkSection에서 처리
        // 하이퍼링크
        case "hyperlink": {
          const url = child.getAttribute("url") || child.getAttribute("href") || "";
          if (url) href = url;
          walk(child);
          break;
        }
        // 각주/미주
        case "footNote":
        case "endNote":
        case "fn":
        case "en": {
          const noteText = extractTextFromNode(child);
          if (noteText) footnote = (footnote ? footnote + "; " : "") + noteText;
          break;
        }
        // run 요소에서 charPrIDRef 추출
        case "r": {
          const runCharPr = child.getAttribute("charPrIDRef");
          if (runCharPr && !charPrId) charPrId = runCharPr;
          walk(child);
          break;
        }
        default:
          walk(child);
          break;
      }
    }
  };
  walk(para);
  const cleanText = text.replace(/[ \t]+/g, " ").trim();
  let style;
  if (styleMap && charPrId) {
    const charProp = styleMap.charProperties.get(charPrId);
    if (charProp) {
      style = {};
      if (charProp.fontSize) style.fontSize = charProp.fontSize;
      if (charProp.bold) style.bold = true;
      if (charProp.italic) style.italic = true;
      if (charProp.fontName) style.fontName = charProp.fontName;
      if (!style.fontSize && !style.bold && !style.italic) style = void 0;
    }
  }
  return { text: cleanText, href, footnote, style };
}
function extractTextFromNode(node) {
  let result = "";
  const children = node.childNodes;
  if (!children) return result;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType === 3) result += child.textContent || "";
    else if (child.nodeType === 1) result += extractTextFromNode(child);
  }
  return result.trim();
}

// src/hwp5/record.ts
import { inflateRawSync as inflateRawSync2, inflateSync } from "zlib";
var TAG_PARA_HEADER = 66;
var TAG_PARA_TEXT = 67;
var TAG_CHAR_SHAPE = 68;
var TAG_CTRL_HEADER = 71;
var TAG_LIST_HEADER = 72;
var TAG_TABLE = 77;
var TAG_DOC_CHAR_SHAPE = 55;
var TAG_DOC_STYLE = 58;
var CHAR_LINE = 0;
var CHAR_PARA = 13;
var CHAR_TAB = 9;
var CHAR_HYPHEN = 30;
var CHAR_NBSP = 31;
var CHAR_FIXED_NBSP = 24;
var FLAG_COMPRESSED = 1 << 0;
var FLAG_ENCRYPTED = 1 << 1;
var FLAG_DRM = 1 << 4;
var MAX_RECORDS = 5e5;
function readRecords(data) {
  const records = [];
  let offset = 0;
  while (offset + 4 <= data.length && records.length < MAX_RECORDS) {
    const header = data.readUInt32LE(offset);
    offset += 4;
    const tagId = header & 1023;
    const level = header >> 10 & 1023;
    let size = header >> 20 & 4095;
    if (size === 4095) {
      if (offset + 4 > data.length) break;
      size = data.readUInt32LE(offset);
      offset += 4;
    }
    if (offset + size > data.length) break;
    records.push({ tagId, level, size, data: data.subarray(offset, offset + size) });
    offset += size;
  }
  return records;
}
var MAX_DECOMPRESS_SIZE2 = 100 * 1024 * 1024;
function decompressStream(data) {
  const opts = { maxOutputLength: MAX_DECOMPRESS_SIZE2 };
  if (data.length >= 2 && data[0] === 120) {
    try {
      return inflateSync(data, opts);
    } catch {
    }
  }
  return inflateRawSync2(data, opts);
}
function parseFileHeader(data) {
  if (data.length < 40) throw new KordocError("FileHeader\uAC00 \uB108\uBB34 \uC9E7\uC2B5\uB2C8\uB2E4 (\uCD5C\uC18C 40\uBC14\uC774\uD2B8)");
  const sig = data.subarray(0, 32).toString("utf8").replace(/\0+$/, "");
  return {
    signature: sig,
    versionMajor: data[35],
    flags: data.readUInt32LE(36)
  };
}
function parseDocInfo(records) {
  const charShapes = [];
  const styles = [];
  for (const rec of records) {
    if (rec.tagId === TAG_DOC_CHAR_SHAPE && rec.data.length >= 18) {
      if (rec.data.length >= 50) {
        const fontSize = rec.data.readUInt32LE(42);
        const attrFlags = rec.data.readUInt32LE(46);
        charShapes.push({ fontSize, attrFlags });
      } else {
        charShapes.push({ fontSize: 0, attrFlags: 0 });
      }
    }
    if (rec.tagId === TAG_DOC_STYLE && rec.data.length >= 8) {
      try {
        let offset = 0;
        const nameLen = rec.data.readUInt16LE(offset);
        offset += 2;
        const nameBytes = nameLen * 2;
        const name = nameBytes > 0 && offset + nameBytes <= rec.data.length ? rec.data.subarray(offset, offset + nameBytes).toString("utf16le") : "";
        offset += nameBytes;
        let nameKo = "";
        if (offset + 2 <= rec.data.length) {
          const nameKoLen = rec.data.readUInt16LE(offset);
          offset += 2;
          const nameKoBytes = nameKoLen * 2;
          if (nameKoBytes > 0 && offset + nameKoBytes <= rec.data.length) {
            nameKo = rec.data.subarray(offset, offset + nameKoBytes).toString("utf16le");
          }
          offset += nameKoBytes;
        }
        const type = offset < rec.data.length ? rec.data.readUInt8(offset) : 0;
        offset += 1;
        offset += 2;
        offset += 2;
        const paraShapeId = offset + 2 <= rec.data.length ? rec.data.readUInt16LE(offset) : 0;
        offset += 2;
        const charShapeId = offset + 2 <= rec.data.length ? rec.data.readUInt16LE(offset) : 0;
        styles.push({ name, nameKo, charShapeId, paraShapeId, type });
      } catch {
      }
    }
  }
  return { charShapes, styles };
}
function extractText(data) {
  let result = "";
  let i = 0;
  while (i + 1 < data.length) {
    const ch = data.readUInt16LE(i);
    i += 2;
    switch (ch) {
      case CHAR_LINE:
        result += "\n";
        break;
      case CHAR_PARA:
        break;
      case CHAR_TAB:
        result += "	";
        if (i + 14 <= data.length) i += 14;
        break;
      case CHAR_HYPHEN:
        result += "-";
        break;
      case CHAR_NBSP:
      case CHAR_FIXED_NBSP:
        result += " ";
        break;
      default:
        if (ch >= 1 && ch <= 31) {
          const isExt = ch >= 1 && ch <= 3 || ch >= 10 && ch <= 18 || ch >= 21 && ch <= 23;
          const isInline = ch >= 4 && ch <= 9 || ch >= 19 && ch <= 20;
          if ((isExt || isInline) && i + 14 <= data.length) i += 14;
        } else if (ch >= 32) {
          if (ch >= 55296 && ch <= 56319 && i + 1 < data.length) {
            const lo = data.readUInt16LE(i);
            if (lo >= 56320 && lo <= 57343) {
              i += 2;
              const codePoint = (ch - 55296 << 10) + (lo - 56320) + 65536;
              result += String.fromCodePoint(codePoint);
              break;
            }
          }
          result += String.fromCharCode(ch);
        }
        break;
    }
  }
  return result;
}

// src/hwp5/parser.ts
import { createRequire } from "module";
var require2 = createRequire(import.meta.url);
var CFB = require2("cfb");
var MAX_SECTIONS = 100;
var MAX_TOTAL_DECOMPRESS = 100 * 1024 * 1024;
function parseHwp5Document(buffer, options) {
  const cfb = CFB.parse(buffer);
  const headerEntry = CFB.find(cfb, "/FileHeader");
  if (!headerEntry?.content) throw new KordocError("FileHeader \uC2A4\uD2B8\uB9BC \uC5C6\uC74C");
  const header = parseFileHeader(Buffer.from(headerEntry.content));
  if (header.signature !== "HWP Document File") throw new KordocError("HWP \uC2DC\uADF8\uB2C8\uCC98 \uBD88\uC77C\uCE58");
  if (header.flags & FLAG_ENCRYPTED) throw new KordocError("\uC554\uD638\uD654\uB41C HWP\uB294 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4");
  if (header.flags & FLAG_DRM) throw new KordocError("DRM \uBCF4\uD638\uB41C HWP\uB294 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4");
  const compressed = (header.flags & FLAG_COMPRESSED) !== 0;
  const metadata = {
    version: `${header.versionMajor}.x`
  };
  extractHwp5Metadata(cfb, metadata);
  const docInfo = parseDocInfoStream(cfb, compressed);
  const warnings = [];
  const sections = findSections(cfb);
  if (sections.length === 0) throw new KordocError("\uC139\uC158 \uC2A4\uD2B8\uB9BC\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4");
  metadata.pageCount = sections.length;
  const pageFilter = options?.pages ? parsePageRange(options.pages, sections.length) : null;
  const blocks = [];
  let totalDecompressed = 0;
  for (let si = 0; si < sections.length; si++) {
    if (pageFilter && !pageFilter.has(si + 1)) continue;
    const sectionData = sections[si];
    const data = compressed ? decompressStream(Buffer.from(sectionData)) : Buffer.from(sectionData);
    totalDecompressed += data.length;
    if (totalDecompressed > MAX_TOTAL_DECOMPRESS) throw new KordocError("\uCD1D \uC555\uCD95 \uD574\uC81C \uD06C\uAE30 \uCD08\uACFC (decompression bomb \uC758\uC2EC)");
    const records = readRecords(data);
    const sectionBlocks = parseSection(records, docInfo, warnings, si + 1);
    blocks.push(...sectionBlocks);
  }
  if (docInfo) {
    detectHwp5Headings(blocks, docInfo);
  }
  const outline = blocks.filter((b) => b.type === "heading" && b.level && b.text).map((b) => ({ level: b.level, text: b.text, pageNumber: b.pageNumber }));
  const markdown = blocksToMarkdown(blocks);
  return { markdown, blocks, metadata, outline: outline.length > 0 ? outline : void 0, warnings: warnings.length > 0 ? warnings : void 0 };
}
function parseDocInfoStream(cfb, compressed) {
  try {
    const entry = CFB.find(cfb, "/DocInfo");
    if (!entry?.content) return null;
    const data = compressed ? decompressStream(Buffer.from(entry.content)) : Buffer.from(entry.content);
    const records = readRecords(data);
    return parseDocInfo(records);
  } catch {
    return null;
  }
}
function detectHwp5Headings(blocks, docInfo) {
  let baseFontSize = 0;
  for (const style of docInfo.styles) {
    const name = (style.nameKo || style.name).toLowerCase();
    if (name.includes("\uBC14\uD0D5") || name.includes("\uBCF8\uBB38") || name === "normal" || name === "body") {
      const cs = docInfo.charShapes[style.charShapeId];
      if (cs?.fontSize > 0) {
        baseFontSize = cs.fontSize / 10;
        break;
      }
    }
  }
  if (baseFontSize === 0) {
    const sizeFreq = /* @__PURE__ */ new Map();
    for (const b of blocks) {
      if (b.style?.fontSize) {
        sizeFreq.set(b.style.fontSize, (sizeFreq.get(b.style.fontSize) || 0) + 1);
      }
    }
    let maxCount = 0;
    for (const [size, count] of sizeFreq) {
      if (count > maxCount) {
        maxCount = count;
        baseFontSize = size;
      }
    }
  }
  if (baseFontSize <= 0) return;
  for (const block of blocks) {
    if (block.type !== "paragraph" || !block.text || !block.style?.fontSize) continue;
    const text = block.text.trim();
    if (text.length === 0 || text.length > 200) continue;
    if (/^\d+$/.test(text)) continue;
    const ratio = block.style.fontSize / baseFontSize;
    let level = 0;
    if (ratio >= 1.5) level = 1;
    else if (ratio >= 1.3) level = 2;
    else if (ratio >= 1.15) level = 3;
    if (/^제\d+[조장절편]/.test(text) && text.length <= 50) {
      if (level === 0) level = 3;
    }
    if (level > 0) {
      block.type = "heading";
      block.level = level;
    }
  }
}
function extractHwp5Metadata(cfb, metadata) {
  try {
    const summaryEntry = CFB.find(cfb, "/HwpSummaryInformation") || CFB.find(cfb, "/SummaryInformation");
    if (!summaryEntry?.content) return;
    const data = Buffer.from(summaryEntry.content);
    if (data.length < 48) return;
    const numSets = data.readUInt32LE(24);
    if (numSets === 0) return;
    const setOffset = data.readUInt32LE(44);
    if (setOffset >= data.length - 8) return;
    const numProps = data.readUInt32LE(setOffset + 4);
    if (numProps === 0 || numProps > 100) return;
    for (let i = 0; i < numProps; i++) {
      const entryOffset = setOffset + 8 + i * 8;
      if (entryOffset + 8 > data.length) break;
      const propId = data.readUInt32LE(entryOffset);
      const propOffset = setOffset + data.readUInt32LE(entryOffset + 4);
      if (propOffset + 8 > data.length) continue;
      if (propId !== 2 && propId !== 4 && propId !== 6) continue;
      const propType = data.readUInt32LE(propOffset);
      if (propType !== 30) continue;
      const strLen = data.readUInt32LE(propOffset + 4);
      if (strLen === 0 || strLen > 1e4 || propOffset + 8 + strLen > data.length) continue;
      const str = data.subarray(propOffset + 8, propOffset + 8 + strLen).toString("utf8").replace(/\0+$/, "").trim();
      if (!str) continue;
      if (propId === 2) metadata.title = str;
      else if (propId === 4) metadata.author = str;
      else if (propId === 6) metadata.description = str;
    }
  } catch {
  }
}
function extractHwp5MetadataOnly(buffer) {
  const cfb = CFB.parse(buffer);
  const headerEntry = CFB.find(cfb, "/FileHeader");
  if (!headerEntry?.content) throw new KordocError("FileHeader \uC2A4\uD2B8\uB9BC \uC5C6\uC74C");
  const header = parseFileHeader(Buffer.from(headerEntry.content));
  if (header.signature !== "HWP Document File") throw new KordocError("HWP \uC2DC\uADF8\uB2C8\uCC98 \uBD88\uC77C\uCE58");
  const metadata = {
    version: `${header.versionMajor}.x`
  };
  extractHwp5Metadata(cfb, metadata);
  const sections = findSections(cfb);
  metadata.pageCount = sections.length;
  return metadata;
}
function findSections(cfb) {
  const sections = [];
  for (let i = 0; i < MAX_SECTIONS; i++) {
    const entry = CFB.find(cfb, `/BodyText/Section${i}`);
    if (!entry?.content) break;
    sections.push({ idx: i, content: Buffer.from(entry.content) });
  }
  if (sections.length === 0 && cfb.FileIndex) {
    for (const entry of cfb.FileIndex) {
      if (sections.length >= MAX_SECTIONS) break;
      if (entry.name?.startsWith("Section") && entry.content) {
        const idx = parseInt(entry.name.replace("Section", ""), 10) || 0;
        sections.push({ idx, content: Buffer.from(entry.content) });
      }
    }
  }
  return sections.sort((a, b) => a.idx - b.idx).map((s) => s.content);
}
function parseSection(records, docInfo, warnings, sectionNum) {
  const blocks = [];
  let i = 0;
  while (i < records.length) {
    const rec = records[i];
    if (rec.tagId === TAG_PARA_HEADER && rec.level === 0) {
      const { paragraph, tables, nextIdx, charShapeIds } = parseParagraphWithTables(records, i);
      if (paragraph) {
        const block = { type: "paragraph", text: paragraph, pageNumber: sectionNum };
        if (docInfo && charShapeIds.length > 0) {
          const style = resolveCharStyle(charShapeIds, docInfo);
          if (style) block.style = style;
        }
        blocks.push(block);
      }
      for (const t of tables) blocks.push({ type: "table", table: t, pageNumber: sectionNum });
      i = nextIdx;
      continue;
    }
    if (rec.tagId === TAG_CTRL_HEADER && rec.level <= 1 && rec.data.length >= 4) {
      const ctrlId = rec.data.subarray(0, 4).toString("ascii");
      if (ctrlId === " lbt" || ctrlId === "tbl ") {
        const { table, nextIdx } = parseTableBlock(records, i);
        if (table) blocks.push({ type: "table", table, pageNumber: sectionNum });
        i = nextIdx;
        continue;
      }
      if (ctrlId === "gso " || ctrlId === " osg" || ctrlId === " elo" || ctrlId === "ole ") {
        warnings.push({ page: sectionNum, message: `\uC2A4\uD0B5\uB41C \uC81C\uC5B4 \uC694\uC18C: ${ctrlId.trim()}`, code: "SKIPPED_IMAGE" });
      }
    }
    i++;
  }
  return blocks;
}
function resolveCharStyle(charShapeIds, docInfo) {
  if (charShapeIds.length === 0 || docInfo.charShapes.length === 0) return void 0;
  const freq = /* @__PURE__ */ new Map();
  let maxCount = 0, dominantId = charShapeIds[0];
  for (const id of charShapeIds) {
    const count = (freq.get(id) || 0) + 1;
    freq.set(id, count);
    if (count > maxCount) {
      maxCount = count;
      dominantId = id;
    }
  }
  const cs = docInfo.charShapes[dominantId];
  if (!cs) return void 0;
  const style = {};
  if (cs.fontSize > 0) style.fontSize = cs.fontSize / 10;
  if (cs.attrFlags & 1) style.italic = true;
  if (cs.attrFlags & 2) style.bold = true;
  return style.fontSize || style.bold || style.italic ? style : void 0;
}
function parseParagraphWithTables(records, startIdx) {
  const startLevel = records[startIdx].level;
  let text = "";
  const tables = [];
  const charShapeIds = [];
  let i = startIdx + 1;
  while (i < records.length) {
    const rec = records[i];
    if (rec.tagId === TAG_PARA_HEADER && rec.level <= startLevel) break;
    if (rec.tagId === TAG_PARA_TEXT) {
      text = extractText(rec.data);
    }
    if (rec.tagId === TAG_CHAR_SHAPE && rec.data.length >= 8) {
      for (let offset = 0; offset + 7 < rec.data.length; offset += 8) {
        charShapeIds.push(rec.data.readUInt32LE(offset + 4));
      }
    }
    if (rec.tagId === TAG_CTRL_HEADER && rec.data.length >= 4) {
      const ctrlId = rec.data.subarray(0, 4).toString("ascii");
      if (ctrlId === " lbt" || ctrlId === "tbl ") {
        const { table, nextIdx } = parseTableBlock(records, i);
        if (table) tables.push(table);
        i = nextIdx;
        continue;
      }
    }
    i++;
  }
  const trimmed = text.trim();
  return { paragraph: trimmed || null, tables, nextIdx: i, charShapeIds };
}
function parseTableBlock(records, startIdx) {
  const tableLevel = records[startIdx].level;
  let i = startIdx + 1;
  let rows = 0, cols = 0;
  const cells = [];
  while (i < records.length) {
    const rec = records[i];
    if (rec.tagId === TAG_PARA_HEADER && rec.level <= tableLevel) break;
    if (rec.tagId === TAG_CTRL_HEADER && rec.level <= tableLevel) break;
    if (rec.tagId === TAG_TABLE && rec.data.length >= 8) {
      rows = Math.min(rec.data.readUInt16LE(4), MAX_ROWS);
      cols = Math.min(rec.data.readUInt16LE(6), MAX_COLS);
    }
    if (rec.tagId === TAG_LIST_HEADER) {
      const { cell, nextIdx } = parseCellBlock(records, i, tableLevel);
      if (cell) cells.push(cell);
      i = nextIdx;
      continue;
    }
    i++;
  }
  if (rows === 0 || cols === 0 || cells.length === 0) return { table: null, nextIdx: i };
  const cellRows = arrangeCells(rows, cols, cells);
  return { table: buildTable(cellRows), nextIdx: i };
}
function parseCellBlock(records, startIdx, tableLevel) {
  const rec = records[startIdx];
  const cellLevel = rec.level;
  const texts = [];
  let colSpan = 1;
  let rowSpan = 1;
  let colAddr;
  let rowAddr;
  if (rec.data.length >= 16) {
    colAddr = rec.data.readUInt16LE(8);
    rowAddr = rec.data.readUInt16LE(10);
    const cs = rec.data.readUInt16LE(12);
    const rs = rec.data.readUInt16LE(14);
    if (cs > 0) colSpan = Math.min(cs, MAX_COLS);
    if (rs > 0) rowSpan = Math.min(rs, MAX_ROWS);
  }
  let i = startIdx + 1;
  while (i < records.length) {
    const r = records[i];
    if (r.tagId === TAG_LIST_HEADER && r.level <= cellLevel) break;
    if (r.level <= tableLevel && (r.tagId === TAG_PARA_HEADER || r.tagId === TAG_CTRL_HEADER)) break;
    if (r.tagId === TAG_PARA_TEXT) {
      const t = extractText(r.data).trim();
      if (t) texts.push(t);
    }
    i++;
  }
  return { cell: { text: texts.join("\n"), colSpan, rowSpan, colAddr, rowAddr }, nextIdx: i };
}
function arrangeCells(rows, cols, cells) {
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  const hasAddr = cells.some((c) => c.colAddr !== void 0 && c.rowAddr !== void 0);
  if (hasAddr) {
    for (const cell of cells) {
      const r = cell.rowAddr ?? 0;
      const c = cell.colAddr ?? 0;
      if (r >= rows || c >= cols) continue;
      grid[r][c] = cell;
      for (let dr = 0; dr < cell.rowSpan; dr++) {
        for (let dc = 0; dc < cell.colSpan; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (r + dr < rows && c + dc < cols)
            grid[r + dr][c + dc] = { text: "", colSpan: 1, rowSpan: 1 };
        }
      }
    }
  } else {
    let cellIdx = 0;
    for (let r = 0; r < rows && cellIdx < cells.length; r++) {
      for (let c = 0; c < cols && cellIdx < cells.length; c++) {
        if (grid[r][c] !== null) continue;
        const cell = cells[cellIdx++];
        grid[r][c] = cell;
        for (let dr = 0; dr < cell.rowSpan; dr++) {
          for (let dc = 0; dc < cell.colSpan; dc++) {
            if (dr === 0 && dc === 0) continue;
            if (r + dr < rows && c + dc < cols)
              grid[r + dr][c + dc] = { text: "", colSpan: 1, rowSpan: 1 };
          }
        }
      }
    }
  }
  return grid.map((row) => row.map((c) => c || { text: "", colSpan: 1, rowSpan: 1 }));
}

// src/pdf/line-detector.ts
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
var ORIENTATION_TOL = 2;
var MIN_LINE_LENGTH = 10;
var COORD_MERGE_TOL = 3;
var CONNECT_TOL = 5;
var CELL_PADDING = 2;
function extractLines(fnArray, argsArray) {
  const horizontals = [];
  const verticals = [];
  let lineWidth = 1;
  let currentPath = [];
  let pathStartX = 0, pathStartY = 0;
  let curX = 0, curY = 0;
  function flushPath(isStroke) {
    if (!isStroke) {
      currentPath = [];
      return;
    }
    for (const seg of currentPath) {
      classifyAndAdd(seg, lineWidth, horizontals, verticals);
    }
    currentPath = [];
  }
  for (let i = 0; i < fnArray.length; i++) {
    const op = fnArray[i];
    const args = argsArray[i];
    switch (op) {
      case OPS.setLineWidth:
        lineWidth = args[0] || 1;
        break;
      case OPS.constructPath: {
        const subOps = args[0];
        const coords = args[1];
        let ci = 0;
        for (const subOp of subOps) {
          if (subOp === OPS.moveTo) {
            curX = coords[ci++];
            curY = coords[ci++];
            pathStartX = curX;
            pathStartY = curY;
          } else if (subOp === OPS.lineTo) {
            const x2 = coords[ci++], y2 = coords[ci++];
            currentPath.push({ x1: curX, y1: curY, x2, y2 });
            curX = x2;
            curY = y2;
          } else if (subOp === OPS.rectangle) {
            const rx = coords[ci++], ry = coords[ci++];
            const rw = coords[ci++], rh = coords[ci++];
            if (Math.abs(rh) < ORIENTATION_TOL * 2) {
              currentPath.push({ x1: rx, y1: ry + rh / 2, x2: rx + rw, y2: ry + rh / 2 });
            } else if (Math.abs(rw) < ORIENTATION_TOL * 2) {
              currentPath.push({ x1: rx + rw / 2, y1: ry, x2: rx + rw / 2, y2: ry + rh });
            } else {
              currentPath.push(
                { x1: rx, y1: ry, x2: rx + rw, y2: ry },
                // bottom
                { x1: rx + rw, y1: ry, x2: rx + rw, y2: ry + rh },
                // right
                { x1: rx + rw, y1: ry + rh, x2: rx, y2: ry + rh },
                // top
                { x1: rx, y1: ry + rh, x2: rx, y2: ry }
                // left
              );
            }
          } else if (subOp === OPS.closePath) {
            if (curX !== pathStartX || curY !== pathStartY) {
              currentPath.push({ x1: curX, y1: curY, x2: pathStartX, y2: pathStartY });
            }
            curX = pathStartX;
            curY = pathStartY;
          } else if (subOp === OPS.curveTo) {
            ci += 6;
          } else if (subOp === OPS.curveTo2 || subOp === OPS.curveTo3) {
            ci += 4;
          }
        }
        break;
      }
      case OPS.stroke:
      case OPS.closeStroke:
        flushPath(true);
        break;
      case OPS.fill:
      case OPS.eoFill:
      case OPS.fillStroke:
      case OPS.eoFillStroke:
      case OPS.closeFillStroke:
      case OPS.closeEOFillStroke:
        flushPath(true);
        break;
      case OPS.endPath:
        flushPath(false);
        break;
    }
  }
  return { horizontals, verticals };
}
function classifyAndAdd(seg, lineWidth, horizontals, verticals) {
  const dx = Math.abs(seg.x2 - seg.x1);
  const dy = Math.abs(seg.y2 - seg.y1);
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < MIN_LINE_LENGTH) return;
  if (dy <= ORIENTATION_TOL) {
    const y = (seg.y1 + seg.y2) / 2;
    const x1 = Math.min(seg.x1, seg.x2);
    const x2 = Math.max(seg.x1, seg.x2);
    horizontals.push({ x1, y1: y, x2, y2: y, lineWidth });
  } else if (dx <= ORIENTATION_TOL) {
    const x = (seg.x1 + seg.x2) / 2;
    const y1 = Math.min(seg.y1, seg.y2);
    const y2 = Math.max(seg.y1, seg.y2);
    verticals.push({ x1: x, y1, x2: x, y2, lineWidth });
  }
}
function filterPageBorderLines(horizontals, verticals, pageWidth, pageHeight) {
  const margin = 5;
  return {
    horizontals: horizontals.filter(
      (l) => !(Math.abs(l.y1) < margin || Math.abs(l.y1 - pageHeight) < margin) || l.x2 - l.x1 < pageWidth * 0.9
    ),
    verticals: verticals.filter(
      (l) => !(Math.abs(l.x1) < margin || Math.abs(l.x1 - pageWidth) < margin) || l.y2 - l.y1 < pageHeight * 0.9
    )
  };
}
function buildTableGrids(horizontals, verticals) {
  if (horizontals.length < 2 || verticals.length < 2) return [];
  const allLines = [
    ...horizontals.map((l, i) => ({ ...l, type: "h", id: i })),
    ...verticals.map((l, i) => ({ ...l, type: "v", id: i + horizontals.length }))
  ];
  const groups = groupConnectedLines(allLines);
  const grids = [];
  for (const group of groups) {
    const hLines = group.filter((l) => l.type === "h");
    const vLines = group.filter((l) => l.type === "v");
    if (hLines.length < 2 || vLines.length < 2) continue;
    const rawYs = hLines.map((l) => l.y1);
    const rowYs = clusterCoordinates(rawYs).sort((a, b) => b - a);
    const rawXs = vLines.map((l) => l.x1);
    const colXs = clusterCoordinates(rawXs).sort((a, b) => a - b);
    if (rowYs.length < 2 || colXs.length < 2) continue;
    const bbox = {
      x1: colXs[0],
      y1: rowYs[rowYs.length - 1],
      x2: colXs[colXs.length - 1],
      y2: rowYs[0]
    };
    grids.push({ rowYs, colXs, bbox });
  }
  return grids;
}
function clusterCoordinates(values) {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  const clusters = [{ sum: sorted[0], count: 1 }];
  for (let i = 1; i < sorted.length; i++) {
    const last = clusters[clusters.length - 1];
    const avg = last.sum / last.count;
    if (Math.abs(sorted[i] - avg) <= COORD_MERGE_TOL) {
      last.sum += sorted[i];
      last.count++;
    } else {
      clusters.push({ sum: sorted[i], count: 1 });
    }
  }
  return clusters.map((c) => c.sum / c.count);
}
function groupConnectedLines(lines) {
  const parent = lines.map((_, i) => i);
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (linesIntersect(lines[i], lines[j])) {
        union(i, j);
      }
    }
  }
  const groups = /* @__PURE__ */ new Map();
  for (let i = 0; i < lines.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(lines[i]);
  }
  return [...groups.values()];
}
function linesIntersect(a, b) {
  if (a.type === b.type) {
    if (a.type === "h") {
      if (Math.abs(a.y1 - b.y1) > CONNECT_TOL) return false;
      return Math.min(a.x2, b.x2) >= Math.max(a.x1, b.x1) - CONNECT_TOL;
    } else {
      if (Math.abs(a.x1 - b.x1) > CONNECT_TOL) return false;
      return Math.min(a.y2, b.y2) >= Math.max(a.y1, b.y1) - CONNECT_TOL;
    }
  }
  const h = a.type === "h" ? a : b;
  const v = a.type === "h" ? b : a;
  const tol = CONNECT_TOL;
  return v.x1 >= h.x1 - tol && v.x1 <= h.x2 + tol && h.y1 >= v.y1 - tol && h.y1 <= v.y2 + tol;
}
function extractCells(grid, horizontals, verticals) {
  const { rowYs, colXs } = grid;
  const numRows = rowYs.length - 1;
  const numCols = colXs.length - 1;
  if (numRows <= 0 || numCols <= 0) return [];
  const occupied = Array.from({ length: numRows }, () => Array(numCols).fill(false));
  const cells = [];
  for (let r = 0; r < numRows; r++) {
    for (let c = 0; c < numCols; c++) {
      if (occupied[r][c]) continue;
      let colSpan = 1;
      let rowSpan = 1;
      while (c + colSpan < numCols) {
        const borderX = colXs[c + colSpan];
        const topY = rowYs[r];
        const botY = rowYs[r + 1];
        if (hasVerticalLine(verticals, borderX, topY, botY)) break;
        colSpan++;
      }
      while (r + rowSpan < numRows) {
        const borderY = rowYs[r + rowSpan];
        const leftX = colXs[c];
        const rightX = colXs[c + colSpan];
        if (hasHorizontalLine(horizontals, borderY, leftX, rightX)) break;
        rowSpan++;
      }
      for (let dr = 0; dr < rowSpan; dr++) {
        for (let dc = 0; dc < colSpan; dc++) {
          occupied[r + dr][c + dc] = true;
        }
      }
      cells.push({
        row: r,
        col: c,
        rowSpan,
        colSpan,
        bbox: {
          x1: colXs[c],
          y1: rowYs[r + rowSpan],
          x2: colXs[c + colSpan],
          y2: rowYs[r]
        }
      });
    }
  }
  return cells;
}
function hasVerticalLine(verticals, x, topY, botY) {
  const tol = COORD_MERGE_TOL + 1;
  for (const v of verticals) {
    if (Math.abs(v.x1 - x) <= tol) {
      const cellH = Math.abs(topY - botY);
      const overlapTop = Math.min(v.y2, topY);
      const overlapBot = Math.max(v.y1, botY);
      const overlap = overlapTop - overlapBot;
      if (overlap >= cellH * 0.5) return true;
    }
  }
  return false;
}
function hasHorizontalLine(horizontals, y, leftX, rightX) {
  const tol = COORD_MERGE_TOL + 1;
  for (const h of horizontals) {
    if (Math.abs(h.y1 - y) <= tol) {
      const cellW = Math.abs(rightX - leftX);
      const overlapLeft = Math.max(h.x1, leftX);
      const overlapRight = Math.min(h.x2, rightX);
      const overlap = overlapRight - overlapLeft;
      if (overlap >= cellW * 0.5) return true;
    }
  }
  return false;
}
function mapTextToCells(items, cells) {
  const result = /* @__PURE__ */ new Map();
  for (const cell of cells) {
    result.set(cell, []);
  }
  for (const item of items) {
    const cx = item.x + item.w / 2;
    const cy = item.y;
    const pad = CELL_PADDING;
    let bestCell = null;
    let bestDist = Infinity;
    for (const cell of cells) {
      if (cx >= cell.bbox.x1 - pad && cx <= cell.bbox.x2 + pad && cy >= cell.bbox.y1 - pad && cy <= cell.bbox.y2 + pad) {
        const cellCx = (cell.bbox.x1 + cell.bbox.x2) / 2;
        const cellCy = (cell.bbox.y1 + cell.bbox.y2) / 2;
        const dist = Math.abs(cx - cellCx) + Math.abs(cy - cellCy);
        if (dist < bestDist) {
          bestDist = dist;
          bestCell = cell;
        }
      }
    }
    if (bestCell) {
      result.get(bestCell).push(item);
    }
  }
  return result;
}
function cellTextToString(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0].text;
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  let curLine = [sorted[0]];
  let curY = sorted[0].y;
  for (let i = 1; i < sorted.length; i++) {
    const tol = Math.max(3, Math.min(sorted[i].fontSize, curLine[0].fontSize) * 0.6);
    if (Math.abs(sorted[i].y - curY) <= tol) {
      curLine.push(sorted[i]);
    } else {
      lines.push(curLine);
      curLine = [sorted[i]];
      curY = sorted[i].y;
    }
  }
  lines.push(curLine);
  const textLines = lines.map((line) => {
    const s = line.sort((a, b) => a.x - b.x);
    if (s.length === 1) return s[0].text;
    let result = s[0].text;
    for (let j = 1; j < s.length; j++) {
      const gap = s[j].x - (s[j - 1].x + s[j - 1].w);
      const avgFs = (s[j].fontSize + s[j - 1].fontSize) / 2;
      if (gap < avgFs * 0.3 && /[가-힣]$/.test(result) && /^[가-힣]/.test(s[j].text)) {
        result += s[j].text;
      } else {
        result += " " + s[j].text;
      }
    }
    return result;
  });
  if (textLines.length <= 1) return textLines[0] || "";
  const merged = [textLines[0]];
  for (let i = 1; i < textLines.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = textLines[i];
    if (/[가-힣]$/.test(prev) && /^[가-힣]+$/.test(curr) && curr.length <= 8 && !curr.includes(" ")) {
      merged[merged.length - 1] = prev + curr;
    } else {
      merged.push(curr);
    }
  }
  return merged.join("\n");
}

// src/pdf/cluster-detector.ts
var Y_TOL = 3;
var COL_CLUSTER_TOL = 15;
var MIN_ROWS = 3;
var MIN_COLS = 2;
var MIN_GAP_FACTOR = 1.5;
var MIN_COL_FILL_RATIO = 0.3;
function detectClusterTables(items, pageNum) {
  if (items.length < MIN_ROWS * MIN_COLS) return [];
  const rows = groupByBaseline(items);
  if (rows.length < MIN_ROWS) return [];
  const suspiciousRows = rows.filter((row) => hasSuspiciousGaps(row));
  if (suspiciousRows.length < MIN_ROWS) return [];
  const columns = extractColumnClusters(suspiciousRows);
  if (columns.length < MIN_COLS) return [];
  const tableRegions = findTableRegions(rows, columns);
  const results = [];
  for (const region of tableRegions) {
    const table = buildClusterTable(region.rows, columns, pageNum);
    if (table) results.push(table);
  }
  return results;
}
function groupByBaseline(items) {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  let curItems = [sorted[0]];
  let curY = sorted[0].y;
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - curY) <= Y_TOL) {
      curItems.push(sorted[i]);
    } else {
      rows.push({ y: curY, items: curItems });
      curItems = [sorted[i]];
      curY = sorted[i].y;
    }
  }
  if (curItems.length > 0) rows.push({ y: curY, items: curItems });
  return rows;
}
function hasSuspiciousGaps(row) {
  if (row.items.length < 2) return false;
  const sorted = [...row.items].sort((a, b) => a.x - b.x);
  const avgFontSize = sorted.reduce((s, i) => s + i.fontSize, 0) / sorted.length;
  const minGap = avgFontSize * MIN_GAP_FACTOR;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].w);
    if (gap >= minGap) return true;
  }
  return false;
}
function extractColumnClusters(rows) {
  const allX = [];
  for (const row of rows) {
    for (const item of row.items) allX.push(item.x);
  }
  if (allX.length === 0) return [];
  allX.sort((a, b) => a - b);
  const clusters = [];
  let clusterStart = 0;
  for (let i = 1; i <= allX.length; i++) {
    if (i === allX.length || allX[i] - allX[i - 1] > COL_CLUSTER_TOL) {
      const slice = allX.slice(clusterStart, i);
      const avg = Math.round(slice.reduce((s, v) => s + v, 0) / slice.length);
      clusters.push({ x: avg, count: slice.length });
      clusterStart = i;
    }
  }
  const minCount = Math.max(2, Math.floor(rows.length * MIN_COL_FILL_RATIO));
  return clusters.filter((c) => c.count >= minCount).sort((a, b) => a.x - b.x);
}
function findTableRegions(allRows, columns) {
  const regions = [];
  let currentRegion = [];
  for (const row of allRows) {
    const matchedCols = countMatchedColumns(row, columns);
    if (matchedCols >= MIN_COLS) {
      currentRegion.push(row);
    } else if (row.items.length === 1) {
      if (currentRegion.length > 0) {
        currentRegion.push(row);
      }
    } else {
      if (currentRegion.length >= MIN_ROWS) {
        regions.push({ rows: [...currentRegion] });
      }
      currentRegion = [];
    }
  }
  if (currentRegion.length >= MIN_ROWS) {
    regions.push({ rows: currentRegion });
  }
  return regions;
}
function countMatchedColumns(row, columns) {
  const matched = /* @__PURE__ */ new Set();
  for (const item of row.items) {
    for (let ci = 0; ci < columns.length; ci++) {
      if (Math.abs(item.x - columns[ci].x) <= COL_CLUSTER_TOL * 2) {
        matched.add(ci);
        break;
      }
    }
  }
  return matched.size;
}
function assignToColumn(item, columns) {
  const MAX_DIST = COL_CLUSTER_TOL * 3;
  let bestCol = -1;
  let bestDist = Infinity;
  for (let ci = 0; ci < columns.length; ci++) {
    const dist = Math.abs(item.x - columns[ci].x);
    if (dist < bestDist) {
      bestDist = dist;
      bestCol = ci;
    }
  }
  return bestDist <= MAX_DIST ? bestCol : -1;
}
function buildClusterTable(rows, columns, pageNum) {
  const numCols = columns.length;
  const numRows = rows.length;
  if (numRows < MIN_ROWS || numCols < MIN_COLS) return null;
  const cells = Array.from(
    { length: numRows },
    () => Array.from({ length: numCols }, () => ({ text: "", colSpan: 1, rowSpan: 1 }))
  );
  const usedItems = /* @__PURE__ */ new Set();
  for (let r = 0; r < numRows; r++) {
    const row = rows[r];
    if (row.items.length === 1 && numCols > 1) {
      cells[r][0] = { text: row.items[0].text, colSpan: numCols, rowSpan: 1 };
      usedItems.add(row.items[0]);
      continue;
    }
    for (const item of row.items) {
      const col = assignToColumn(item, columns);
      if (col < 0) continue;
      const existing = cells[r][col].text;
      cells[r][col].text = existing ? existing + " " + item.text : item.text;
      usedItems.add(item);
    }
  }
  let emptyRows = 0;
  for (const row of cells) {
    if (row.every((c) => c.text === "")) emptyRows++;
  }
  if (emptyRows > numRows * 0.5) return null;
  for (let c = 0; c < numCols; c++) {
    const hasValue = cells.some((row) => row[c].text !== "");
    if (!hasValue) return null;
  }
  const irTable = {
    rows: numRows,
    cols: numCols,
    cells,
    hasHeader: numRows > 1
  };
  const allItems = rows.flatMap((r) => r.items);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const i of allItems) {
    if (i.x < minX) minX = i.x;
    if (i.y < minY) minY = i.y;
    if (i.x + i.w > maxX) maxX = i.x + i.w;
    const h = i.h > 0 ? i.h : i.fontSize;
    if (i.y + h > maxY) maxY = i.y + h;
  }
  return {
    table: irTable,
    bbox: { page: pageNum, x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    usedItems
  };
}

// src/pdf/polyfill.ts
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
var g = globalThis;
if (typeof g.DOMMatrix === "undefined") {
  g.DOMMatrix = class DOMMatrix {
    m = [1, 0, 0, 1, 0, 0];
    constructor(init) {
      if (init) this.m = init;
    }
  };
}
if (typeof g.Path2D === "undefined") {
  g.Path2D = class Path2D {
  };
}
g.pdfjsWorker = pdfjsWorker;

// src/pdf/parser.ts
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
GlobalWorkerOptions.workerSrc = "";
var MAX_PAGES = 5e3;
var MAX_TOTAL_TEXT = 100 * 1024 * 1024;
async function parsePdfDocument(buffer, options) {
  const doc = await getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false
  }).promise;
  try {
    const pageCount = doc.numPages;
    if (pageCount === 0) return { success: false, fileType: "pdf", pageCount: 0, error: "PDF\uC5D0 \uD398\uC774\uC9C0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.", code: "PARSE_ERROR" };
    const metadata = { pageCount };
    await extractPdfMetadata(doc, metadata);
    const blocks = [];
    const warnings = [];
    let totalChars = 0;
    let totalTextBytes = 0;
    const effectivePageCount = Math.min(pageCount, MAX_PAGES);
    const pageFilter = options?.pages ? parsePageRange(options.pages, effectivePageCount) : null;
    const allFontSizes = [];
    for (let i = 1; i <= effectivePageCount; i++) {
      if (pageFilter && !pageFilter.has(i)) continue;
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const rawItems = tc.items;
      const items = normalizeItems(rawItems);
      const { visible, hiddenCount } = filterHiddenText(items, viewport.width, viewport.height);
      if (hiddenCount > 0) {
        warnings.push({ page: i, message: `${hiddenCount}\uAC1C \uC228\uACA8\uC9C4 \uD14D\uC2A4\uD2B8 \uC694\uC18C \uD544\uD130\uB9C1\uB428`, code: "HIDDEN_TEXT_FILTERED" });
      }
      for (const item of visible) {
        if (item.fontSize > 0) allFontSizes.push(item.fontSize);
      }
      const opList = await page.getOperatorList();
      const pageBlocks = extractPageBlocksWithLines(visible, i, opList, viewport.width, viewport.height);
      for (const b of pageBlocks) blocks.push(b);
      for (const b of pageBlocks) {
        const t = b.text || "";
        totalChars += t.replace(/\s/g, "").length;
        totalTextBytes += t.length * 2;
      }
      if (totalTextBytes > MAX_TOTAL_TEXT) throw new KordocError("\uD14D\uC2A4\uD2B8 \uCD94\uCD9C \uD06C\uAE30 \uCD08\uACFC");
    }
    const parsedPageCount = pageFilter ? pageFilter.size : effectivePageCount;
    if (totalChars / Math.max(parsedPageCount, 1) < 10) {
      if (options?.ocr) {
        try {
          const { ocrPages } = await import("./provider-A4FHJSID.js");
          const ocrBlocks = await ocrPages(doc, options.ocr, pageFilter, effectivePageCount);
          if (ocrBlocks.length > 0) {
            const ocrMarkdown = ocrBlocks.map((b) => b.text || "").filter(Boolean).join("\n\n");
            return { success: true, fileType: "pdf", markdown: ocrMarkdown, pageCount: parsedPageCount, blocks: ocrBlocks, metadata, isImageBased: true, warnings };
          }
        } catch {
        }
      }
      return { success: false, fileType: "pdf", pageCount, isImageBased: true, error: `\uC774\uBBF8\uC9C0 \uAE30\uBC18 PDF (${pageCount}\uD398\uC774\uC9C0, ${totalChars}\uC790)`, code: "IMAGE_BASED_PDF" };
    }
    const medianFontSize = computeMedianFontSize(allFontSizes);
    if (medianFontSize > 0) {
      detectHeadings(blocks, medianFontSize);
    }
    const outline = blocks.filter((b) => b.type === "heading" && b.level && b.text).map((b) => ({ level: b.level, text: b.text, pageNumber: b.pageNumber }));
    let markdown = cleanPdfText(blocksToMarkdown(blocks));
    return { success: true, fileType: "pdf", markdown, pageCount: parsedPageCount, blocks, metadata, outline: outline.length > 0 ? outline : void 0, warnings: warnings.length > 0 ? warnings : void 0 };
  } finally {
    await doc.destroy().catch(() => {
    });
  }
}
async function extractPdfMetadata(doc, metadata) {
  try {
    const result = await doc.getMetadata();
    if (!result?.info) return;
    const info = result.info;
    if (typeof info.Title === "string" && info.Title.trim()) metadata.title = info.Title.trim();
    if (typeof info.Author === "string" && info.Author.trim()) metadata.author = info.Author.trim();
    if (typeof info.Creator === "string" && info.Creator.trim()) metadata.creator = info.Creator.trim();
    if (typeof info.Subject === "string" && info.Subject.trim()) metadata.description = info.Subject.trim();
    if (typeof info.Keywords === "string" && info.Keywords.trim()) {
      metadata.keywords = info.Keywords.split(/[,;]/).map((k) => k.trim()).filter(Boolean);
    }
    if (typeof info.CreationDate === "string") metadata.createdAt = parsePdfDate(info.CreationDate);
    if (typeof info.ModDate === "string") metadata.modifiedAt = parsePdfDate(info.ModDate);
  } catch {
  }
}
function parsePdfDate(dateStr) {
  const m = dateStr.match(/D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/);
  if (!m) return void 0;
  const [, year, month = "01", day = "01", hour = "00", min = "00", sec = "00"] = m;
  return `${year}-${month}-${day}T${hour}:${min}:${sec}`;
}
async function extractPdfMetadataOnly(buffer) {
  const doc = await getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    isEvalSupported: false
  }).promise;
  try {
    const metadata = { pageCount: doc.numPages };
    await extractPdfMetadata(doc, metadata);
    return metadata;
  } finally {
    await doc.destroy().catch(() => {
    });
  }
}
function filterHiddenText(items, pageWidth, pageHeight) {
  let hiddenCount = 0;
  const visible = [];
  for (const item of items) {
    if (item.isHidden) {
      hiddenCount++;
      continue;
    }
    const margin = Math.max(pageWidth, pageHeight) * 0.1;
    if (item.x < -margin || item.x > pageWidth + margin || item.y < -margin || item.y > pageHeight + margin) {
      hiddenCount++;
      continue;
    }
    visible.push(item);
  }
  return { visible, hiddenCount };
}
function computeMedianFontSize(sizes) {
  if (sizes.length === 0) return 0;
  const sorted = [...sizes].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
function detectHeadings(blocks, medianFontSize) {
  for (const block of blocks) {
    if (block.type !== "paragraph" || !block.text || !block.style?.fontSize) continue;
    const text = block.text.trim();
    if (text.length === 0 || text.length > 200) continue;
    if (/^\d+$/.test(text)) continue;
    const ratio = block.style.fontSize / medianFontSize;
    let level = 0;
    if (ratio >= 1.5) level = 1;
    else if (ratio >= 1.3) level = 2;
    else if (ratio >= 1.15) level = 3;
    if (level > 0) {
      block.type = "heading";
      block.level = level;
    }
  }
}
var MAX_XYCUT_DEPTH = 50;
function xyCutOrder(items, gapThreshold, depth = 0) {
  if (items.length === 0) return [];
  if (items.length <= 2 || depth >= MAX_XYCUT_DEPTH) return [items];
  const region = computeRegion(items);
  const ySplit = findYSplit(items, region, gapThreshold);
  if (ySplit !== null) {
    const upper = items.filter((i) => i.y > ySplit);
    const lower = items.filter((i) => i.y <= ySplit);
    if (upper.length > 0 && lower.length > 0 && upper.length < items.length) {
      return [...xyCutOrder(upper, gapThreshold, depth + 1), ...xyCutOrder(lower, gapThreshold, depth + 1)];
    }
  }
  const xSplit = findXSplit(items, region, gapThreshold);
  if (xSplit !== null) {
    const left = items.filter((i) => i.x + i.w / 2 < xSplit);
    const right = items.filter((i) => i.x + i.w / 2 >= xSplit);
    if (left.length > 0 && right.length > 0 && left.length < items.length) {
      return [...xyCutOrder(left, gapThreshold, depth + 1), ...xyCutOrder(right, gapThreshold, depth + 1)];
    }
  }
  return [items];
}
function computeRegion(items) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const i of items) {
    if (i.x < minX) minX = i.x;
    if (i.y < minY) minY = i.y;
    if (i.x + i.w > maxX) maxX = i.x + i.w;
    if (i.y + i.h > maxY) maxY = i.y + i.h;
  }
  return { items, minX, minY, maxX, maxY };
}
function findYSplit(items, region, gapThreshold) {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  let bestGap = gapThreshold;
  let bestSplit = null;
  for (let i = 1; i < sorted.length; i++) {
    const prevBottom = sorted[i - 1].y - sorted[i - 1].h;
    const currTop = sorted[i].y;
    const gap = prevBottom - currTop;
    if (gap > bestGap) {
      bestGap = gap;
      bestSplit = (prevBottom + currTop) / 2;
    }
  }
  return bestSplit;
}
function findXSplit(items, region, gapThreshold) {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let bestGap = gapThreshold;
  let bestSplit = null;
  for (let i = 1; i < sorted.length; i++) {
    const prevRight = sorted[i - 1].x + sorted[i - 1].w;
    const currLeft = sorted[i].x;
    const gap = currLeft - prevRight;
    if (gap > bestGap) {
      bestGap = gap;
      bestSplit = (prevRight + currLeft) / 2;
    }
  }
  return bestSplit;
}
function extractPageBlocksWithLines(items, pageNum, opList, pageWidth, pageHeight) {
  if (items.length === 0) return [];
  let { horizontals, verticals } = extractLines(opList.fnArray, opList.argsArray);
  ({ horizontals, verticals } = filterPageBorderLines(horizontals, verticals, pageWidth, pageHeight));
  const grids = buildTableGrids(horizontals, verticals);
  if (grids.length > 0) {
    return extractBlocksWithGrids(items, pageNum, grids, horizontals, verticals);
  }
  return extractPageBlocksFallback(items, pageNum);
}
function extractBlocksWithGrids(items, pageNum, grids, horizontals, verticals) {
  const blocks = [];
  const usedItems = /* @__PURE__ */ new Set();
  const sortedGrids = [...grids].sort((a, b) => b.bbox.y2 - a.bbox.y2);
  for (const grid of sortedGrids) {
    const tableItems = [];
    const pad = 3;
    for (const item of items) {
      if (usedItems.has(item)) continue;
      if (item.x >= grid.bbox.x1 - pad && item.x + item.w <= grid.bbox.x2 + pad && item.y >= grid.bbox.y1 - pad && item.y <= grid.bbox.y2 + pad) {
        tableItems.push(item);
        usedItems.add(item);
      }
    }
    const cells = extractCells(grid, horizontals, verticals);
    if (cells.length === 0) continue;
    const textItems = tableItems.map((i) => ({
      text: i.text,
      x: i.x,
      y: i.y,
      w: i.w,
      h: i.h,
      fontSize: i.fontSize,
      fontName: i.fontName
    }));
    const cellTextMap = mapTextToCells(textItems, cells);
    const numRows = grid.rowYs.length - 1;
    const numCols = grid.colXs.length - 1;
    const irGrid = Array.from(
      { length: numRows },
      () => Array.from({ length: numCols }, () => ({ text: "", colSpan: 1, rowSpan: 1 }))
    );
    for (const cell of cells) {
      const textItems2 = cellTextMap.get(cell) || [];
      const text = cellTextToString(textItems2);
      irGrid[cell.row][cell.col] = {
        text,
        colSpan: cell.colSpan,
        rowSpan: cell.rowSpan
      };
    }
    const irTable = {
      rows: numRows,
      cols: numCols,
      cells: irGrid,
      hasHeader: numRows > 1
    };
    const hasContent = irGrid.some((row) => row.some((cell) => cell.text.trim() !== ""));
    if (!hasContent) continue;
    blocks.push({
      type: "table",
      table: irTable,
      pageNumber: pageNum,
      bbox: {
        page: pageNum,
        x: grid.bbox.x1,
        y: grid.bbox.y1,
        width: grid.bbox.x2 - grid.bbox.x1,
        height: grid.bbox.y2 - grid.bbox.y1
      }
    });
  }
  const remaining = items.filter((i) => !usedItems.has(i));
  if (remaining.length > 0) {
    remaining.sort((a, b) => b.y - a.y || a.x - b.x);
    const textBlocks = detectListBlocks(extractPageBlocksFallback(remaining, pageNum));
    const allBlocks = [...blocks, ...textBlocks];
    allBlocks.sort((a, b) => {
      const ay = a.bbox ? a.bbox.y + a.bbox.height : 0;
      const by = b.bbox ? b.bbox.y + b.bbox.height : 0;
      return by - ay;
    });
    return allBlocks;
  }
  return blocks;
}
function extractPageBlocksFallback(items, pageNum) {
  if (items.length === 0) return [];
  const blocks = [];
  const allYLines = groupByY(items);
  const columns = detectColumns(allYLines);
  if (columns && columns.length >= 3) {
    const tableText = extractWithColumns(allYLines, columns);
    const bbox = computeBBox(items, pageNum);
    blocks.push({ type: "paragraph", text: tableText, pageNumber: pageNum, bbox, style: dominantStyle(items) });
  } else {
    const clusterItems = items.map((i) => ({
      text: i.text,
      x: i.x,
      y: i.y,
      w: i.w,
      h: i.h,
      fontSize: i.fontSize,
      fontName: i.fontName
    }));
    const clusterResults = detectClusterTables(clusterItems, pageNum);
    if (clusterResults.length > 0) {
      const usedIndices = /* @__PURE__ */ new Set();
      for (const cr of clusterResults) {
        for (const ci of cr.usedItems) {
          const idx = clusterItems.indexOf(ci);
          if (idx >= 0) usedIndices.add(idx);
        }
        blocks.push({ type: "table", table: cr.table, pageNumber: pageNum, bbox: cr.bbox });
      }
      const remaining = items.filter((_, idx) => !usedIndices.has(idx));
      if (remaining.length > 0) {
        const yLines = groupByY(remaining);
        for (const line of yLines) {
          const text = mergeLineSimple(line);
          if (!text.trim()) continue;
          const bbox = computeBBox(line, pageNum);
          blocks.push({ type: "paragraph", text, pageNumber: pageNum, bbox, style: dominantStyle(line) });
        }
      }
      blocks.sort((a, b) => {
        const ay = a.bbox ? a.bbox.y + a.bbox.height : 0;
        const by = b.bbox ? b.bbox.y + b.bbox.height : 0;
        return by - ay;
      });
    } else {
      const allY = items.map((i) => i.y);
      const pageHeight = Math.max(...allY) - Math.min(...allY);
      const gapThreshold = Math.max(15, pageHeight * 0.03);
      const orderedGroups = xyCutOrder(items, gapThreshold);
      for (const group of orderedGroups) {
        if (group.length === 0) continue;
        const yLines = groupByY(group);
        const groupColumns = detectColumns(yLines);
        if (groupColumns && groupColumns.length >= 3) {
          const tableText = extractWithColumns(yLines, groupColumns);
          const bbox = computeBBox(group, pageNum);
          blocks.push({ type: "paragraph", text: tableText, pageNumber: pageNum, bbox, style: dominantStyle(group) });
        } else {
          for (const line of yLines) {
            const text = mergeLineSimple(line);
            if (!text.trim()) continue;
            const bbox = computeBBox(line, pageNum);
            blocks.push({ type: "paragraph", text, pageNumber: pageNum, bbox, style: dominantStyle(line) });
          }
        }
      }
    }
  }
  return detectSpecialKoreanTables(blocks);
}
function computeBBox(items, pageNum) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const i of items) {
    if (i.x < minX) minX = i.x;
    if (i.y < minY) minY = i.y;
    if (i.x + i.w > maxX) maxX = i.x + i.w;
    const effectiveH = i.h > 0 ? i.h : i.fontSize;
    if (i.y + effectiveH > maxY) maxY = i.y + effectiveH;
  }
  return { page: pageNum, x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
function dominantStyle(items) {
  if (items.length === 0) return void 0;
  const freq = /* @__PURE__ */ new Map();
  let maxCount = 0, dominantSize = 0;
  for (const i of items) {
    if (i.fontSize <= 0) continue;
    const count = (freq.get(i.fontSize) || 0) + 1;
    freq.set(i.fontSize, count);
    if (count > maxCount) {
      maxCount = count;
      dominantSize = i.fontSize;
    }
  }
  if (dominantSize === 0) return void 0;
  const fontName = items.find((i) => i.fontSize === dominantSize)?.fontName || void 0;
  return { fontSize: dominantSize, fontName };
}
function normalizeItems(rawItems) {
  return rawItems.filter((i) => typeof i.str === "string" && i.str.trim() !== "").map((i) => {
    const scaleY = Math.abs(i.transform[3]);
    const scaleX = Math.abs(i.transform[0]);
    const fontSize = Math.round(Math.max(scaleY, scaleX));
    return {
      text: i.str.trim(),
      x: Math.round(i.transform[4]),
      y: Math.round(i.transform[5]),
      w: Math.round(i.width),
      h: Math.round(i.height),
      fontSize,
      fontName: i.fontName || "",
      // 0pt 폰트이거나 너비 0 → hidden text (prompt injection 의심)
      isHidden: fontSize === 0 || i.width === 0 && i.str.trim().length > 0
    };
  }).sort((a, b) => b.y - a.y || a.x - b.x);
}
function groupByY(items) {
  if (items.length === 0) return [];
  const lines = [];
  let curY = items[0].y;
  let curLine = [items[0]];
  for (let i = 1; i < items.length; i++) {
    if (Math.abs(items[i].y - curY) > 3) {
      lines.push(curLine);
      curLine = [];
      curY = items[i].y;
    }
    curLine.push(items[i]);
  }
  if (curLine.length > 0) lines.push(curLine);
  return lines;
}
function isProseSpread(items) {
  if (items.length < 4) return false;
  const sorted = [...items].sort((a, b) => a.x - b.x);
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i].x - (sorted[i - 1].x + sorted[i - 1].w));
  }
  const maxGap = Math.max(...gaps);
  const avgLen = items.reduce((s, i) => s + i.text.length, 0) / items.length;
  return maxGap < 40 && avgLen < 5;
}
function detectColumns(yLines) {
  const allItems = yLines.flat();
  if (allItems.length === 0) return null;
  const pageWidth = Math.max(...allItems.map((i) => i.x + i.w)) - Math.min(...allItems.map((i) => i.x));
  if (pageWidth < 100) return null;
  let bigoLineIdx = -1;
  for (let i = 0; i < yLines.length; i++) {
    if (yLines[i].length <= 2 && yLines[i].some((item) => item.text === "\uBE44\uACE0")) {
      bigoLineIdx = i;
      break;
    }
  }
  const tableYLines = bigoLineIdx >= 0 ? yLines.slice(0, bigoLineIdx) : yLines;
  const CLUSTER_TOL = 22;
  const xClusters = [];
  for (const line of tableYLines) {
    if (isProseSpread(line)) continue;
    for (const item of line) {
      let found = false;
      for (const c of xClusters) {
        if (Math.abs(item.x - c.center) <= CLUSTER_TOL) {
          c.center = Math.round((c.center * c.count + item.x) / (c.count + 1));
          c.minX = Math.min(c.minX, item.x);
          c.count++;
          found = true;
          break;
        }
      }
      if (!found) {
        xClusters.push({ center: item.x, count: 1, minX: item.x });
      }
    }
  }
  const peaks = xClusters.filter((c) => c.count >= 3).sort((a, b) => a.minX - b.minX);
  if (peaks.length < 3) return null;
  const MERGE_TOL = 30;
  const merged = [peaks[0]];
  for (let i = 1; i < peaks.length; i++) {
    const prev = merged[merged.length - 1];
    if (peaks[i].minX - prev.minX < MERGE_TOL) {
      if (peaks[i].count > prev.count) {
        prev.center = peaks[i].center;
      }
      prev.count += peaks[i].count;
      prev.minX = Math.min(prev.minX, peaks[i].minX);
    } else {
      merged.push({ ...peaks[i] });
    }
  }
  const columns = merged.filter((c) => c.count >= 3).map((c) => c.minX);
  return columns.length >= 3 ? columns : null;
}
function findColumn(x, columns) {
  for (let i = columns.length - 1; i >= 0; i--) {
    if (x >= columns[i] - 10) return i;
  }
  return 0;
}
function extractWithColumns(yLines, columns) {
  const result = [];
  const colMin = columns[0];
  const colMax = columns[columns.length - 1];
  let bigoIdx = -1;
  for (let i = 0; i < yLines.length; i++) {
    if (yLines[i].length <= 2 && yLines[i].some((item) => item.text === "\uBE44\uACE0")) {
      bigoIdx = i;
      break;
    }
  }
  let tableStart = -1;
  for (let i = 0; i < (bigoIdx >= 0 ? bigoIdx : yLines.length); i++) {
    const usedCols = new Set(yLines[i].map((item) => findColumn(item.x, columns)));
    if (usedCols.size >= 3) {
      tableStart = i;
      break;
    }
  }
  const tableEnd = bigoIdx >= 0 ? bigoIdx : yLines.length;
  for (let i = 0; i < (tableStart >= 0 ? tableStart : tableEnd); i++) {
    result.push(mergeLineSimple(yLines[i]));
  }
  if (tableStart >= 0) {
    const tableLines = yLines.slice(tableStart, tableEnd);
    const gridLines = [];
    for (const line of tableLines) {
      const inRange = line.some(
        (item) => item.x >= colMin - 20 && item.x <= colMax + 200
      );
      if (inRange && !isProseSpread(line)) {
        gridLines.push(line);
      } else {
        if (gridLines.length > 0) {
          result.push(buildGridTable(gridLines.splice(0), columns));
        }
        result.push(mergeLineSimple(line));
      }
    }
    if (gridLines.length > 0) {
      result.push(buildGridTable(gridLines, columns));
    }
  }
  if (bigoIdx >= 0) {
    result.push("");
    for (let i = bigoIdx; i < yLines.length; i++) {
      result.push(mergeLineSimple(yLines[i]));
    }
  }
  return result.join("\n");
}
function buildGridTable(lines, columns) {
  const numCols = columns.length;
  const yRows = lines.map((items) => {
    const row = Array(numCols).fill("");
    for (const item of items) {
      const col = findColumn(item.x, columns);
      row[col] = row[col] ? row[col] + " " + item.text : item.text;
    }
    return row;
  });
  const dataColStart = Math.max(2, Math.floor(numCols / 2));
  const merged = [];
  for (const row of yRows) {
    if (row.every((c) => c === "")) continue;
    if (merged.length === 0) {
      merged.push([...row]);
      continue;
    }
    const prev = merged[merged.length - 1];
    const filledCols = row.map((c, i) => c ? i : -1).filter((i) => i >= 0);
    const filledCount = filledCols.length;
    let isNewRow = false;
    if (row[0] && row[0].length >= 3) {
      isNewRow = true;
    }
    if (!isNewRow && numCols > 1 && row[1]) {
      isNewRow = true;
    }
    if (!isNewRow) {
      const hasData = row.slice(dataColStart).some((c) => c !== "");
      const prevHasData = prev.slice(dataColStart).some((c) => c !== "");
      if (hasData && prevHasData) {
        isNewRow = true;
      }
    }
    if (isNewRow && filledCount === 1 && row[0] && row[0].length <= 2) {
      isNewRow = false;
    }
    if (isNewRow) {
      merged.push([...row]);
    } else {
      for (let c = 0; c < numCols; c++) {
        if (row[c]) {
          prev[c] = prev[c] ? prev[c] + " " + row[c] : row[c];
        }
      }
    }
  }
  if (merged.length < 2) {
    return merged.map((r) => r.filter((c) => c).join(" ")).join("\n");
  }
  let headerEnd = 0;
  for (let r = 0; r < merged.length; r++) {
    const hasDataValues = merged[r].slice(dataColStart).some((c) => c && /\d/.test(c));
    if (hasDataValues) break;
    headerEnd = r + 1;
  }
  if (headerEnd > 1) {
    const headerRow = Array(numCols).fill("");
    for (let r = 0; r < headerEnd; r++) {
      for (let c = 0; c < numCols; c++) {
        if (merged[r][c]) {
          headerRow[c] = headerRow[c] ? headerRow[c] + " " + merged[r][c] : merged[r][c];
        }
      }
    }
    merged.splice(0, headerEnd, headerRow);
  }
  const md = [];
  md.push("| " + merged[0].join(" | ") + " |");
  md.push("| " + merged[0].map(() => "---").join(" | ") + " |");
  for (let r = 1; r < merged.length; r++) {
    md.push("| " + merged[r].join(" | ") + " |");
  }
  return md.join("\n");
}
function mergeLineSimple(items) {
  if (items.length <= 1) return items[0]?.text || "";
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let result = sorted[0].text;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].w);
    const avgFs = (sorted[i].fontSize + sorted[i - 1].fontSize) / 2;
    if (gap > 15) result += "	";
    else if (gap < avgFs * 0.3 && /[가-힣]$/.test(result) && /^[가-힣]/.test(sorted[i].text)) {
    } else if (gap > 3) result += " ";
    result += sorted[i].text;
  }
  return result;
}
function cleanPdfText(text) {
  return mergeKoreanLines(
    text.replace(/^[\s]*[-–—]\s*\d+\s*[-–—][\s]*$/gm, "").replace(/^\s*\d+\s*\/\s*\d+\s*$/gm, "")
  ).replace(/\n{3,}/g, "\n\n").trim();
}
function startsWithMarker(line) {
  const t = line.trimStart();
  return /^[가-힣ㄱ-ㅎ][.)]/.test(t) || /^\d+[.)]/.test(t) || /^\([가-힣ㄱ-ㅎ\d]+\)/.test(t) || /^[○●※▶▷◆◇■□★☆\-·]\s/.test(t) || /^제\d+[조항호장절]/.test(t);
}
function isStandaloneHeader(line) {
  return /^제\d+[조항호장절](\([^)]*\))?(\s+\S+){0,7}$/.test(line.trim());
}
function detectListBlocks(blocks) {
  const result = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type === "paragraph" && block.text) {
      const match = block.text.match(/^(\d+)\.\s/);
      if (match) {
        result.push({
          ...block,
          type: "list",
          listType: "ordered",
          // 원래 번호를 text에 보존 (blocksToMarkdown에서 그대로 출력)
          text: block.text
        });
        continue;
      }
    }
    result.push(block);
  }
  return result;
}
var KOREAN_TABLE_HEADER_RE = /^\(?(구분|항목|종류|분류|유형|대상|내용|기간|금액|비율|방법|절차|요건|조건|근거|목적|범위|기준)\)?[:\s]/;
function detectSpecialKoreanTables(blocks) {
  const result = [];
  let kvLines = [];
  const flushKvTable = () => {
    if (kvLines.length < 2) {
      for (const kv of kvLines) result.push(kv.block);
      kvLines = [];
      return;
    }
    const cells = kvLines.map((kv) => {
      if (kv.value) {
        return [
          { text: kv.key, colSpan: 1, rowSpan: 1 },
          { text: kv.value, colSpan: 1, rowSpan: 1 }
        ];
      }
      return [
        { text: kv.key, colSpan: 2, rowSpan: 1 },
        { text: "", colSpan: 1, rowSpan: 1 }
      ];
    });
    const irTable = {
      rows: cells.length,
      cols: 2,
      cells,
      hasHeader: true
    };
    const firstBlock = kvLines[0].block;
    result.push({
      type: "table",
      table: irTable,
      pageNumber: firstBlock.pageNumber,
      bbox: firstBlock.bbox
    });
    kvLines = [];
  };
  for (const block of blocks) {
    if (block.type !== "paragraph" || !block.text) {
      flushKvTable();
      result.push(block);
      continue;
    }
    const text = block.text.trim();
    if (KOREAN_TABLE_HEADER_RE.test(text)) {
      const colonIdx = text.indexOf(":");
      if (colonIdx >= 0) {
        kvLines.push({
          key: text.slice(0, colonIdx).trim(),
          value: text.slice(colonIdx + 1).trim(),
          block
        });
      } else {
        const spaceIdx = text.search(/\s/);
        if (spaceIdx > 0) {
          kvLines.push({
            key: text.slice(0, spaceIdx).trim(),
            value: text.slice(spaceIdx + 1).trim(),
            block
          });
        } else {
          kvLines.push({ key: text, value: "", block });
        }
      }
      continue;
    }
    if (kvLines.length > 0 && text.includes(":") && !text.includes("(") && !text.includes(")")) {
      const colonIdx = text.indexOf(":");
      const key = text.slice(0, colonIdx).trim();
      if (/^[가-힣]+$/.test(key) && key.length >= 2 && key.length <= 8) {
        kvLines.push({
          key,
          value: text.slice(colonIdx + 1).trim(),
          block
        });
        continue;
      }
    }
    flushKvTable();
    result.push(block);
  }
  flushKvTable();
  return result;
}
function mergeKoreanLines(text) {
  if (!text) return "";
  const lines = text.split("\n");
  if (lines.length <= 1) return text;
  const result = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const prev = result[result.length - 1];
    const curr = lines[i];
    if (/^#{1,6}\s/.test(prev) || /^#{1,6}\s/.test(curr)) {
      result.push(curr);
      continue;
    }
    if (/[가-힣·,\-]$/.test(prev) && /^[가-힣(]/.test(curr) && !startsWithMarker(curr) && !isStandaloneHeader(prev)) {
      result[result.length - 1] = prev + " " + curr;
    } else {
      result.push(curr);
    }
  }
  return result.join("\n");
}

// src/form/recognize.ts
var LABEL_KEYWORDS = /* @__PURE__ */ new Set([
  "\uC131\uBA85",
  "\uC774\uB984",
  "\uC8FC\uC18C",
  "\uC804\uD654",
  "\uC804\uD654\uBC88\uD638",
  "\uD734\uB300\uD3F0",
  "\uD578\uB4DC\uD3F0",
  "\uC5F0\uB77D\uCC98",
  "\uC0DD\uB144\uC6D4\uC77C",
  "\uC8FC\uBBFC\uB4F1\uB85D\uBC88\uD638",
  "\uC18C\uC18D",
  "\uC9C1\uC704",
  "\uC9C1\uAE09",
  "\uBD80\uC11C",
  "\uC774\uBA54\uC77C",
  "\uD329\uC2A4",
  "\uD559\uAD50",
  "\uD559\uB144",
  "\uBC18",
  "\uBC88\uD638",
  "\uC2E0\uCCAD\uC778",
  "\uB300\uD45C\uC790",
  "\uB2F4\uB2F9\uC790",
  "\uC791\uC131\uC790",
  "\uD655\uC778\uC790",
  "\uC2B9\uC778\uC790",
  "\uC77C\uC2DC",
  "\uB0A0\uC9DC",
  "\uAE30\uAC04",
  "\uC7A5\uC18C",
  "\uBAA9\uC801",
  "\uC0AC\uC720",
  "\uBE44\uACE0",
  "\uAE08\uC561",
  "\uC218\uB7C9",
  "\uB2E8\uAC00",
  "\uD569\uACC4",
  "\uACC4",
  "\uC18C\uACC4"
]);
function isLabelCell(text) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 30) return false;
  for (const kw of LABEL_KEYWORDS) {
    if (trimmed.includes(kw)) return true;
  }
  if (/^[가-힣\s()·:]{2,8}$/.test(trimmed) && !/\d/.test(trimmed)) return true;
  if (/^[가-힣A-Za-z\s]+[:：]$/.test(trimmed)) return true;
  return false;
}
function extractFormFields(blocks) {
  const fields = [];
  let totalTables = 0;
  let formTables = 0;
  for (const block of blocks) {
    if (block.type !== "table" || !block.table) continue;
    totalTables++;
    const tableFields = extractFromTable(block.table);
    if (tableFields.length > 0) {
      formTables++;
      fields.push(...tableFields);
    }
  }
  for (const block of blocks) {
    if (block.type === "paragraph" && block.text) {
      const inlineFields = extractInlineFields(block.text);
      fields.push(...inlineFields);
    }
  }
  const confidence = totalTables > 0 ? formTables / totalTables : fields.length > 0 ? 0.3 : 0;
  return { fields, confidence: Math.min(confidence, 1) };
}
function extractFromTable(table) {
  const fields = [];
  if (table.cols >= 2) {
    for (let r = 0; r < table.rows; r++) {
      for (let c = 0; c < table.cols - 1; c++) {
        const labelCell = table.cells[r][c];
        const valueCell = table.cells[r][c + 1];
        if (isLabelCell(labelCell.text) && valueCell.text.trim()) {
          fields.push({
            label: labelCell.text.trim().replace(/[:：]\s*$/, ""),
            value: valueCell.text.trim(),
            row: r,
            col: c
          });
        }
      }
    }
  }
  if (fields.length === 0 && table.rows >= 2 && table.cols >= 2) {
    const headerRow = table.cells[0];
    const allLabels = headerRow.every((cell) => {
      const t = cell.text.trim();
      return t.length > 0 && t.length <= 20;
    });
    if (allLabels) {
      for (let r = 1; r < table.rows; r++) {
        for (let c = 0; c < table.cols; c++) {
          const label = headerRow[c].text.trim();
          const value = table.cells[r][c].text.trim();
          if (label && value) {
            fields.push({ label, value, row: r, col: c });
          }
        }
      }
    }
  }
  return fields;
}
function extractInlineFields(text) {
  const fields = [];
  const pattern = /([가-힣A-Za-z]{2,10})\s*[:：]\s*([^\n,;]{1,100})/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const label = match[1].trim();
    const value = match[2].trim();
    if (value) {
      fields.push({ label, value, row: -1, col: -1 });
    }
  }
  return fields;
}

// src/hwpx/generator.ts
import JSZip2 from "jszip";

// src/index.ts
async function parse(buffer, options) {
  if (!buffer || buffer.byteLength === 0) {
    return { success: false, fileType: "unknown", error: "\uBE48 \uBC84\uD37C\uC774\uAC70\uB098 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC785\uB825\uC785\uB2C8\uB2E4.", code: "EMPTY_INPUT" };
  }
  const format = detectFormat(buffer);
  switch (format) {
    case "hwpx":
      return parseHwpx(buffer, options);
    case "hwp":
      return parseHwp(buffer, options);
    case "pdf":
      return parsePdf(buffer, options);
    default:
      return { success: false, fileType: "unknown", error: "\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uD30C\uC77C \uD615\uC2DD\uC785\uB2C8\uB2E4.", code: "UNSUPPORTED_FORMAT" };
  }
}
async function parseHwpx(buffer, options) {
  try {
    const { markdown, blocks, metadata, outline, warnings } = await parseHwpxDocument(buffer, options);
    return { success: true, fileType: "hwpx", markdown, blocks, metadata, outline, warnings };
  } catch (err) {
    return { success: false, fileType: "hwpx", error: err instanceof Error ? err.message : "HWPX \uD30C\uC2F1 \uC2E4\uD328", code: classifyError(err) };
  }
}
async function parseHwp(buffer, options) {
  try {
    const { markdown, blocks, metadata, outline, warnings } = parseHwp5Document(Buffer.from(buffer), options);
    return { success: true, fileType: "hwp", markdown, blocks, metadata, outline, warnings };
  } catch (err) {
    return { success: false, fileType: "hwp", error: err instanceof Error ? err.message : "HWP \uD30C\uC2F1 \uC2E4\uD328", code: classifyError(err) };
  }
}
async function parsePdf(buffer, options) {
  try {
    return await parsePdfDocument(buffer, options);
  } catch (err) {
    return { success: false, fileType: "pdf", error: err instanceof Error ? err.message : "PDF \uD30C\uC2F1 \uC2E4\uD328", code: classifyError(err) };
  }
}

// src/diff/text-diff.ts
function similarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}
function normalizedSimilarity(a, b) {
  return similarity(normalize(a), normalize(b));
}
function normalize(s) {
  return s.replace(/\s+/g, " ").trim();
}
function levenshtein(a, b) {
  if (a.length > b.length) [a, b] = [b, a];
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: m + 1 }, (_, i) => i);
  let curr = new Array(m + 1);
  for (let j = 1; j <= n; j++) {
    curr[0] = j;
    for (let i = 1; i <= m; i++) {
      if (a[i - 1] === b[j - 1]) {
        curr[i] = prev[i - 1];
      } else {
        curr[i] = 1 + Math.min(prev[i - 1], prev[i], curr[i - 1]);
      }
    }
    ;
    [prev, curr] = [curr, prev];
  }
  return prev[m];
}

// src/diff/compare.ts
var SIMILARITY_THRESHOLD = 0.4;
async function compare(bufferA, bufferB, options) {
  const [resultA, resultB] = await Promise.all([
    parse(bufferA, options),
    parse(bufferB, options)
  ]);
  if (!resultA.success) throw new Error(`\uBB38\uC11CA \uD30C\uC2F1 \uC2E4\uD328: ${resultA.error}`);
  if (!resultB.success) throw new Error(`\uBB38\uC11CB \uD30C\uC2F1 \uC2E4\uD328: ${resultB.error}`);
  return diffBlocks(resultA.blocks, resultB.blocks);
}
function diffBlocks(blocksA, blocksB) {
  const aligned = alignBlocks(blocksA, blocksB);
  const stats = { added: 0, removed: 0, modified: 0, unchanged: 0 };
  const diffs = [];
  for (const [a, b] of aligned) {
    if (a && b) {
      const sim = blockSimilarity(a, b);
      if (sim >= 0.99) {
        diffs.push({ type: "unchanged", before: a, after: b, similarity: 1 });
        stats.unchanged++;
      } else {
        const diff = { type: "modified", before: a, after: b, similarity: sim };
        if (a.type === "table" && b.type === "table" && a.table && b.table) {
          diff.cellDiffs = diffTableCells(a.table, b.table);
        }
        diffs.push(diff);
        stats.modified++;
      }
    } else if (a) {
      diffs.push({ type: "removed", before: a });
      stats.removed++;
    } else if (b) {
      diffs.push({ type: "added", after: b });
      stats.added++;
    }
  }
  return { stats, diffs };
}
function alignBlocks(a, b) {
  const m = a.length, n = b.length;
  if (m * n > 1e7) return fallbackAlign(a, b);
  const simCache = /* @__PURE__ */ new Map();
  const getSim = (i2, j2) => {
    const key = `${i2},${j2}`;
    let v = simCache.get(key);
    if (v === void 0) {
      v = blockSimilarity(a[i2], b[j2]);
      simCache.set(key, v);
    }
    return v;
  };
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i2 = 1; i2 <= m; i2++) {
    for (let j2 = 1; j2 <= n; j2++) {
      if (getSim(i2 - 1, j2 - 1) >= SIMILARITY_THRESHOLD) {
        dp[i2][j2] = dp[i2 - 1][j2 - 1] + 1;
      } else {
        dp[i2][j2] = Math.max(dp[i2 - 1][j2], dp[i2][j2 - 1]);
      }
    }
  }
  const pairs = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (getSim(i - 1, j - 1) >= SIMILARITY_THRESHOLD && dp[i][j] === dp[i - 1][j - 1] + 1) {
      pairs.push([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  pairs.reverse();
  const result = [];
  let ai = 0, bi = 0;
  for (const [pi, pj] of pairs) {
    while (ai < pi) result.push([a[ai++], null]);
    while (bi < pj) result.push([null, b[bi++]]);
    result.push([a[ai++], b[bi++]]);
  }
  while (ai < m) result.push([a[ai++], null]);
  while (bi < n) result.push([null, b[bi++]]);
  return result;
}
function fallbackAlign(a, b) {
  const result = [];
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    result.push([a[i] || null, b[i] || null]);
  }
  return result;
}
function blockSimilarity(a, b) {
  if (a.type !== b.type) return 0;
  if (a.text !== void 0 && b.text !== void 0) {
    return normalizedSimilarity(a.text || "", b.text || "");
  }
  if (a.type === "table" && a.table && b.table) {
    return tableSimilarity(a.table, b.table);
  }
  if (a.type === b.type) return 1;
  return 0;
}
function tableSimilarity(a, b) {
  const dimSim = 1 - Math.abs(a.rows * a.cols - b.rows * b.cols) / Math.max(a.rows * a.cols, b.rows * b.cols, 1);
  const textsA = a.cells.flat().map((c) => c.text).join(" ");
  const textsB = b.cells.flat().map((c) => c.text).join(" ");
  const contentSim = normalizedSimilarity(textsA, textsB);
  return dimSim * 0.3 + contentSim * 0.7;
}
function diffTableCells(a, b) {
  const maxRows = Math.max(a.rows, b.rows);
  const maxCols = Math.max(a.cols, b.cols);
  const result = [];
  for (let r = 0; r < maxRows; r++) {
    const row = [];
    for (let c = 0; c < maxCols; c++) {
      const cellA = r < a.rows && c < a.cols ? a.cells[r][c].text : void 0;
      const cellB = r < b.rows && c < b.cols ? b.cells[r][c].text : void 0;
      let type;
      if (cellA === void 0) type = "added";
      else if (cellB === void 0) type = "removed";
      else if (cellA === cellB) type = "unchanged";
      else type = "modified";
      row.push({ type, before: cellA, after: cellB });
    }
    result.push(row);
  }
  return result;
}

export {
  detectFormat,
  blocksToMarkdown,
  VERSION,
  toArrayBuffer,
  KordocError,
  sanitizeError,
  extractHwpxMetadataOnly,
  extractHwp5MetadataOnly,
  extractPdfMetadataOnly,
  compare,
  extractFormFields,
  parse
};
//# sourceMappingURL=chunk-DYUB34PO.js.map