import Room from '../models/Room.js'
import Transcript from '../models/Transcript.js'
import Question from '../models/Question.js'
import Response from '../models/Response.js'
import PulseSnapshot from '../models/PulseSnapshot.js'
import DriftResponse from '../models/DriftResponse.js'
import SurfaceReport from '../models/SurfaceReport.js'
import { config } from '../config.js'

function buildInputSummary({ room, transcripts, questions, responses, pulseSnapshots, driftResponses }) {
  const endedAt = room.endedAt ? new Date(room.endedAt) : new Date()
  const createdAt = room.createdAt ? new Date(room.createdAt) : new Date()
  const durationMinutes = Math.max(1, Math.round((endedAt - createdAt) / 60000))
  
  const studentIds = new Set(responses.map(r => String(r.studentId)))
  const studentCount = Math.max(studentIds.size, room.stats?.totalStudents || 0)

  const avgPulse = pulseSnapshots.length > 0
    ? Math.round(pulseSnapshots.reduce((sum, p) => sum + (p.value || 0), 0) / pulseSnapshots.length)
    : 75

  const pulseDrops = pulseSnapshots
    .filter(p => p.value < 60)
    .map(p => ({
      at: p.timestamp,
      value: p.value,
      minuteIntoSession: Math.max(0, Math.round((new Date(p.timestamp) - createdAt) / 60000))
    }))

  // Group drift / lost responses by segmentIndex
  const driftBySegmentMap = new Map()
  const lostStudentSet = new Set()

  driftResponses.forEach(dr => {
    const segIdx = dr.segmentIndex
    if (!dr.dismissed) {
      lostStudentSet.add(String(dr.studentId))
    }
    if (!driftBySegmentMap.has(segIdx)) {
      driftBySegmentMap.set(segIdx, { optionsCount: {}, totalResponded: 0, dismissed: 0 })
    }
    const entry = driftBySegmentMap.get(segIdx)
    if (dr.dismissed) {
      entry.dismissed++
    } else if (dr.selectedOption) {
      entry.totalResponded++
      entry.optionsCount[dr.selectedOption] = (entry.optionsCount[dr.selectedOption] || 0) + 1
    }
  })

  const lostCount = lostStudentSet.size
  const lostPercentage = studentCount > 0 ? Math.round((lostCount / studentCount) * 100) : 0
  const understoodPercentage = Math.max(0, 100 - lostPercentage)

  const driftBySegment = []
  driftBySegmentMap.forEach((data, segIdx) => {
    const transcriptDoc = transcripts.find(t => t.segmentIndex === segIdx)
    const options = Object.entries(data.optionsCount)
      .map(([text, count]) => ({ text, count }))
      .sort((a, b) => b.count - a.count)

    driftBySegment.push({
      segmentIndex: segIdx,
      segmentText: transcriptDoc?.text ? transcriptDoc.text.slice(0, 200) : '',
      options,
      totalResponded: data.totalResponded,
      dismissed: data.dismissed
    })
  })

  // Question results
  const questionResults = questions.map(q => {
    const qResponses = responses.filter(r => String(r.question || r.questionId) === String(q._id))
    const totalAnswered = qResponses.length
    const correctCount = qResponses.filter(r => r.isCorrect).length
    const correctPct = totalAnswered > 0 ? Math.round((correctCount / totalAnswered) * 100) : 0

    return {
      question: q.question,
      type: q.type,
      correctCount,
      totalAnswered,
      correctPct
    }
  })

  const overallAccuracy = questionResults.length > 0
    ? Math.round(questionResults.reduce((sum, q) => sum + q.correctPct, 0) / questionResults.length)
    : 70

  // Productivity Score = weighted combo of accuracy, understanding %, and pulse
  const productivityScore = Math.max(10, Math.min(100, Math.round(
    (overallAccuracy * 0.4) + (understoodPercentage * 0.4) + (avgPulse * 0.2)
  )))

  // Topics for revision: questions with <60% accuracy + top lost concept names
  const lowAccuracyTopics = questionResults.filter(q => q.correctPct < 60).map(q => q.question)
  const flaggedConcepts = driftBySegment.flatMap(d => d.options.map(o => o.text))
  const topicsForRevision = Array.from(new Set([...lowAccuracyTopics, ...flaggedConcepts]))

  return {
    roomName: room.name,
    teacherName: room.teacher?.name || 'Teacher',
    date: endedAt.toISOString(),
    durationMinutes,
    studentCount,
    lostCount,
    lostPercentage,
    understoodPercentage,
    productivityScore,
    overallAccuracy,
    avgPulse,
    pulseDrops,
    driftBySegment,
    questionResults,
    topicsForRevision
  }
}

