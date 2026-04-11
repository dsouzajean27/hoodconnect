const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },

    // FIX: added originAddress, originLat, originLng — were computed in
    // server.js but missing from schema, so Mongoose silently dropped them.
    // The frontend was already trying to render post.originAddress.
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
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // ADD THIS
        text: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // FIX: image/video are now Cloudinary URLs (strings), not local filenames.
    // The server now stores the full URL returned by Cloudinary.
    image: String,
    video: String,
    alert: { type: Boolean, default: false },

    // ── Geotagged media ────────────────────────────────────────────────────
    // True when photo/video was captured via the in-app camera with GPS
    geotagged:       { type: Boolean, default: false },
    // Exact GPS at moment of capture (may differ from post's targetLat/Lng)
    captureLat:      { type: Number, default: null },
    captureLng:      { type: Number, default: null },
    captureAddress:  { type: String, default: null },

    geo: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number] },
    },
  },
  { timestamps: true }
);

postSchema.index({ geo: "2dsphere" });

module.exports = mongoose.model("Post", postSchema);
