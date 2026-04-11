const mongoose = require("mongoose");

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

    comments: [
      {
        userName: String,
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        text: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],

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
