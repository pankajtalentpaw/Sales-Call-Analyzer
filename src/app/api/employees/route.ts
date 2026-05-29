import { NextResponse } from 'next/server'
import { employees, idToString } from '@/lib/db/collections'

export async function GET() {
  try {
    const col = await employees()
    const docs = await col
      .find({ status: 'active' }, { projection: { _id: 1, display_name: 1 } })
      .sort({ display_name: 1 })
      .toArray()

    return NextResponse.json(docs.map((d) => ({ id: idToString(d._id), display_name: d.display_name })))
  } catch {
    return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 })
  }
}
