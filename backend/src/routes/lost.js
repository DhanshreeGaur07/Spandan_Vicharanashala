import express from 'express'
import Room from '../models/Room.js'
import Transcript from '../models/Transcript.js'
import DriftResponse from '../models/DriftResponse.js'
import RoomMember from '../models/RoomMember.js'
import { authenticate } from '../middleware/auth.js'
import { config } from '../config.js'

const router = express.Router()

router.use(authenticate)

// Helper to call LLM for a verification question based on lecture transcript
async function generateVerificationQuestion(transcriptText, preferredProvider = 'google') {
  if (!transcriptText || transcriptText.trim().length < 20) {
    return {
      question: 'Which best describes the topic currently being discussed in class?',
      options: [
        { text: 'The core concept introduced in this lecture', isCorrect: true },
        { text: 'An unrelated topic from a previous module', isCorrect: false },
        { text: 'Admin details', isCorrect: false },
        { text: 'Off-topic discussion', isCorrect: false }
      ],
      correctAnswerIndex: 0
    }
  }

  const prompt = `You are an attention-check quiz generator. Below is a lecture transcript segment.
Create EXACTLY ONE simple multiple-choice question (MCQ) testing if the student was listening to this specific segment.
Return ONLY valid JSON matching this exact structure:
{
  "question": "Question text testing listening attention",
  "options": ["Option A (correct)", "Option B", "Option C", "Option D"],
  "correctAnswerIndex": 0
}

TRANSCRIPT:
${transcriptText.slice(-1500)}

Raw JSON output only (no markdown, no code blocks):`

  let provider = preferredProvider
  if (provider === 'google' && !config.googleApiKey) provider = 'openai'
  if (provider === 'openai' && !config.openaiApiKey) provider = 'anthropic'
  if (provider === 'anthropic' && !config.anthropicApiKey) provider = 'mock'
  if (!config.googleApiKey && !config.openaiApiKey && !config.anthropicApiKey) provider = 'mock'

  let responseText = ''
  try {
    if (provider === 'google') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.googleApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 400 }
        })
      })
      if (res.ok) {
        const data = await res.json()
        responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      }
    } else if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiApiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 400
        })
      })
      if (res.ok) {
        const data = await res.json()
        responseText = data.choices?.[0]?.message?.content || ''
      }
    }
  } catch (err) {
    console.error('[lost] LLM verification question generation error:', err.message)
  }

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (parsed.question && Array.isArray(parsed.options) && parsed.options.length >= 2) {
        return {
          question: parsed.question,
          options: parsed.options.map((opt, idx) => ({
            text: typeof opt === 'string' ? opt : opt.text,
            isCorrect: idx === (parsed.correctAnswerIndex ?? 0)
          })),
          correctAnswerIndex: parsed.correctAnswerIndex ?? 0
        }
      }
    }
  } catch (e) {
    console.error('[lost] JSON parse failed:', e.message)
  }

  // Fallback question
  return {
    question: 'What was the main focus of the last segment explained by the instructor?',
    options: [
      { text: 'The core mechanism described in the transcript', isCorrect: true },
      { text: 'Historical background', isCorrect: false },
      { text: 'Future exam dates', isCorrect: false },
      { text: 'Course prerequisites', isCorrect: false }
    ],
    correctAnswerIndex: 0
  }
}

// POST /api/lost/request - Student triggers "I'm Lost", gets verification question
router.post('/request', async (req, res) => {
  try {
    const { roomId } = req.body
    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' })
    }

    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    // Get recent transcripts for room
    const transcripts = await Transcript.find({ roomId }).sort({ segmentIndex: -1 }).limit(3).lean()
    const combinedText = transcripts.reverse().map(t => t.text).join(' ')
    const latestSegmentIndex = transcripts.length > 0 ? transcripts[transcripts.length - 1].segmentIndex : 0
    const driftOptions = transcripts.length > 0 && transcripts[transcripts.length - 1].driftOptions?.length > 0
      ? transcripts[transcripts.length - 1].driftOptions
      : ['The core concept introduced', 'The step-by-step logic', 'The practical example']

    const verificationQuiz = await generateVerificationQuestion(combinedText, room.settings?.questionProvider)

    res.json({
      success: true,
      segmentIndex: latestSegmentIndex,
      verificationQuiz,
      confusionOptions: driftOptions
    })
  } catch (error) {
    console.error('Error generating lost verification request:', error)
    res.status(500).json({ error: 'Failed to process request' })
  }
})

