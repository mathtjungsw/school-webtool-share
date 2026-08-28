import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const qaDir = process.argv[2]
const artifactEntry = process.argv[3]
if (!qaDir || !artifactEntry) throw new Error('사용법: node qa-student-location-spreadsheet.mjs <QA 폴더> <artifact_tool.mjs>')

const { FileBlob, SpreadsheetFile } = await import(pathToFileURL(artifactEntry).href)
for (const fileName of ['student-location-template.xlsx', 'student-location-result.xlsx']) {
  const filePath = path.join(qaDir, fileName)
  const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(filePath))
  const sheets = await workbook.inspect({ kind: 'sheet', include: 'id,name', maxChars: 2000 })
  const firstSheet = workbook.worksheets.getItemAt(0)
  const region = await workbook.inspect({ kind: 'region', sheetId: firstSheet.name, range: fileName.includes('template') ? 'A1:B8' : 'A1:O8', maxChars: 5000 })
  const formulas = await workbook.inspect({ kind: 'formula', sheetId: firstSheet.name, range: fileName.includes('template') ? 'A1:B100' : 'A1:O1000', maxChars: 2000, options: { maxResults: 50 } })
  const preview = await workbook.render({ sheetName: firstSheet.name, autoCrop: 'all', scale: 1, format: 'png' })
  await fs.writeFile(path.join(qaDir, fileName.replace('.xlsx', '.png')), new Uint8Array(await preview.arrayBuffer()))
  console.log(JSON.stringify({ fileName, sheets: sheets.ndjson, region: region.ndjson, formulas: formulas.ndjson }))
}
