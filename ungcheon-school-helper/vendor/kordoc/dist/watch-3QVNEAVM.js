#!/usr/bin/env node
import {
  detectFormat,
  parse,
  toArrayBuffer
} from "./chunk-DYUB34PO.js";

// src/watch.ts
import { watch, readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from "fs";
import { basename, resolve, extname } from "path";
var SUPPORTED_EXTENSIONS = /* @__PURE__ */ new Set([".hwp", ".hwpx", ".pdf"]);
var DEBOUNCE_MS = 500;
var MAX_FILE_SIZE = 500 * 1024 * 1024;
async function watchDirectory(options) {
  const { dir, outDir, webhook, format = "markdown", pages, silent } = options;
  if (!existsSync(dir)) throw new Error(`\uB514\uB809\uD1A0\uB9AC\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${dir}`);
  if (outDir) mkdirSync(outDir, { recursive: true });
  const log = silent ? () => {
  } : (msg) => process.stderr.write(msg + "\n");
  log(`[kordoc watch] \uAC10\uC2DC \uC2DC\uC791: ${resolve(dir)}`);
  if (outDir) log(`[kordoc watch] \uCD9C\uB825: ${resolve(outDir)}`);
  if (webhook) log(`[kordoc watch] \uC6F9\uD6C5: ${webhook}`);
  const pending = /* @__PURE__ */ new Map();
  const processFile = async (filePath) => {
    const ext = extname(filePath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) return;
    const fileName = basename(filePath);
    try {
      const absPath = resolve(dir, filePath);
      if (!existsSync(absPath)) return;
      const fileSize = statSync(absPath).size;
      if (fileSize > MAX_FILE_SIZE || fileSize === 0) return;
      log(`[kordoc watch] \uBCC0\uD658 \uC911: ${fileName}`);
      const buffer = readFileSync(absPath);
      const arrayBuffer = toArrayBuffer(buffer);
      const parseOptions = pages ? { pages } : void 0;
      const result = await parse(arrayBuffer, parseOptions);
      if (!result.success) {
        log(`[kordoc watch] \uC2E4\uD328: ${fileName} \u2014 ${result.error}`);
        await sendWebhook(webhook, { file: fileName, format: detectFormat(arrayBuffer), success: false, error: result.error });
        return;
      }
      const output = format === "json" ? JSON.stringify(result, null, 2) : result.markdown;
      if (outDir) {
        const outExt = format === "json" ? ".json" : ".md";
        const outPath = resolve(outDir, fileName.replace(/\.[^.]+$/, outExt));
        writeFileSync(outPath, output, "utf-8");
        log(`[kordoc watch] \uC644\uB8CC: ${fileName} \u2192 ${basename(outPath)}`);
      } else {
        process.stdout.write(output + "\n");
      }
      await sendWebhook(webhook, {
        file: fileName,
        format: result.fileType,
        success: true,
        markdown: format === "markdown" ? output.substring(0, 1e3) : void 0
      });
    } catch (err) {
      log(`[kordoc watch] \uC5D0\uB7EC: ${fileName} \u2014 ${err instanceof Error ? err.message : err}`);
    }
  };
  watch(dir, { recursive: true }, (event, filename) => {
    if (!filename) return;
    const filePath = filename.toString();
    const existing = pending.get(filePath);
    if (existing) clearTimeout(existing);
    pending.set(filePath, setTimeout(() => {
      pending.delete(filePath);
      processFile(filePath).catch(() => {
      });
    }, DEBOUNCE_MS));
  });
  return new Promise(() => {
  });
}
async function sendWebhook(url, payload) {
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, timestamp: (/* @__PURE__ */ new Date()).toISOString() })
    });
  } catch {
  }
}
export {
  watchDirectory
};
//# sourceMappingURL=watch-3QVNEAVM.js.map