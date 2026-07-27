declare module 'kordoc' {
  export function parse(buffer: ArrayBuffer, options?: Record<string, unknown>): Promise<any>
  export function parseFile(filePath: string, options?: Record<string, unknown>): Promise<any>
}