function buildSurfacePrompt(inputSummary) {
  return `You are an expert educational analyst. A live lecture session just ended.
Below is structured session data including student comprehension, "I'm Lost" presence checks, and poll performance.
Write a plain-English post-session report for the teacher. Be specific, direct, and concise.

The report MUST have exactly these sections, in this order:
1. SESSION OVERVIEW (2 sentences: topic covered, overall productivity score out of 100%, and general engagement)
2. STUDENT COMPREHENSION & LOST ANALYSIS (State exact number and % of students who got lost, exact segment/time where they lost track, and why)
3. OVERALL CLASS PRODUCTIVITY (Explain the ${inputSummary.productivityScore}% productivity rating based on poll accuracy and engagement)
4. TOPICS FOR REVISION (Bullet list of specific concepts and questions to review in the next class based on poll failures and lost signals)
5. SUGGESTED RE-ENTRY POINT (1-2 sentences: exact concept, segment, and action for the start of the next class)

SESSION DATA:
${JSON.stringify(inputSummary, null, 2)}

Output only the report in clean markdown format (## for section titles). Keep under 400 words.`
}

async function callLLMForSurface(prompt, preferredProvider = 'google') {
  // Check available provider
  let provider = preferredProvider
  if (provider === 'google' && !config.googleApiKey) provider = 'openai'
  if (provider === 'openai' && !config.openaiApiKey) provider = 'anthropic'
  if (provider === 'anthropic' && !config.anthropicApiKey) provider = 'mock'
  if (!config.googleApiKey && !config.openaiApiKey && !config.anthropicApiKey) provider = 'mock'

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000
      })
    })
    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`)
    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  }

  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.anthropicApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1000
      })
    })
    if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`)
    const data = await res.json()
    return data.content?.[0]?.text || ''
  }

  if (provider === 'google') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.googleApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1000 }
      })
    })
    if (!res.ok) throw new Error(`Google API error: ${res.status}`)
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }

  // Fallback mock report
  return `## 1. SESSION OVERVIEW
The session covered core lecture concepts with overall student engagement. Student performance showed solid grasp on foundational topics with targeted areas for improvement.

## 2. PULSE TIMELINE
Average understanding was ${inputSummary.avgPulse || 75}%. Understanding dipped around minute ${inputSummary.pulseDrops?.[0]?.minuteIntoSession || 12} when new concepts were introduced, but recovered afterwards.

## 3. WHAT STUDENTS FLAGGED
${inputSummary.driftBySegment?.length > 0 
  ? inputSummary.driftBySegment.flatMap(d => d.options.map(o => `• "${o.text}" — ${o.count} students`)).join('\n')
  : '• No Drift responses recorded'}

## 4. QUESTIONS THAT WORKED
${inputSummary.questionResults?.filter(q => q.correctPct >= 70).map(q => `• "${q.question}" — ${q.correctPct}% correct (strong grasp)`).join('\n') || '• No questions scored above 70%'}

## 5. QUESTIONS THAT NEED REVISITING
${inputSummary.questionResults?.filter(q => q.correctPct < 60).map(q => `• "${q.question}" — ${q.correctPct}% correct (needs review)`).join('\n') || '• None — all questions scored above 60%'}

## 6. SUGGESTED RE-ENTRY POINT
Start next class by re-explaining the key concept from segment 1 using a concrete step-by-step example before moving to new material.`
}

export async function generateSurface(roomId) {
  // 1. Gather all data in parallel
  const [room, transcripts, questions, responses, pulseSnapshots, driftResponses] =
    await Promise.all([
      Room.findById(roomId).populate('teacher', 'name').lean(),
      Transcript.find({ roomId }).sort({ segmentIndex: 1 }).lean(),
      Question.find({ roomId, status: 'approved' }).lean(),
      Response.find({ roomId }).lean(),
      PulseSnapshot.find({ roomId }).sort({ timestamp: 1 }).lean(),
      DriftResponse.find({ roomId }).lean()
    ])

  if (!room) {
    throw new Error('Room not found')
  }

  // 2. Build structured summary
  const inputSummary = buildInputSummary({
    room, transcripts, questions, responses, pulseSnapshots, driftResponses
  })

  // 3. Generate markdown from LLM
  const prompt = buildSurfacePrompt(inputSummary)
  const markdown = await callLLMForSurface(prompt, room.settings?.questionProvider)

  // 4. Upsert report (preserve existing regenerationCount)
  const existing = await SurfaceReport.findOne({ roomId })
  const regenerationCount = existing ? existing.regenerationCount : 0

  const report = await SurfaceReport.findOneAndUpdate(
    { roomId },
    { roomId, generatedAt: new Date(), markdown, inputSummary, regenerationCount },
    { upsert: true, new: true }
  )

  return report
}
