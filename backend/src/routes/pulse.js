import express from 'express'
import { authenticate, authorize } from '../middleware/auth.js'
import Room from '../models/Room.js'
import PulseSnapshot from '../models/PulseSnapshot.js'

const router = express.Router()

// GET /api/pulse/:roomId - Get pulse history for a room
router.get('/:roomId', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { roomId } = req.params

    // Verify teacher owns the room
    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }
    if (room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to view this room' })
    }

    const { from, to } = req.query
    const query = { roomId }

    if (from || to) {
      query.timestamp = {}
      if (from) query.timestamp.$gte = new Date(from)
      if (to) query.timestamp.$lte = new Date(to)
    } else {
      // Default to last 90 minutes if no range provided
      const ninetyMinsAgo = new Date(Date.now() - 90 * 60 * 1000)
      query.timestamp = { $gte: ninetyMinsAgo }
    }

    const snapshots = await PulseSnapshot.find(query)
      .select('timestamp value holding total -_id')
      .sort({ timestamp: 1 })
      .lean()

    res.json({ success: true, snapshots })
  } catch (error) {
    console.error('Error fetching pulse history:', error)
    res.status(500).json({ error: 'Failed to fetch pulse history' })
  }
})

export default router
