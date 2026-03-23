const documentTextCache = new Map<string, string | null>()

export async function extractDocumentTextFromUrl(url: string): Promise<string | null> {
  if (documentTextCache.has(url)) return documentTextCache.get(url)!

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'CityPulse/1.0' },
      signal: AbortSignal.timeout(20000),
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      throw new Error(`Fetch failed: ${res.status}`)
    }

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
    const buffer = Buffer.from(await res.arrayBuffer())
    const text = await extractDocumentTextFromBuffer(buffer, contentType, url)
    const normalized = normalizeDocumentText(text)

    documentTextCache.set(url, normalized)
    return normalized
  } catch (err) {
    console.warn(`[DocumentText] Failed to extract text from ${url}:`, err)
    documentTextCache.set(url, null)
    return null
  }
}

export function extractDocumentTextFromHtml(html: string): string | null {
  const withoutScripts = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')

  const blockified = withoutScripts
    .replace(/<(?:\/?(?:div|p|section|article|tr|table|thead|tbody|tfoot|ul|ol|li|h[1-6]|br))[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')

  return normalizeDocumentText(blockified)
}

export function isSubstantiveDocumentText(text: string | null): boolean {
  if (!text) return false

  const words = text.split(/\s+/).filter(Boolean)
  const letterCount = (text.match(/[A-Za-z]/g) ?? []).length

  return text.length >= 200 && words.length >= 30 && letterCount >= 100
}

async function extractDocumentTextFromBuffer(
  buffer: Buffer,
  contentType: string,
  url: string
): Promise<string | null> {
  if (looksLikePdf(buffer, contentType, url)) {
    return extractPdfTextFromBuffer(buffer)
  }

  if (looksLikeHtml(buffer, contentType, url)) {
    return extractDocumentTextFromHtml(buffer.toString('utf8'))
  }

  if (contentType.startsWith('text/')) {
    return normalizeDocumentText(buffer.toString('utf8'))
  }

  return null
}

async function extractPdfTextFromBuffer(buffer: Buffer): Promise<string | null> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: buffer })

  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
}

function looksLikePdf(buffer: Buffer, contentType: string, url: string): boolean {
  return (
    contentType.includes('application/pdf') ||
    url.toLowerCase().endsWith('.pdf') ||
    buffer.subarray(0, 4).toString('latin1') === '%PDF'
  )
}

function looksLikeHtml(buffer: Buffer, contentType: string, url: string): boolean {
  if (contentType.includes('text/html') || contentType.includes('application/xhtml')) return true
  if (url.toLowerCase().endsWith('.html') || url.toLowerCase().includes('fulltext=1')) return true

  const prefix = buffer.subarray(0, 256).toString('utf8').trimStart().toLowerCase()
  return prefix.startsWith('<!doctype html') || prefix.startsWith('<html') || prefix.startsWith('<body')
}

function normalizeDocumentText(value: string | null | undefined): string | null {
  if (!value) return null

  const normalized = decodeHtml(value)
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\u0000/g, ' ')
    .replace(/^--\s*\d+\s+of\s+\d+\s*--$/gim, ' ')
    .replace(/^\s*page\s+\d+\s+of\s+\d+\s*$/gim, ' ')
    .replace(/[ \f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim()

  return normalized || null
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
}
