import { ObjectId } from 'mongodb'
import { calls, masterFiles, toOid, now } from '@/lib/db/collections'
import { getDb } from '@/lib/mongodb'
import { uploadToStorage } from '@/lib/storage'
import { analyzeCallTranscript } from '@/lib/gemini'

export async function runCallAnalysis(callId: string, spreadsheetText?: string | null): Promise<void> {
  const callsCol = await calls()
  const oid = toOid(callId)

  try {
    await callsCol.updateOne(
      { _id: oid },
      { $set: { analysis_status: 'processing', analysis_error: null, updated_at: now() } },
    )

    const call = await callsCol.findOne({ _id: oid })
    if (!call) throw new Error('Call not found for analysis')
    if (!call.transcript_text) throw new Error('Transcript is not ready for analysis')

    const db = await getDb()
    const [employee, analysisHead, callScenario] = await Promise.all([
      db.collection('employees').findOne(
        { _id: call.employee_id },
        { projection: { display_name: 1, name: 1 } },
      ),
      db.collection('analysis_heads').findOne(
        { _id: call.analysis_head_id },
        { projection: { name: 1 } },
      ),
      db.collection('call_scenarios').findOne(
        { _id: call.call_scenario_id },
        { projection: { name: 1 } },
      ),
    ])

    const masterFile = await getActiveMasterFile(call.analysis_head_id)
    const masterInstructions = [
      masterFile?.extracted_text,
      spreadsheetText ? `Uploaded spreadsheet context:\n${spreadsheetText}` : null,
    ]
      .filter(Boolean)
      .join('\n\n')

    const { analysisText, rawJson } = await analyzeCallTranscript({
      transcript: call.transcript_text,
      masterInstructions,
      metadata: {
        employeeName:
          (employee as { display_name?: string; name?: string } | null)?.display_name ||
          (employee as { name?: string } | null)?.name ||
          'Unknown',
        analysisHead: (analysisHead as { name?: string } | null)?.name || 'Unknown',
        callScenario: (callScenario as { name?: string } | null)?.name || 'Unknown',
        callDate: call.call_datetime.toISOString().split('T')[0],
        fileName: call.file_name,
        notes: call.notes,
      },
    })

    const rawKey = `analysis/raw/${callId}.json`
    const rawAnalysisUrl = await uploadToStorage(rawKey, Buffer.from(rawJson), 'application/json')

    await callsCol.updateOne(
      { _id: oid },
      {
        $set: {
          analysis_status: 'completed',
          analysis_text: analysisText,
          raw_analysis_json_url: rawAnalysisUrl,
          analysis_error: null,
          analyzed_at: now(),
          updated_at: now(),
        },
      },
    )
  } catch (err) {
    console.error(`Analysis failed for call ${callId}:`, err)
    await callsCol
      .updateOne(
        { _id: oid },
        {
          $set: {
            analysis_status: 'failed',
            analysis_error: err instanceof Error ? err.message : 'Analysis failed',
            updated_at: now(),
          },
        },
      )
      .catch(() => {})
  }
}

async function getActiveMasterFile(analysisHeadId: ObjectId) {
  const col = await masterFiles()

  const headSpecific = await col.findOne(
    { is_active: true, scope: 'head-specific', analysis_head_id: analysisHeadId },
    { sort: { updated_at: -1 } },
  )
  if (headSpecific) return headSpecific

  return col.findOne({ is_active: true, scope: 'global' }, { sort: { updated_at: -1 } })
}
