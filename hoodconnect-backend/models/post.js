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
        text: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],

    // FIX: image/video are now Cloudinary URLs (strings), not local filenames.
    // The server now stores the full URL returned by Cloudinary.
    image: String,
    video: String,
    alert: { type: Boolean, default: false },

    geo: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number] },
    },
  },
  { timestamps: true }
);

postSchema.index({ geo: "2dsphere" });

module.exports = mongoose.model("Post", postSchema);
