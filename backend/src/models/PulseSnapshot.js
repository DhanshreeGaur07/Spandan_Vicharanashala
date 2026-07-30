import mongoose from 'mongoose'

const pulseSnapshotSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    expires: 7 * 24 * 60 * 60 // 7 days TTL
  },
  value: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  holding: {
    type: Number,
    required: true,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  }
})

// Compound index for querying a room's history sorted by time
pulseSnapshotSchema.index({ roomId: 1, timestamp: 1 })

export default mongoose.model('PulseSnapshot', pulseSnapshotSchema)
