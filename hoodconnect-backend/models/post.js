const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },

    location: { type: String },
    city: { type: String },

    latitude: { type: Number },
    longitude: { type: Number },

    originAddress: String,   // your current location
    targetAddress: String,   // typed location

    originLat: Number,
    originLng: Number,

    targetLat: Number,
    targetLng: Number,

    type: {
      type: String,
      enum: ["casual", "emergency", "event", "promotional"],
      default: "casual",
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
    anonymous: { type: Boolean, default: false },

    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    trustUpvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    trustDownvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    severity: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "low"
    }

    comments: [
      {
        userName: String,
        text: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],

    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "low"
    },

    // ⭐ GEO DATA (PRODUCTION STANDARD)
    geo: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },

    image: String,
    video: String,
    alert: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ⭐ IMPORTANT INDEX
postSchema.index({ geo: "2dsphere" });

module.exports = mongoose.model("Post", postSchema);
