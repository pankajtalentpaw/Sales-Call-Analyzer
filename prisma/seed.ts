import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Employees — created only if none exist yet
  const count = await prisma.employee.count()
  if (count === 0) {
    await prisma.employee.createMany({
      data: [
        { name: 'Uttam', display_name: 'Uttam', default_language: 'Hindi' },
        { name: 'Unnati', display_name: 'Unnati', default_language: 'Gujarati' },
        { name: 'Bruto', display_name: 'Bruto', default_language: 'Mixed' },
      ],
    })
  }

  // Analysis Heads
  const cfoYantra = await prisma.analysisHead.upsert({
    where: { name: 'CFO Yantra' },
    update: {},
    create: { name: 'CFO Yantra', description: 'Virtual CFO offering' },
  })

  const aiCourse = await prisma.analysisHead.upsert({
    where: { name: 'AI Course' },
    update: {},
    create: { name: 'AI Course', description: 'AI course leads and inquiries' },
  })

  const marketing = await prisma.analysisHead.upsert({
    where: { name: 'Marketing Packages' },
    update: {},
    create: { name: 'Marketing Packages', description: 'Marketing and agency packages' },
  })

  // Call Scenarios — upsert using the (analysis_head_id, name) unique constraint
  const scenarios = [
    { analysis_head_id: cfoYantra.id, name: 'Pre-Webinar Call', description: 'Calling to get the lead to attend webinar' },
    { analysis_head_id: cfoYantra.id, name: 'Post-Webinar Call', description: 'Calling after webinar to sell/enrol' },
    { analysis_head_id: cfoYantra.id, name: 'Feedback Call', description: 'Calling to collect feedback or revive interest' },
    { analysis_head_id: cfoYantra.id, name: 'Offer Call', description: 'Calling to explain limited-period offer or closing push' },
    { analysis_head_id: aiCourse.id, name: 'Exit Page Dropout', description: 'Lead reached checkout but dropped off' },
    { analysis_head_id: aiCourse.id, name: 'Chat Inquiry', description: 'Lead came through chat or inquiry form' },
    { analysis_head_id: aiCourse.id, name: 'Payment Follow-Up', description: 'Lead showed buying intent but payment is pending' },
    { analysis_head_id: marketing.id, name: 'Discovery Call', description: 'Initial needs-understanding call' },
    { analysis_head_id: marketing.id, name: 'Proposal Follow-Up', description: 'Follow-up after proposal or quote sent' },
  ]

  for (const s of scenarios) {
    await prisma.callScenario.upsert({
      where: { analysis_head_id_name: { analysis_head_id: s.analysis_head_id, name: s.name } },
      update: {},
      create: s,
    })
  }

  console.log('Seed complete.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
