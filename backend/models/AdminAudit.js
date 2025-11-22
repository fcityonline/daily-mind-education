// backend/models/AdminAudit.js
import mongoose from "mongoose";

const AdminAuditSchema = new mongoose.Schema({
  admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  method: { type: String },
  path: { type: String },
  body: { type: Object },
  query: { type: Object },
  createdAt: { type: Date, default: Date.now }
});

AdminAuditSchema.index({ admin: 1, createdAt: -1 });

export default mongoose.model('AdminAudit', AdminAuditSchema);


