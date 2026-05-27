const OPENAI_BASE_URL = 'https://api.openai.com/v1'
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o'

interface OpenAIChatResponse {
  choices?: Array<{
    message?: { content?: string | null }
    finish_reason?: string
  }>
  error?: { message?: string }
}

interface CallAnalysisInput {
  transcript: string
  masterInstructions?: string | null
  metadata: {
    employeeName: string
    analysisHead: string
    callScenario: string
    callDate: string
    fileName: string
    notes?: string | null
  }
}

interface AnalysisReportInput {
  masterFileText: string
  filters: {
    employeeName: string
    dateFrom: string
    dateTo: string
    analysisHead: string
    callScenario: string
  }
  calls: Array<{
    callId: string
    employeeName: string
    callDatetime: string
    durationSeconds?: number
    scenarioName: string
    transcript: string
  }>
}

interface BatchReportInput {
  sheetText?: string | null
  metadata: {
    employeeName: string
    analysisHead: string
    callScenario: string
    callDate: string
    totalFiles: number
    notes?: string | null
  }
  calls: Array<{
    fileName: string
    transcript: string
    analysisText?: string | null
  }>
}

export async function analyzeCallTranscript(input: CallAnalysisInput): Promise<{
  analysisText: string
  rawJson: string
  model: string
}> {
  const data = await generateContent(buildPrompt(input), 0.2)
  const analysisText = extractText(data)

  if (!analysisText) throw new Error('OpenAI analysis returned an empty response')

  return {
    analysisText,
    rawJson: JSON.stringify(data),
    model: OPENAI_MODEL,
  }
}

export async function generateAnalysisReport(input: AnalysisReportInput): Promise<{
  reportText: string
  rawJson: string
  model: string
}> {
  const data = await generateContent(buildAnalysisReportPrompt(input), 0.2)
  const reportText = extractText(data)
  if (!reportText) throw new Error('OpenAI analysis report returned an empty response')
  return { reportText, rawJson: JSON.stringify(data), model: OPENAI_MODEL }
}

export async function generateBatchReport(input: BatchReportInput): Promise<{
  reportText: string
  rawJson: string
  model: string
}> {
  const data = await generateContent(buildBatchReportPrompt(input), 0.2)
  const reportText = extractText(data)

  if (!reportText) throw new Error('OpenAI report generation returned an empty response')

  return {
    reportText,
    rawJson: JSON.stringify(data),
    model: OPENAI_MODEL,
  }
}

async function generateContent(prompt: string, temperature: number): Promise<OpenAIChatResponse> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY environment variable is not set')

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature,
    }),
  })

  const text = await response.text()
  const data = text.trim() ? (JSON.parse(text) as OpenAIChatResponse) : null

  if (!response.ok || data?.error) {
    throw new Error(`OpenAI request failed: ${data?.error?.message ?? response.statusText}`)
  }

  return data ?? {}
}

function extractText(data: OpenAIChatResponse): string {
  return data.choices?.[0]?.message?.content?.trim() ?? ''
}

function buildPrompt(input: CallAnalysisInput): string {
  const instructions = truncate(input.masterInstructions?.trim() || defaultInstructions(), 30000)
  const transcript = truncate(input.transcript, 80000)

  return `You are an expert sales call quality analyst.

Analyze the call transcript using the master instructions and call metadata below.
Return valid JSON only. Do not wrap the JSON in markdown.

Required JSON schema:
{
  "summary": "short call summary",
  "overall_score": 0,
  "outcome": "converted | interested | follow_up | not_interested | unknown",
  "customer_sentiment": "positive | neutral | negative | mixed | unknown",
  "customer_intent": "short intent description",
  "strengths": ["what went well"],
  "improvement_areas": ["what should improve"],
  "objections": ["customer objections or concerns"],
  "missed_opportunities": ["missed sales or service opportunities"],
  "next_steps": ["recommended next actions"],
  "coaching_notes": ["coaching feedback for the agent"],
  "compliance_notes": ["policy or process notes"],
  "important_quotes": ["short transcript quotes that support the analysis"]
}

Scoring rules:
- overall_score must be an integer from 0 to 100.
- Use only evidence from the transcript.
- If information is missing, use "unknown" or an empty array.

Call metadata:
- Employee: ${input.metadata.employeeName}
- Analysis head: ${input.metadata.analysisHead}
- Call scenario: ${input.metadata.callScenario}
- Call date: ${input.metadata.callDate}
- File name: ${input.metadata.fileName}
- Notes: ${input.metadata.notes || 'None'}

Master instructions:
${instructions}

Transcript:
${transcript}`
}

