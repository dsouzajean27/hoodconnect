const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  location: {
    type: String
  },
  area: {
    type: String,
    lowercase: true
  },
  // Verified badge: set manually by admin or auto via trust score threshold
  verified: {
    type: Boolean,
    default: false
  },
  // Bookmarked post IDs
  bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
  bio: {
    type: String,
    default: ""
  }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
