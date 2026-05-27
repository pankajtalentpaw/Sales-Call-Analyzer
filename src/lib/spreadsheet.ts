import JSZip from 'jszip'

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
}

export async function extractSpreadsheetText(
  fileName: string,
  buffer: Buffer,
): Promise<string> {
  const ext = fileName.split('.').pop()?.toLowerCase()

  if (ext === 'csv') return buffer.toString('utf-8')
  if (ext === 'xlsx') return extractXlsxText(buffer)

  throw new Error('Only .xlsx and .csv sheet files are supported')
}

async function extractXlsxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const sharedStrings = await readSharedStrings(zip)
  const sheetFiles = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort()

  const sheets: string[] = []

  for (const sheetName of sheetFiles) {
    const xml = await zip.file(sheetName)?.async('string')
    if (!xml) continue

    const rows = extractRows(xml, sharedStrings)
    if (rows.length > 0) {
      sheets.push(`${sheetName}\n${rows.map((row) => row.join('\t')).join('\n')}`)
    }
  }

  return sheets.join('\n\n').trim()
}

async function readSharedStrings(zip: JSZip): Promise<string[]> {
  const xml = await zip.file('xl/sharedStrings.xml')?.async('string')
  if (!xml) return []

  return Array.from(xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)).map((match) => {
    const textParts = Array.from(match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g))
    return textParts.map((part) => decodeXml(part[1])).join('')
  })
}

function extractRows(xml: string, sharedStrings: string[]): string[][] {
  return Array.from(xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g))
    .map((rowMatch) =>
      Array.from(rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)).map((cellMatch) =>
        extractCellValue(cellMatch[1], cellMatch[2], sharedStrings),
      ),
    )
    .filter((row) => row.some((cell) => cell.trim()))
}

function extractCellValue(attributes: string, cellXml: string, sharedStrings: string[]): string {
  const value = cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? ''
  const inlineValue = cellXml.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1]

  if (attributes.includes('t="s"')) {
    return sharedStrings[Number(value)] ?? ''
  }

  return decodeXml(inlineValue ?? value)
}

function decodeXml(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (_, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCharCode(Number.parseInt(entity.slice(2), 16))
    if (entity.startsWith('#')) return String.fromCharCode(Number.parseInt(entity.slice(1), 10))
    return XML_ENTITIES[entity] ?? `&${entity};`
  })
}
