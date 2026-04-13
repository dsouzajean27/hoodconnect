const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  senderId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text:       { type: String, required: true },
  read:       { type: Boolean, default: false },
}, { timestamps: true });

// Index for fast conversation lookup
messageSchema.index({ senderId: 1, receiverId: 1 });
messageSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Message", messageSchema);
