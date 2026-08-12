import * as XLSX from 'xlsx'

export function binaryToNumberArray(value: unknown): number[] {
  if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value))
  if (ArrayBuffer.isView(value)) {
    return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  }
  if (Array.isArray(value)) return value.map(item => Number(item) & 0xff)
  throw new Error('생성된 파일의 바이너리 형식을 변환하지 못했습니다.')
}

export function xlsxWorkbookBytes(workbook: XLSX.WorkBook): number[] {
  return binaryToNumberArray(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }))
}
