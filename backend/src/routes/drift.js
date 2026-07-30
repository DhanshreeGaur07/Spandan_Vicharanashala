import express from 'express'
import DriftResponse from '../models/DriftResponse.js'
import Room from '../models/Room.js'
import { authenticate, authorize } from '../middleware/auth.js'

const router = express.Router()

// POST /api/drift/respond - Student responds to a Drift prompt or dismisses it
router.post('/respond', authenticate, async (req, res) => {
  try {
    const { roomId, segmentIndex, selectedOption, dismissed } = req.body
    const studentId = req.user._id

    if (!roomId || segmentIndex === undefined) {
      return res.status(400).json({ error: 'roomId and segmentIndex are required' })
    }

    // Upsert DriftResponse for (roomId, studentId, segmentIndex)
    await DriftResponse.findOneAndUpdate(
      { roomId, studentId, segmentIndex },
      {
        roomId,
        studentId,
        segmentIndex,
        selectedOption: selectedOption || null,
        dismissed: !!dismissed,
        timestamp: new Date()
      },
      { upsert: true, new: true }
    )

    res.json({ success: true })

    // Fire-and-forget socket emit of live drift summary
    try {
      const room = await Room.findById(roomId).select('code').lean()
      if (room?.code) {
        const responses = await DriftResponse.find({ roomId, segmentIndex }).lean()
        const validResponses = responses.filter(r => !r.dismissed && r.selectedOption)
        
        const counts = {}
        validResponses.forEach(r => {
          counts[r.selectedOption] = (counts[r.selectedOption] || 0) + 1
        })

        let topConcept = null
        let topConceptCount = 0
        Object.entries(counts).forEach(([opt, count]) => {
          if (count > topConceptCount) {
            topConcept = opt
            topConceptCount = count
          }
        })

        const io = req.app.get('io')
        if (io && topConcept) {
          io.to(room.code).emit('drift:updated', {
            segmentIndex,
            topConcept,
            topConceptCount,
            totalResponded: validResponses.length
          })
        }
      }
    } catch (e) {
      console.error('[drift] live update emit failed:', e.message)
    }
  } catch (error) {
    console.error('Error recording drift response:', error)
    res.status(500).json({ error: 'Failed to record response' })
  }
})

// GET /api/drift/room/:roomId - Teacher fetches drift summary per segment
router.get('/room/:roomId', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { roomId } = req.params
    const room = await Room.findById(roomId)

    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    if (room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to view drift data for this room' })
    }

    const driftResponses = await DriftResponse.find({ roomId }).lean()

    // Group by segmentIndex
    const segmentsMap = new Map()
    driftResponses.forEach(dr => {
      const idx = dr.segmentIndex
      if (!segmentsMap.has(idx)) {
        segmentsMap.set(idx, { total: 0, responded: 0, dismissed: 0, counts: {} })
      }
      const item = segmentsMap.get(idx)
      item.total++
      if (dr.dismissed) {
        item.dismissed++
      } else if (dr.selectedOption) {
        item.responded++
        item.counts[dr.selectedOption] = (item.counts[dr.selectedOption] || 0) + 1
      }
    })

    const bySegment = Array.from(segmentsMap.entries()).map(([segmentIndex, data]) => {
      const options = Object.entries(data.counts)
        .map(([text, count]) => ({ text, count }))
        .sort((a, b) => b.count - a.count)

      return {
        segmentIndex,
        total: data.total,
        responded: data.responded,
        dismissed: data.dismissed,
        options
      }
    }).sort((a, b) => a.segmentIndex - b.segmentIndex)

    res.json({
      success: true,
      bySegment
    })
  } catch (error) {
    console.error('Error fetching drift data:', error)
    res.status(500).json({ error: 'Failed to fetch drift data' })
  }
})

export default router
