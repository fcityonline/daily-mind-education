// backend/models/Block.js
import mongoose from "mongoose";

const blockSchema = new mongoose.Schema(
  {
    blockedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    blockedUser: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },
    reason: { 
      type: String, 
      maxlength: 200 
    }
  },
  { timestamps: true }
);

// Ensure one user can only block another user once
blockSchema.index({ blockedBy: 1, blockedUser: 1 }, { unique: true });
blockSchema.index({ blockedBy: 1 });
blockSchema.index({ blockedUser: 1 });

export default mongoose.model("Block", blockSchema);

