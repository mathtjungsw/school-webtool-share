#!/usr/bin/env node
import {
  VERSION,
  detectFormat,
  parse,
  toArrayBuffer
} from "./chunk-DYUB34PO.js";

// src/cli.ts
import { readFileSync, writeFileSync, mkdirSync, statSync } from "fs";
import { basename, resolve } from "path";
import { Command } from "commander";
var program = new Command();
program.name("kordoc").description("\uBAA8\uB450 \uD30C\uC2F1\uD574\uBC84\uB9AC\uACA0\uB2E4 \u2014 HWP, HWPX, PDF \u2192 Markdown").version(VERSION).argument("<files...>", "\uBCC0\uD658\uD560 \uD30C\uC77C \uACBD\uB85C (HWP, HWPX, PDF)").option("-o, --output <path>", "\uCD9C\uB825 \uD30C\uC77C \uACBD\uB85C (\uB2E8\uC77C \uD30C\uC77C \uC2DC)").option("-d, --out-dir <dir>", "\uCD9C\uB825 \uB514\uB809\uD1A0\uB9AC (\uB2E4\uC911 \uD30C\uC77C \uC2DC)").option("-p, --pages <range>", "\uD398\uC774\uC9C0/\uC139\uC158 \uBC94\uC704 (\uC608: 1-3, 1,3,5)").option("--format <type>", "\uCD9C\uB825 \uD615\uC2DD: markdown (\uAE30\uBCF8) \uB610\uB294 json", "markdown").option("--silent", "\uC9C4\uD589 \uBA54\uC2DC\uC9C0 \uC228\uAE30\uAE30").action(async (files, opts) => {
  for (const filePath of files) {
    const absPath = resolve(filePath);
    const fileName = basename(absPath);
    try {
      const fileSize = statSync(absPath).size;
      if (fileSize > 500 * 1024 * 1024) {
        process.stderr.write(`
[kordoc] SKIP: ${fileName} \u2014 \uD30C\uC77C\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4 (${(fileSize / 1024 / 1024).toFixed(1)}MB)
`);
        process.exitCode = 1;
        continue;
      }
      const buffer = readFileSync(absPath);
      const arrayBuffer = toArrayBuffer(buffer);
      const format = detectFormat(arrayBuffer);
      if (!opts.silent) {
        process.stderr.write(`[kordoc] ${fileName} (${format}) ...`);
      }
      const parseOptions = opts.pages ? { pages: opts.pages } : void 0;
      const result = await parse(arrayBuffer, parseOptions);
      if (!result.success) {
        process.stderr.write(` FAIL
`);
        process.stderr.write(`  \u2192 ${result.error}
`);
        process.exitCode = 1;
        continue;
      }
      if (!opts.silent) process.stderr.write(` OK
`);
      const output = opts.format === "json" ? JSON.stringify(result, null, 2) : result.markdown;
      if (opts.output && files.length === 1) {
        writeFileSync(opts.output, output, "utf-8");
        if (!opts.silent) process.stderr.write(`  \u2192 ${opts.output}
`);
      } else if (opts.outDir) {
        mkdirSync(opts.outDir, { recursive: true });
        const outExt = opts.format === "json" ? ".json" : ".md";
        const outPath = resolve(opts.outDir, fileName.replace(/\.[^.]+$/, outExt));
        writeFileSync(outPath, output, "utf-8");
        if (!opts.silent) process.stderr.write(`  \u2192 ${outPath}
`);
      } else {
        process.stdout.write(output + "\n");
      }
    } catch (err) {
      process.stderr.write(`
[kordoc] ERROR: ${fileName} \u2014 ${err instanceof Error ? err.message : err}
`);
      process.exitCode = 1;
    }
  }
});
program.command("watch <dir>").description("\uB514\uB809\uD1A0\uB9AC \uAC10\uC2DC \u2014 \uC0C8 \uBB38\uC11C \uC790\uB3D9 \uBCC0\uD658").option("--webhook <url>", "\uACB0\uACFC \uC804\uC1A1 \uC6F9\uD6C5 URL").option("-d, --out-dir <dir>", "\uBCC0\uD658 \uACB0\uACFC \uCD9C\uB825 \uB514\uB809\uD1A0\uB9AC").option("-p, --pages <range>", "\uD398\uC774\uC9C0/\uC139\uC158 \uBC94\uC704").option("--format <type>", "\uCD9C\uB825 \uD615\uC2DD: markdown \uB610\uB294 json", "markdown").option("--silent", "\uC9C4\uD589 \uBA54\uC2DC\uC9C0 \uC228\uAE30\uAE30").action(async (dir, opts) => {
  const { watchDirectory } = await import("./watch-3QVNEAVM.js");
  await watchDirectory({
    dir,
    outDir: opts.outDir,
    webhook: opts.webhook,
    format: opts.format,
    pages: opts.pages,
    silent: opts.silent
  });
});
program.parse();
//# sourceMappingURL=cli.js.map