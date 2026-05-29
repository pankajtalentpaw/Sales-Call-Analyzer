import { MongoClient, ObjectId } from 'mongodb'

const uri = process.env.DATABASE_URL
if (!uri) throw new Error('DATABASE_URL environment variable is not set')

async function main() {
  const client = new MongoClient(uri!)
  await client.connect()
  const db = client.db()

  // Create unique indexes
  await db.collection('admins').createIndex({ email_id: 1 }, { unique: true })
  await db.collection('employees').createIndexes([
    { key: { employee_code: 1 }, unique: true, sparse: true },
    { key: { email: 1 }, unique: true, sparse: true },
  ])
  await db.collection('analysis_heads').createIndex({ name: 1 }, { unique: true })
  await db.collection('call_scenarios').createIndex(
    { analysis_head_id: 1, name: 1 },
    { unique: true },
  )

  const employeesCol = db.collection('employees')
  const headsCol = db.collection('analysis_heads')
  const scenariosCol = db.collection('call_scenarios')

  // Employees — only if none exist
  const count = await employeesCol.countDocuments()
  if (count === 0) {
    const t = new Date()
    await employeesCol.insertMany([
      { _id: new ObjectId(), name: 'Uttam', display_name: 'Uttam', default_language: 'Hindi', status: 'active', created_at: t, updated_at: t },
      { _id: new ObjectId(), name: 'Unnati', display_name: 'Unnati', default_language: 'Gujarati', status: 'active', created_at: t, updated_at: t },
      { _id: new ObjectId(), name: 'Bruto', display_name: 'Bruto', default_language: 'Mixed', status: 'active', created_at: t, updated_at: t },
    ])
    console.log('Seeded employees.')
  }

  // Analysis Heads — upsert by name
  async function upsertHead(name: string, description: string) {
    const t = new Date()
    const existing = await headsCol.findOne({ name })
    if (existing) return existing._id as ObjectId
    const oid = new ObjectId()
    await headsCol.insertOne({ _id: oid, name, description, status: 'active', created_at: t, updated_at: t })
    return oid
  }

  const cfoYantraId = await upsertHead('CFO Yantra', 'Virtual CFO offering')
  const aiCourseId  = await upsertHead('AI Course', 'AI course leads and inquiries')
  const marketingId = await upsertHead('Marketing Packages', 'Marketing and agency packages')

  // Call Scenarios — upsert by (analysis_head_id, name)
  const scenarios = [
    { analysis_head_id: cfoYantraId, name: 'Pre-Webinar Call',   description: 'Calling to get the lead to attend webinar' },
    { analysis_head_id: cfoYantraId, name: 'Post-Webinar Call',  description: 'Calling after webinar to sell/enrol' },
    { analysis_head_id: cfoYantraId, name: 'Feedback Call',      description: 'Calling to collect feedback or revive interest' },
    { analysis_head_id: cfoYantraId, name: 'Offer Call',         description: 'Calling to explain limited-period offer or closing push' },
    { analysis_head_id: aiCourseId,  name: 'Exit Page Dropout',  description: 'Lead reached checkout but dropped off' },
    { analysis_head_id: aiCourseId,  name: 'Chat Inquiry',       description: 'Lead came through chat or inquiry form' },
    { analysis_head_id: aiCourseId,  name: 'Payment Follow-Up',  description: 'Lead showed buying intent but payment is pending' },
    { analysis_head_id: marketingId, name: 'Discovery Call',     description: 'Initial needs-understanding call' },
    { analysis_head_id: marketingId, name: 'Proposal Follow-Up', description: 'Follow-up after proposal or quote sent' },
  ]

  for (const s of scenarios) {
    const exists = await scenariosCol.findOne({ analysis_head_id: s.analysis_head_id, name: s.name })
    if (!exists) {
      const t = new Date()
      await scenariosCol.insertOne({
        _id: new ObjectId(),
        analysis_head_id: s.analysis_head_id,
        name: s.name,
        description: s.description,
        status: 'active',
        created_at: t,
        updated_at: t,
      })
    }
  }

  console.log('Seed complete.')
  await client.close()
}

main().catch((e) => { console.error(e); process.exit(1) })
