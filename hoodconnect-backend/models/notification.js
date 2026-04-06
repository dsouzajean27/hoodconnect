const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  senderId:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  senderName:  { type: String },
  type:        { type: String, enum: ["like", "comment", "trust"], required: true },
  postId:      { type: mongoose.Schema.Types.ObjectId, ref: "Post" },
  postTitle:   { type: String },
  read:        { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("Notification", notificationSchema);