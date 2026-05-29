import { NextResponse } from 'next/server'
import { analysisHeads, idToString } from '@/lib/db/collections'

export async function GET() {
  try {
    const col = await analysisHeads()
    const docs = await col
      .find({ status: 'active' }, { projection: { _id: 1, name: 1 } })
      .sort({ name: 1 })
      .toArray()

    return NextResponse.json(docs.map((d) => ({ id: idToString(d._id), name: d.name })))
  } catch (error) {
    console.error('Failed to fetch analysis heads:', error)
    return NextResponse.json({ error: 'Failed to fetch analysis heads' }, { status: 500 })
  }
}
