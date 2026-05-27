type PdfLine = {
  text: string
  size: number
  bold?: boolean
  gapBefore?: number
  gapAfter?: number
}

const PAGE_WIDTH = 612
const PAGE_HEIGHT = 792
const MARGIN_X = 54
const MARGIN_TOP = 56
const MARGIN_BOTTOM = 56

export function createReportPdf(input: {
  title: string
  metadata: Array<{ label: string; value: string }>
  reportText: string
}): Buffer {
  const lines: PdfLine[] = [
    { text: input.title, size: 20, bold: true, gapAfter: 10 },
    ...input.metadata.map((item) => ({
      text: `${item.label}: ${item.value || '-'}`,
      size: 9,
    })),
    { text: 'Report', size: 15, bold: true, gapBefore: 18, gapAfter: 6 },
    ...markdownToPdfLines(input.reportText),
  ]

  const pages = paginate(lines)
  return buildPdf(pages)
}

function markdownToPdfLines(markdown: string): PdfLine[] {
  const output: PdfLine[] = []
  const sourceLines = markdown.split(/\r?\n/)

  for (const rawLine of sourceLines) {
    const line = rawLine.trim()

    if (!line) {
      output.push({ text: '', size: 10, gapAfter: 6 })
      continue
    }

    if (/^\|?\s*-{3,}/.test(line)) continue

    const heading = line.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      output.push({
        text: stripMarkdown(heading[2]),
        size: level === 1 ? 16 : level === 2 ? 14 : 12,
        bold: true,
        gapBefore: level <= 2 ? 12 : 8,
        gapAfter: 4,
      })
      continue
    }

    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      output.push({ text: `- ${stripMarkdown(bullet[1])}`, size: 10 })
      continue
    }

    output.push({ text: stripMarkdown(line), size: 10 })
  }

  return output
}

function stripMarkdown(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
}

function paginate(lines: PdfLine[]): PdfLine[][] {
  const pages: PdfLine[][] = [[]]
  let y = PAGE_HEIGHT - MARGIN_TOP

  for (const line of lines) {
    const wrapped = wrapText(line.text, line.size)
    const gapBefore = line.gapBefore ?? 0
    const gapAfter = line.gapAfter ?? 0
    const lineHeight = Math.ceil(line.size * 1.45)
    const blockHeight = gapBefore + Math.max(wrapped.length, 1) * lineHeight + gapAfter

    if (y - blockHeight < MARGIN_BOTTOM && pages[pages.length - 1].length > 0) {
      pages.push([])
      y = PAGE_HEIGHT - MARGIN_TOP
    }

    if (gapBefore) {
      pages[pages.length - 1].push({ text: '', size: line.size, gapAfter: gapBefore })
      y -= gapBefore
    }

    for (const text of wrapped.length > 0 ? wrapped : ['']) {
      pages[pages.length - 1].push({ ...line, text, gapBefore: 0, gapAfter: 0 })
      y -= lineHeight
    }

    if (gapAfter) {
      pages[pages.length - 1].push({ text: '', size: line.size, gapAfter })
      y -= gapAfter
    }
  }

  return pages
}

function wrapText(text: string, size: number): string[] {
  const normalized = normalizePdfText(text)
  if (!normalized) return ['']

  const maxChars = Math.max(20, Math.floor((PAGE_WIDTH - MARGIN_X * 2) / (size * 0.52)))
  const words = normalized.split(/\s+/)
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }

  if (current) lines.push(current)
  return lines
}

function normalizePdfText(value: string): string {
  return value
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
}

function buildPdf(pages: PdfLine[][]): Buffer {
  const objects = new Map<number, string>()
  const regularFontId = 1
  const boldFontId = 2
  const pagesId = 3

  objects.set(regularFontId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  objects.set(boldFontId, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>')

  const pageIds: number[] = []
  let nextObjectId = 4

  pages.forEach((pageLines, pageIndex) => {
    const pageId = nextObjectId++
    const contentId = nextObjectId++
    pageIds.push(pageId)

    const stream = buildContentStream(pageLines, pageIndex + 1, pages.length)
    objects.set(
      pageId,
      [
        '<< /Type /Page',
        `/Parent ${pagesId} 0 R`,
        `/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]`,
        `/Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >>`,
        `/Contents ${contentId} 0 R`,
        '>>',
      ].join(' '),
    )
    objects.set(contentId, `<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream`)
  })

  objects.set(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`)

  const catalogId = nextObjectId++
  objects.set(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`)

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = [0]

  for (let id = 1; id <= catalogId; id += 1) {
    const body = objects.get(id)
    if (!body) continue
    offsets[id] = Buffer.byteLength(pdf, 'utf8')
    pdf += `${id} 0 obj\n${body}\nendobj\n`
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${catalogId + 1}\n`
  pdf += '0000000000 65535 f \n'

  for (let id = 1; id <= catalogId; id += 1) {
    pdf += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`
  }

  pdf += `trailer\n<< /Size ${catalogId + 1} /Root ${catalogId} 0 R >>\n`
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`

  return Buffer.from(pdf, 'utf8')
}

function buildContentStream(lines: PdfLine[], pageNumber: number, pageCount: number): string {
  const commands: string[] = []
  let y = PAGE_HEIGHT - MARGIN_TOP

  for (const line of lines) {
    if (!line.text) {
      y -= line.gapAfter ?? Math.ceil(line.size * 1.45)
      continue
    }

    const font = line.bold ? 'F2' : 'F1'
    commands.push(`BT /${font} ${line.size} Tf ${MARGIN_X} ${y} Td (${escapePdfText(line.text)}) Tj ET`)
    y -= Math.ceil(line.size * 1.45)
  }

  commands.push(`BT /F1 8 Tf ${PAGE_WIDTH - MARGIN_X - 70} 30 Td (Page ${pageNumber} of ${pageCount}) Tj ET`)
  return commands.join('\n')
}

function escapePdfText(value: string): string {
  return normalizePdfText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
}
