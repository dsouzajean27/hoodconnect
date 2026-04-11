const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
  location: { type: String },
  area:     { type: String, lowercase: true },

  // Aadhaar — only last 4 digits stored, never the full number
  aadhaarLast4:           { type: String, default: null },
  // not_submitted → pending → verified | rejected
  aadhaarStatus:          { type: String, enum: ["not_submitted","pending","verified","rejected"], default: "not_submitted" },
  aadhaarRejectionReason: { type: String, default: "" },

  // Trust-score auto-badge (separate from Aadhaar)
  verified:  { type: Boolean, default: false },

  bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
  bio:       { type: String, default: "" },

  // ── Moderation fields ──────────────────────────────────────────────────
  warnings:    { type: Number, default: 0 },      // admin-issued warnings
  banned:      { type: Boolean, default: false },  // banned users can't log in
  reportCount: { type: Number, default: 0 },       // how many times reported by others

}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
