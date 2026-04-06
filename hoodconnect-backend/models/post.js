const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    
    // Geographical Tracking
    area: { type: String, lowercase: true, index: true }, // The socket room / filter key
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
      default: "low"
    },

    // User Info
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userName: { type: String },
    anonymous: { type: Boolean, default: false },

    // Engagement
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

    // Media & Alerts
    image: String,
    video: String,
    alert: { type: Boolean, default: false }, // Triggers the emergency popup

    // MongoDB Geo-spatial index for "Near Me" searches
    geo: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number] }, // [longitude, latitude]
    },
  },
  { timestamps: true }
);

postSchema.index({ geo: "2dsphere" });

module.exports = mongoose.model("Post", postSchema);