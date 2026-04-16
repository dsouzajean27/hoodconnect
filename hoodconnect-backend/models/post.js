const mongoose = require("mongoose");

// ── Nested reply sub-schema ───────────────────────────────────────────────────
const replySchema = new mongoose.Schema({
  userName:  String,
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  text:      String,
  mentions:  [String],
  likes:     [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now },
});

// ── Comment sub-schema ────────────────────────────────────────────────────────
const commentSchema = new mongoose.Schema({
  userName:  String,
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  text:      String,
  mentions:  [String],
  likes:     [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  replies:   [replySchema],
  createdAt: { type: Date, default: Date.now },
});

// ── Poll option sub-schema ────────────────────────────────────────────────────
const pollOptionSchema = new mongoose.Schema({
  text:  { type: String, required: true },
  votes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
});

// ── Post schema ───────────────────────────────────────────────────────────────
const postSchema = new mongoose.Schema(
  {
    title:   { type: String, required: true },
    content: { type: String, required: true },

    area:           { type: String, lowercase: true, index: true },
    originAddress:  String,
    originLat:      Number,
    originLng:      Number,
    targetAddress:  String,
    targetLat:      Number,
    targetLng:      Number,

    type: {
      type: String,
      enum: ["casual","emergency","event","promotional"],
      default: "casual",
    },
    severity: {
      type: String,
      enum: ["low","medium","high"],
      default: "low",
    },

    userId:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userName:  { type: String },
    anonymous: { type: Boolean, default: false },

    likes:          [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    trustUpvotes:   [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    trustDownvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    comments: [commentSchema],

    // ── Legacy single-file fields — kept for backwards compat with old posts ──
    image:  String,
    video:  String,

    // ── NEW: multiple files per post ──────────────────────────────────────────
    images: [String],
    videos: [String],

    alert:  { type: Boolean, default: false },

    // Geotagged media
    geotagged:      { type: Boolean, default: false },
    captureLat:     { type: Number, default: null },
    captureLng:     { type: Number, default: null },
    captureAddress: { type: String, default: null },

    geo: {
      type:        { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number] },
    },

    // Moderation
    reportCount: { type: Number, default: 0 },
    reportedBy:  [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Poll
    isPoll:      { type: Boolean, default: false },
    pollOptions: [pollOptionSchema],
    pollEndsAt:  { type: Date, default: null },

    // ── NEW: Events upgrade ───────────────────────────────────────────────────
    eventDate: { type: Date,   default: null },
    eventTime: { type: String, default: null }, // e.g. "18:30"
    rsvp: {
      going:      [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      interested: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    },
  },
  { timestamps: true }
);

postSchema.index({ geo: "2dsphere" });

module.exports = mongoose.model("Post", postSchema);
