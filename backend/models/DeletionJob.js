import mongoose from 'mongoose';

const deletionJobSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['queued','running','completed','failed'], default: 'queued' },
  progress: { type: Number, default: 0 },
  message: { type: String, default: '' },
  error: { type: String, default: '' },
  startedAt: { type: Date },
  finishedAt: { type: Date }
}, { timestamps: true });

export default mongoose.model('DeletionJob', deletionJobSchema);
