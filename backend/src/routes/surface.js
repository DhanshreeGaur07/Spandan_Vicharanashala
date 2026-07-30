import express from 'express'
import SurfaceReport from '../models/SurfaceReport.js'
import Room from '../models/Room.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { generateSurface } from '../services/surfaceService.js'

const router = express.Router()

// GET /api/surface/:roomId - Teacher retrieves Surface post-session report
router.get('/:roomId', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { roomId } = req.params
    const room = await Room.findById(roomId)

    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    if (room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to view surface report for this room' })
    }

    let report = await SurfaceReport.findOne({ roomId })

    if (!report) {
      // Auto-generate report on demand if not yet generated
      report = await generateSurface(roomId)
    }

    return res.json({
      success: true,
      markdown: report.markdown,
      generatedAt: report.generatedAt,
      regenerationCount: report.regenerationCount || 0
    })
  } catch (error) {
    console.error('Error fetching surface report:', error)
    res.status(500).json({ error: 'Failed to fetch surface report' })
  }
})

// POST /api/surface/:roomId/regenerate - Teacher requests regeneration of Surface report
router.post('/:roomId/regenerate', authenticate, authorize('teacher'), async (req, res) => {
  try {
    const { roomId } = req.params
    const room = await Room.findById(roomId)

    if (!room) {
      return res.status(404).json({ error: 'Room not found' })
    }

    if (room.teacher.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to regenerate report for this room' })
    }

    const existingReport = await SurfaceReport.findOne({ roomId })
    const currentRegenCount = existingReport ? (existingReport.regenerationCount || 0) : 0

    if (currentRegenCount >= 3) {
      return res.status(429).json({
        error: 'Maximum regeneration limit reached',
        message: 'You can only regenerate the report up to 3 times per room'
      })
    }

    // Regenerate report
    const newReportDoc = await generateSurface(roomId)

    // Increment regenerationCount
    newReportDoc.regenerationCount = currentRegenCount + 1
    await newReportDoc.save()

    res.json({
      success: true,
      markdown: newReportDoc.markdown,
      generatedAt: newReportDoc.generatedAt,
      regenerationCount: newReportDoc.regenerationCount
    })
  } catch (error) {
    console.error('Error regenerating surface report:', error)
    res.status(500).json({ error: 'Failed to regenerate surface report' })
  }
})

export default router
