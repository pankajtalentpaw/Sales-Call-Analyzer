const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1'
const MODEL_ID = 'scribe_v1'

interface ElevenLabsWord {
  text: string
  type: 'word' | 'spacing' | 'audio_event'
  start?: number
  end?: number
  speaker_id?: string | null
}

interface ElevenLabsTranscriptResponse {
  language_code?: string | null
  language_probability?: number | null
  text?: string | null
  words?: ElevenLabsWord[] | null
  error?: string
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<{
  transcript: string
  rawJson: string
  durationSeconds: number | null
  languageDetected: string | null
  speakerCount: number | null
}> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY environment variable is not set')

  const formData = new FormData()
  formData.append('file', new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), fileName)
  formData.append('model_id', MODEL_ID)
  formData.append('diarize', 'true')
  formData.append('tag_audio_events', 'false')

  const response = await fetch(`${ELEVENLABS_BASE_URL}/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: formData,
  })

  const text = await response.text()
  const data = text.trim() ? (JSON.parse(text) as ElevenLabsTranscriptResponse) : null

  if (!response.ok || !data) {
    throw new Error(`ElevenLabs transcription failed: ${data?.error ?? response.statusText}`)
  }

  return {
    transcript: buildTranscript(data),
    rawJson: JSON.stringify(data),
    durationSeconds: getDurationSeconds(data),
    languageDetected: data.language_code ?? null,
    speakerCount: countSpeakers(data),
  }
}

function buildTranscript(data: ElevenLabsTranscriptResponse): string {
  const words = (data.words ?? []).filter((w) => w.type === 'word')
  if (words.length === 0) return data.text ?? ''

  const speakerMap = new Map<string, string>()
  let speakerIdx = 0
  const lines: string[] = []
  let currentSpeaker: string | null = null
  let currentWords: string[] = []

  for (const word of words) {
    const rawSpeaker = word.speaker_id ?? 'unknown'

    if (!speakerMap.has(rawSpeaker)) {
      speakerIdx++
      speakerMap.set(rawSpeaker, speakerIdx === 1 ? 'Agent' : 'Prospect')
    }

    const label = speakerMap.get(rawSpeaker)!

    if (label !== currentSpeaker) {
      if (currentSpeaker !== null && currentWords.length > 0) {
        lines.push(`${currentSpeaker}: ${currentWords.join(' ')}`)
      }
      currentSpeaker = label
      currentWords = [word.text]
    } else {
      currentWords.push(word.text)
    }
  }

  if (currentSpeaker !== null && currentWords.length > 0) {
    lines.push(`${currentSpeaker}: ${currentWords.join(' ')}`)
  }

  return lines.join('\n')
}

function getDurationSeconds(data: ElevenLabsTranscriptResponse): number | null {
  const words = data.words ?? []
  const lastWord = [...words].reverse().find((w) => typeof w.end === 'number')
  if (lastWord?.end !== undefined && lastWord.end !== null) return Math.round(lastWord.end)
  return null
}

function countSpeakers(data: ElevenLabsTranscriptResponse): number | null {
  const speakers = new Set(
    (data.words ?? [])
      .filter((w) => w.type === 'word' && w.speaker_id)
      .map((w) => w.speaker_id!),
  )
  return speakers.size > 0 ? speakers.size : null
}