function buildBatchReportPrompt(input: BatchReportInput): string {
  const sheetText = truncate(input.sheetText?.trim() || 'No extra reference data was provided.', 30000)
  const callSections = input.calls
    .map((call, index) => {
      return `Call ${index + 1}: ${call.fileName}

Transcript:
${truncate(call.transcript, 25000)}

Call analysis:
${truncate(call.analysisText || 'No individual analysis available.', 12000)}`
    })
    .join('\n\n---\n\n')

  return `You are a senior sales operations analyst.

Generate a final report from the audio call transcripts and any available business reference data.
Use the reference data as context when it is present and use the transcripts as evidence.
Return a clean markdown report only. Do not wrap it in code fences.

The report must include:
1. Executive summary
2. Employee and call context
3. Business context insights
4. Per-call findings
5. Common objections and customer intent
6. Scorecard table with 0-100 scores
7. Coaching recommendations
8. Follow-up actions
9. Evidence quotes

Batch metadata:
- Employee: ${input.metadata.employeeName}
- Analysis head: ${input.metadata.analysisHead}
- Call scenario: ${input.metadata.callScenario}
- Call date: ${input.metadata.callDate}
- Total audio files: ${input.metadata.totalFiles}
- Notes: ${input.metadata.notes || 'None'}

Reference data:
${sheetText}

Audio call evidence:
${callSections}`
}

function buildAnalysisReportPrompt(input: AnalysisReportInput): string {
  const masterText = truncate(input.masterFileText.trim(), 30000)
  const callSections = input.calls
    .map((call, i) => {
      const mins = call.durationSeconds ? Math.floor(call.durationSeconds / 60) : null
      const secs = call.durationSeconds ? call.durationSeconds % 60 : null
      const duration = mins !== null ? `${mins}:${String(secs).padStart(2, '0')}` : 'unknown'
      return `Call ${i + 1} [ID: ${call.callId}]
Employee: ${call.employeeName}
Date/Time: ${call.callDatetime}
Duration: ${duration}
Scenario: ${call.scenarioName}
Transcript:
${truncate(call.transcript, 20000)}
---`
    })
    .join('\n\n')

  return `You are a senior sales operations analyst. Use the master instructions below as your evaluation standard.
Return a clean markdown report only. Do not wrap it in code fences.

Master instructions:
${masterText}

=== ANALYSIS REQUEST ===
Agent filter: ${input.filters.employeeName}
Date range: ${input.filters.dateFrom} to ${input.filters.dateTo}
Analysis head: ${input.filters.analysisHead}
Call scenario: ${input.filters.callScenario}
Total calls: ${input.calls.length}

The report must include:
1. Executive summary (2-3 sentences on overall performance)
2. Per-call review table (columns: Call # | Employee | Score /100 | Key Strengths | Key Issues | Next Step Pushed?)
3. Common mistakes observed across calls
4. Best practices and strong moments observed
5. Objection handling review (patterns across calls)
6. Overall score and management recommendation
Include brief evidence quotes from transcripts where relevant.

Calls to analyse:
${callSections}`
}

function defaultInstructions(): string {
  return [
    'Evaluate the call for sales quality, customer intent, objection handling, clarity, next steps, and agent coaching.',
    'Keep feedback direct, evidence-based, and useful for improving future calls.',
  ].join(' ')
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength)}\n\n[Content truncated for analysis]`
}
