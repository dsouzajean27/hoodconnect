const mongoose = require("mongoose");

// Stores browser push subscriptions per user+area
const subscriptionSchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  area:     { type: String, default: "unknown" },   // used to target area-specific pushes
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, required: true },
    auth:   { type: String, required: true },
  },
}, { timestamps: true });

module.exports = mongoose.model("Subscription", subscriptionSchema);
