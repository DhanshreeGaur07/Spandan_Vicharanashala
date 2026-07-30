import mongoose from 'mongoose'

const surfaceReportSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    unique: true,
    index: true
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  markdown: {
    type: String,
    required: true
  },
  inputSummary: {
    type: Object,
    default: {}
  },
  regenerationCount: {
    type: Number,
    default: 0
  }
})

export default mongoose.model('SurfaceReport', surfaceReportSchema)
