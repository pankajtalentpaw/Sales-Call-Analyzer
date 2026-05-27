import { prisma } from '@/lib/prisma'
import { uploadToStorage } from '@/lib/storage'
import { analyzeCallTranscript } from '@/lib/gemini'

type PrismaData = Record<string, unknown>

const callUpdateData = (data: PrismaData) =>
  data as Parameters<typeof prisma.call.update>[0]['data']

export async function runCallAnalysis(callId: string, spreadsheetText?: string | null): Promise<void> {
  try {
    await prisma.call.update({
      where: { id: callId },
      data: callUpdateData({ analysis_status: 'processing', analysis_error: null }),
    })

    const call = await prisma.call.findUnique({
      where: { id: callId },
      include: {
        employee: { select: { display_name: true, name: true } },
        analysis_head: { select: { name: true } },
        call_scenario: { select: { name: true } },
      },
    })

    if (!call) throw new Error('Call not found for analysis')
    if (!call.transcript_text) throw new Error('Transcript is not ready for analysis')

    const masterFile = await getActiveMasterFile(call.analysis_head_id)
    const masterInstructions = [
      masterFile?.extracted_text,
      spreadsheetText ? `Uploaded spreadsheet context:\n${spreadsheetText}` : null,
    ].filter(Boolean).join('\n\n')

    const { analysisText, rawJson } = await analyzeCallTranscript({
      transcript: call.transcript_text,
      masterInstructions,
      metadata: {
        employeeName: call.employee.display_name || call.employee.name,
        analysisHead: call.analysis_head.name,
        callScenario: call.call_scenario.name,
        callDate: call.call_datetime.toISOString().split('T')[0],
        fileName: call.file_name,
        notes: call.notes,
      },
    })

    const rawKey = `analysis/raw/${callId}.json`
    const rawAnalysisUrl = await uploadToStorage(rawKey, Buffer.from(rawJson), 'application/json')

    await prisma.call.update({
      where: { id: callId },
      data: callUpdateData({
        analysis_status: 'completed',
        analysis_text: analysisText,
        raw_analysis_json_url: rawAnalysisUrl,
        analysis_error: null,
        analyzed_at: new Date(),
      }),
    })
  } catch (err) {
    console.error(`Analysis failed for call ${callId}:`, err)
    await prisma.call
      .update({
        where: { id: callId },
        data: callUpdateData({
          analysis_status: 'failed',
          analysis_error: err instanceof Error ? err.message : 'Analysis failed',
        }),
      })
      .catch(() => {})
  }
}

async function getActiveMasterFile(analysisHeadId: string) {
  const headSpecific = await prisma.masterFile.findFirst({
    where: {
      is_active: true,
      scope: 'head-specific',
      analysis_head_id: analysisHeadId,
    },
    orderBy: { updated_at: 'desc' },
  })

  if (headSpecific) return headSpecific

  return prisma.masterFile.findFirst({
    where: {
      is_active: true,
      scope: 'global',
    },
    orderBy: { updated_at: 'desc' },
  })
}