// POST /api/lost/verify - Student submits verification answer
router.post('/verify', async (req, res) => {
  try {
    const { roomId, segmentIndex, selectedOption, correctAnswerIndex, conceptSelected } = req.body
    const studentId = req.user._id

    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' })
    }

    // Check if verification question answer is correct
    const passedVerification = selectedOption === correctAnswerIndex

    if (!passedVerification) {
      return res.json({
        success: true,
        verified: false,
        message: 'Presence check failed. You answered the lecture attention question incorrectly. Please pay closer attention to the live class!'
      })
    }

    // Student passed presence check -> Accept lost request & record drift response
    await DriftResponse.findOneAndUpdate(
      { roomId, studentId, segmentIndex: segmentIndex ?? 0 },
      {
        roomId,
        studentId,
        segmentIndex: segmentIndex ?? 0,
        selectedOption: conceptSelected || 'General Lecture Confusion',
        dismissed: false,
        timestamp: new Date()
      },
      { upsert: true, new: true }
    )

    // Compute live stats for room
    const room = await Room.findById(roomId).select('code').lean()
    const memberCount = await RoomMember.countDocuments({ roomId })
    const lostResponses = await DriftResponse.find({ roomId, dismissed: false }).lean()
    const lostStudentIds = new Set(lostResponses.map(r => r.studentId.toString()))
    const lostCount = lostStudentIds.size
    const totalJoined = Math.max(memberCount, lostCount, 1)
    const understoodCount = Math.max(0, totalJoined - lostCount)

    const lostPct = totalJoined > 0 ? Math.round((lostCount / totalJoined) * 100) : 0
    const understoodPct = Math.max(0, 100 - lostPct)

    // Top confusion concepts
    const conceptCounts = {}
    lostResponses.forEach(r => {
      if (r.selectedOption) {
        conceptCounts[r.selectedOption] = (conceptCounts[r.selectedOption] || 0) + 1
      }
    })

    const topConcepts = Object.entries(conceptCounts)
      .map(([concept, count]) => ({ concept, count }))
      .sort((a, b) => b.count - a.count)

    const statsPayload = {
      roomId,
      totalJoined,
      lostCount,
      understoodCount,
      lostPct,
      understoodPct,
      topConcepts
    }

    // Emit live update via Socket.IO
    if (room?.code) {
      const io = req.app.get('io')
      if (io) {
        io.to(room.code).emit('lost:updated', statsPayload)
      }
    }

    res.json({
      success: true,
      verified: true,
      message: 'Lost request verified! Your teacher has been notified of your confusion point.',
      stats: statsPayload
    })
  } catch (error) {
    console.error('Error verifying lost request:', error)
    res.status(500).json({ error: 'Failed to verify request' })
  }
})

// GET /api/lost/stats/:roomId - Teacher retrieves live lost stats
router.get('/stats/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params

    const totalJoined = await RoomMember.countDocuments({ roomId })
    const lostResponses = await DriftResponse.find({ roomId, dismissed: false }).lean()
    const lostStudentIds = new Set(lostResponses.map(r => r.studentId.toString()))
    const lostCount = lostStudentIds.size
    const understoodCount = Math.max(0, totalJoined - lostCount)

    const lostPct = totalJoined > 0 ? Math.round((lostCount / totalJoined) * 100) : 0
    const understoodPct = totalJoined > 0 ? Math.round((understoodCount / totalJoined) * 100) : 100

    const conceptCounts = {}
    lostResponses.forEach(r => {
      if (r.selectedOption) {
        conceptCounts[r.selectedOption] = (conceptCounts[r.selectedOption] || 0) + 1
      }
    })

    const topConcepts = Object.entries(conceptCounts)
      .map(([concept, count]) => ({ concept, count }))
      .sort((a, b) => b.count - a.count)

    res.json({
      success: true,
      stats: {
        roomId,
        totalJoined,
        lostCount,
        understoodCount,
        lostPct,
        understoodPct,
        topConcepts
      }
    })
  } catch (error) {
    console.error('Error fetching lost stats:', error)
    res.status(500).json({ error: 'Failed to fetch lost stats' })
  }
})

export default router
