declare module 'pdf-parse' {
  interface PdfParseResult {
    text: string
    numpages?: number
    numrender?: number
    info?: Record<string, unknown>
    metadata?: unknown
    version?: string
  }

  export default function pdfParse(
    dataBuffer: Buffer,
    options?: Record<string, unknown>
  ): Promise<PdfParseResult>
}

declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string
    numpages?: number
    numrender?: number
    info?: Record<string, unknown>
    metadata?: unknown
    version?: string
  }

  export default function pdfParse(
    dataBuffer: Buffer,
    options?: Record<string, unknown>
  ): Promise<PdfParseResult>
}
