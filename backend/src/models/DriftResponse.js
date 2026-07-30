import mongoose from 'mongoose'

const driftResponseSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  segmentIndex: {
    type: Number,
    required: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  selectedOption: {
    type: String,
    default: null
  },
  dismissed: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
})

// Compound index for querying drift responses by room and segment
driftResponseSchema.index({ roomId: 1, segmentIndex: 1 })

// TTL index: auto-delete responses after 7 days (604800 seconds)
driftResponseSchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 })

export default mongoose.model('DriftResponse', driftResponseSchema)
