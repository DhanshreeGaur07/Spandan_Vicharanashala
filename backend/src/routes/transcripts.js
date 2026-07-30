import express from 'express'
import Transcript from '../models/Transcript.js'
import Room from '../models/Room.js'
import RoomMember from '../models/RoomMember.js'
import { authenticate } from '../middleware/auth.js'

const router = express.Router()

import { config } from '../config.js'
import { isRedisEnabled, getRedisClient } from '../config/redis.js'

function buildDriftPrompt(segmentText) {
  return `You are an expert educator. Below is a short lecture segment.
Identify the 3 most likely concepts a student could find confusing in this segment.
Return ONLY a JSON array of exactly 3 short strings (max 8 words each).
Each string names a specific concept — not a generic complaint like "too fast"
or "unclear explanation". Name the THING, not the feeling.

SEGMENT:
${segmentText}

Return format (no preamble, no markdown, raw JSON only):
["concept one", "concept two", "concept three"]`
}

async function generateAndCacheDriftOptions(transcriptDoc) {
  if (!transcriptDoc || !transcriptDoc.text || transcriptDoc.text.trim().length === 0) return

  const prompt = buildDriftPrompt(transcriptDoc.text)
  const room = await Room.findById(transcriptDoc.roomId).select('settings').lean()
  let provider = room?.settings?.questionProvider || 'google'

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
          generationConfig: { maxOutputTokens: 500 }
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
          max_tokens: 500
        })
      })
      if (res.ok) {
        const data = await res.json()
        responseText = data.choices?.[0]?.message?.content || ''
      }
    } else if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': config.anthropicApiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 500
        })
      })
      if (res.ok) {
        const data = await res.json()
        responseText = data.content?.[0]?.text || ''
      }
    }
  } catch (err) {
    console.error('[drift] LLM generation error:', err.message)
  }

  let options = []
  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      options = JSON.parse(jsonMatch[0])
    }
  } catch (e) {
    console.error('[drift] JSON parse error:', e.message)
  }

  if (!Array.isArray(options) || options.length !== 3) {
    options = ['The core concept just introduced', 'The relationship between terms', 'The example given']
  }

  transcriptDoc.driftOptions = options
  transcriptDoc.driftOptionsGeneratedAt = new Date()
  await transcriptDoc.save()

  if (isRedisEnabled()) {
    try {
      const client = getRedisClient()
      if (client) {
        await client.set(`drift:opts:${transcriptDoc.roomId}:${transcriptDoc.segmentIndex}`, JSON.stringify(options), { EX: 7200 })
      }
    } catch (e) {
      console.error('[drift] Redis cache error:', e.message)
    }
  }
}

// Create a new transcript entry
router.post('/', authenticate, async (req, res) => {
  try {
    const { roomId, segmentIndex, text, duration, wordCount, source } = req.body

    if (!roomId || segmentIndex === undefined || !text) {
      return res.status(400).json({ error: 'roomId, segmentIndex, and text are required' })
    }

    const transcript = new Transcript({
      roomId,
      segmentIndex,
      source: source === 'paste' ? 'paste' : 'audio',
      teacherId: req.user._id,
      text,
      duration: duration || 0,
      wordCount: wordCount || text.split(/\s+/).length
    })

    await transcript.save()

    res.status(201).json({
      success: true,
      transcript
    })

    // Fire-and-forget — never awaited, never blocks the response
    generateAndCacheDriftOptions(transcript).catch(err =>
      console.error('[drift] pre-gen failed for segment', transcript.segmentIndex, err.message)
    )
  } catch (error) {
    console.error('Failed to save transcript:', error)
    res.status(500).json({ error: 'Failed to save transcript' })
  }
})

// Get all transcripts for a room
router.get('/room/:roomId', authenticate, async (req, res) => {
  try {
    const { roomId } = req.params
    const currentUser = req.user

    // Verify room exists and user has access
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    // Check access: teacher owns room OR student is a member
    const isTeacher = room.teacher.toString() === currentUser._id.toString()
    const isStudentMember = await RoomMember.findOne({ roomId, studentId: currentUser._id })

    if (!isTeacher && !isStudentMember) {
      return res.status(403).json({ error: 'Not authorized to access transcripts for this room' })
    }

    const transcripts = await Transcript.find({ 
      roomId: req.params.roomId 
    }).sort({ segmentIndex: 1 })

    res.json({
      success: true,
      transcripts
    })
  } catch (error) {
    console.error('Failed to fetch transcripts:', error)
    res.status(500).json({ error: 'Failed to fetch transcripts' })
  }
})

// Get transcript by room and segment
router.get('/:roomId/:segmentIndex', authenticate, async (req, res) => {
  try {
    const { roomId, segmentIndex } = req.params
    const currentUser = req.user

    // Verify room exists and user has access
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    // Check access: teacher owns room OR student is a member
    const isTeacher = room.teacher.toString() === currentUser._id.toString()
    const isStudentMember = await RoomMember.findOne({ roomId, studentId: currentUser._id })

    if (!isTeacher && !isStudentMember) {
      return res.status(403).json({ error: 'Not authorized to access this transcript' })
    }

    const transcript = await Transcript.findOne({ 
      roomId: roomId,
      segmentIndex: parseInt(segmentIndex)
    })

    if (!transcript) {
      return res.status(404).json({ error: 'Transcript not found' })
    }

    res.json({
      success: true,
      transcript
    })
  } catch (error) {
    console.error('Failed to fetch transcript:', error)
    res.status(500).json({ error: 'Failed to fetch transcript' })
  }
})

export default router