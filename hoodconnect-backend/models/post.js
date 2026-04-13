const mongoose = require("mongoose");

// ── Nested reply sub-schema ───────────────────────────────────────────────────
const replySchema = new mongoose.Schema({
  userName:  String,
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  text:      String,
  mentions:  [String],   // array of @username strings mentioned in this reply
  likes:     [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now },
});

// ── Comment sub-schema (with replies + likes + mentions) ──────────────────────
const commentSchema = new mongoose.Schema({
  userName:  String,
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  text:      String,
  mentions:  [String],   // @username strings in the comment text
  likes:     [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  replies:   [replySchema],
  createdAt: { type: Date, default: Date.now },
});

const postSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },

    area: { type: String, lowercase: true, index: true },

    originAddress: String,
    originLat: Number,
    originLng: Number,

    targetAddress: String,
    targetLat: Number,
    targetLng: Number,

    type: {
      type: String,
      enum: ["casual", "emergency", "event", "promotional"],
      default: "casual",
    },

    severity: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "low",
    },

    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
    anonymous: { type: Boolean, default: false },

    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    trustUpvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    trustDownvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // ── Upgraded comments ────────────────────────────────────────────────────
    comments: [commentSchema],

    image: String,
    video: String,
    alert: { type: Boolean, default: false },

    // ── Geotagged media ────────────────────────────────────────────────────
    geotagged:       { type: Boolean, default: false },
    captureLat:      { type: Number, default: null },
    captureLng:      { type: Number, default: null },
    captureAddress:  { type: String, default: null },

    geo: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number] },
    },

    // ── Moderation fields ──────────────────────────────────────────────────
    reportCount: { type: Number, default: 0 },
    reportedBy:  [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

postSchema.index({ geo: "2dsphere" });

module.exports = mongoose.model("Post", postSchema);
