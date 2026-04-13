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

  // ── Badges ────────────────────────────────────────────────────────────────
  // Each string is a badge key; the frontend maps keys to display info
  badges: [{
    type: String,
    enum: [
      "verified_citizen",    // Aadhaar verified by admin
      "first_responder",     // 3+ emergency posts
      "active_contributor",  // 20+ total posts
      "top_of_area",         // #1 trust score in area
      "truth_seeker",        // 25+ trust upvotes received
      "old_timer",           // Account older than 6 months
      "newcomer",            // Made their very first post
    ],
  }],


  bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
  bio:       { type: String, default: "" },

  // ── Moderation fields ──────────────────────────────────────────────────
  warnings:    { type: Number, default: 0 },      // admin-issued warnings
  banned:      { type: Boolean, default: false },  // banned users can't log in
  reportCount: { type: Number, default: 0 },       // how many times reported by others

}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
