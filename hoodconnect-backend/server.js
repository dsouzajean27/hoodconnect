const express   = require("express");
const mongoose  = require("mongoose");
const cors      = require("cors");
const multer    = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
const geocoder  = require("./geocoder");
const bcrypt    = require("bcrypt");
const jwt       = require("jsonwebtoken");
const http      = require("http");
const { Server } = require("socket.io");

// ── Cloudinary ────────────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder: "hoodconnect",
    resource_type: file.mimetype.startsWith("video") ? "video" : "image",
    public_id: `${Date.now()}-${file.originalname.replace(/\s/g, "_")}`,
  }),
});
const upload = multer({ storage });

// ── App + Socket ──────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: "https://hoodconnect.vercel.app", methods: ["GET","POST"] },
});

// ── Haversine ─────────────────────────────────────────────────────────────────
function getDistance(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a    = Math.sin(dLat/2)**2 + Math.cos(lat1*(Math.PI/180)) * Math.cos(lat2*(Math.PI/180)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Auth middleware ───────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
}

// ── Admin middleware ──────────────────────────────────────────────────────────
// Set ADMIN_SECRET in Render env vars. Pass it as Authorization: Bearer <ADMIN_SECRET>
function adminMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token || token !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ message: "Admin access only" });
  }
  next();
}

// ── Auto-verify trust helper ──────────────────────────────────────────────────
async function checkAndGrantVerified(userId) {
  try {
    const user = await User.findById(userId);
    if (!user || user.verified) return;
    const posts = await Post.find({ userId, anonymous: false });
    const score = posts.reduce((t, p) => t + p.trustUpvotes.length - p.trustDownvotes.length, 0);
    if (score >= 50) await User.findByIdAndUpdate(userId, { verified: true });
  } catch (err) { console.log("checkAndGrantVerified:", err.message); }
}

// ── Socket ────────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", ({ area }) => {
    for (const room of socket.rooms) { if (room !== socket.id) socket.leave(room); }
    const norm = area.toLowerCase().replace(/\s/g, "-");
    socket.join(norm);
  });

  socket.on("joinUserRoom", ({ userId }) => { socket.join(`user:${userId}`); });
  socket.on("disconnect", () => console.log("User disconnected:", socket.id));
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: ["https://hoodconnect.vercel.app"], methods: ["GET","POST","PUT","DELETE"], credentials: true }));
app.use(express.json());
app.get("/", (req, res) => res.send("HoodConnect Backend is running 🚀"));

// ── Models ────────────────────────────────────────────────────────────────────
const User         = require("./models/user");
const Post         = require("./models/post");
const Area         = require("./models/area");
const Notification = require("./models/notification");

// ── DB ────────────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => { console.log("MONGO ERROR:", err); process.exit(1); });

// ═════════════════════════════════════════════════════════════════════════════
// AUTH ROUTES
// ═════════════════════════════════════════════════════════════════════════════

app.post("/register", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const area = (req.body.area || req.body.location || "unknown").toLowerCase().replace(/\s/g, "-");

    // Aadhaar: frontend sends only last 4 digits after masking
    const aadhaarLast4 = req.body.aadhaarLast4 || null;

    const newUser = new User({
      name:          req.body.name,
      email:         req.body.email,
      password:      hashedPassword,
      area,
      aadhaarLast4,
      // If Aadhaar was provided → pending review; otherwise not_submitted
      aadhaarStatus: aadhaarLast4 ? "pending" : "not_submitted",
    });

    await newUser.save();
    await saveArea(area);
    res.json({ message: "User registered" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Wrong password" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({
      message: "Login success",
      token,
      user: {
        id:            user._id,
        name:          user.name,
        email:         user.email,
        area:          user.area,
        verified:      user.verified,
        aadhaarStatus: user.aadhaarStatus,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN — AADHAAR REVIEW ROUTES
// All protected by ADMIN_SECRET header (not JWT)
// ═════════════════════════════════════════════════════════════════════════════

// GET /admin/aadhaar-pending  — list users awaiting review
app.get("/admin/aadhaar-pending", adminMiddleware, async (req, res) => {
  try {
    const users = await User.find({ aadhaarStatus: "pending" })
      .select("name email area aadhaarLast4 aadhaarStatus createdAt")
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /admin/aadhaar/:userId/approve
app.put("/admin/aadhaar/:userId/approve", adminMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.userId, { aadhaarStatus: "verified" });
    res.json({ message: "Aadhaar verified" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /admin/aadhaar/:userId/reject
app.put("/admin/aadhaar/:userId/reject", adminMiddleware, async (req, res) => {
  try {
    const reason = req.body.reason || "Does not meet requirements";
    await User.findByIdAndUpdate(req.params.userId, {
      aadhaarStatus: "rejected",
      aadhaarRejectionReason: reason,
    });
    res.json({ message: "Aadhaar rejected" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// POSTS
// ═════════════════════════════════════════════════════════════════════════════

app.post("/posts", authMiddleware,
  upload.fields([{ name: "image", maxCount: 1 }, { name: "video", maxCount: 1 }]),
  async (req, res) => {
    try {
      const {
        title, content, location, type,
        latitude, longitude, userId, userName,
        anonymous, alert, severity, area,
        // geotagged fields from camera capture
        geotagged, captureLat, captureLng, captureAddress,
      } = req.body;

      const isAnonymous = anonymous === "true";
      const isAlert     = alert     === "true";
      const isGeotagged = geotagged === "true";

      if (!latitude || !longitude) return res.status(400).json({ message: "Missing location" });

      let originAddress = "Unknown", targetAddress = "Unknown";
      let targetLat = null, targetLng = null;

      try {
        const geoData = await geocoder.reverse({ lat: parseFloat(latitude), lon: parseFloat(longitude) });
        if (geoData?.[0]) originAddress = geoData[0].formattedAddress;
      } catch {}

      if (location && location !== "Unknown") {
        try {
          const geoData = await geocoder.geocode(location);
          if (geoData?.[0]) {
            targetLat     = geoData[0].latitude;
            targetLng     = geoData[0].longitude;
            targetAddress = geoData[0].formattedAddress;
          }
        } catch {}
      }

      if (!targetLat || !targetLng) {
        targetLat = parseFloat(latitude);
        targetLng = parseFloat(longitude);
        targetAddress = originAddress;
      }

      const normalizedArea = (area || "unknown").toLowerCase().replace(/\s/g, "-");

      const post = new Post({
        title, content,
        area:          normalizedArea,
        originAddress, originLat: parseFloat(latitude), originLng: parseFloat(longitude),
        targetAddress, targetLat, targetLng,
        type,
        anonymous:     isAnonymous,
        alert:         isAlert,
        userName:      isAnonymous ? "Anonymous" : userName,
        userId:        isAnonymous ? null : userId,
        severity:      severity || "low",
        geo:           { type: "Point", coordinates: [targetLng, targetLat] },
        image:         req.files?.image?.[0]?.path || null,
        video:         req.files?.video?.[0]?.path || null,
        // Geotagged camera data
        geotagged:      isGeotagged,
        captureLat:     captureLat  ? parseFloat(captureLat)  : null,
        captureLng:     captureLng  ? parseFloat(captureLng)  : null,
        captureAddress: captureAddress || null,
      });

      await post.save();
      await saveArea(normalizedArea);
      io.to(normalizedArea).emit("newPost", post);
      res.json(post);
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: err.message });
    }
  }
);

app.get("/posts", async (req, res) => {
  try {
    const { area } = req.query;
    const query = area ? { area: area.toLowerCase().replace(/\s/g, "-") } : {};
    const posts = await Post.find(query).sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/posts/nearby", async (req, res) => {
  try {
    const { lat, lng, radius = 5 } = req.query;
    if (!lat || !lng) return res.status(400).json({ message: "Missing coordinates" });
    const posts = await Post.find({
      geo: { $near: { $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] }, $maxDistance: radius * 1000 } },
    });
    res.json(posts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/posts/:id", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.userId?.toString() !== req.userId) return res.status(403).json({ message: "Not authorized" });
    post.content = req.body.content || post.content;
    await post.save();
    res.json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/posts/:id", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.userId?.toString() !== req.userId) return res.status(403).json({ message: "Not authorized" });
    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: "Post deleted successfully" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/posts/:id/like", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const alreadyLiked = post.likes.includes(userId);
    post.likes = alreadyLiked
      ? post.likes.filter((id) => id.toString() !== userId)
      : [...post.likes, userId];
    await post.save();
    if (post.userId && post.userId.toString() !== userId) {
      const notif = await Notification.create({ recipientId: post.userId, senderId: userId, senderName: req.body.userName || "Someone", type: "like", postId: post._id, postTitle: post.title });
      io.to(`user:${post.userId}`).emit("newNotification", notif);
    }
    res.json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/posts/:id/comment", authMiddleware, async (req, res) => {
  try {
    const { text, userName } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    post.comments.push({ text, userName });
    await post.save();
    if (post.userId && post.userId.toString() !== req.body.userId) {
      const notif = await Notification.create({ recipientId: post.userId, senderId: req.body.userId || null, senderName: userName || "Someone", type: "comment", postId: post._id, postTitle: post.title });
      io.to(`user:${post.userId}`).emit("newNotification", notif);
    }
    res.json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/posts/:id/trust", authMiddleware, async (req, res) => {
  try {
    const { userId, type } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    post.trustUpvotes   = post.trustUpvotes.filter((id) => id.toString() !== userId);
    post.trustDownvotes = post.trustDownvotes.filter((id) => id.toString() !== userId);
    if (type === "up") post.trustUpvotes.push(userId);
    else               post.trustDownvotes.push(userId);
    await post.save();
    if (post.userId) await checkAndGrantVerified(post.userId);
    if (post.userId && post.userId.toString() !== userId) {
      const notif = await Notification.create({ recipientId: post.userId, senderId: userId, senderName: req.body.userName || "Someone", type: "trust", postId: post._id, postTitle: post.title });
      io.to(`user:${post.userId}`).emit("newNotification", notif);
    }
    res.json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Bookmarks ─────────────────────────────────────────────────────────────────
app.put("/posts/:id/bookmark", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    const postId         = req.params.id;
    const alreadyBookmarked = user.bookmarks.some((id) => id.toString() === postId);
    user.bookmarks = alreadyBookmarked
      ? user.bookmarks.filter((id) => id.toString() !== postId)
      : [...user.bookmarks, postId];
    await user.save();
    res.json({ bookmarks: user.bookmarks });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/bookmarks", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate("bookmarks");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user.bookmarks);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Areas ─────────────────────────────────────────────────────────────────────
app.post("/areas", authMiddleware, async (req, res) => {
  try {
    const name = req.body.name?.toLowerCase().replace(/\s/g, "-");
    if (!name) return res.status(400).json({ message: "Name required" });
    const area = await Area.findOneAndUpdate({ name }, { name }, { upsert: true, new: true });
    res.json(area);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/areas", async (req, res) => {
  try {
    const areas = await Area.find().sort({ name: 1 });
    res.json(areas);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function saveArea(name) {
  try { await Area.findOneAndUpdate({ name }, { name }, { upsert: true, new: true }); }
  catch (err) { console.log("saveArea error:", err.message); }
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
app.get("/leaderboard/:area", async (req, res) => {
  try {
    const area  = req.params.area.toLowerCase().replace(/\s/g, "-");
    const posts = await Post.find({ area, anonymous: false });
    const scoreMap = {}, nameMap = {}, verifiedMap = {};
    for (const post of posts) {
      if (!post.userId) continue;
      const uid = post.userId.toString();
      if (!scoreMap[uid]) scoreMap[uid] = 0;
      scoreMap[uid] += post.trustUpvotes.length - post.trustDownvotes.length;
      nameMap[uid]   = post.userName;
    }
    const userIds = Object.keys(scoreMap);
    const users   = await User.find({ _id: { $in: userIds } }).select("verified name");
    for (const u of users) { verifiedMap[u._id.toString()] = u.verified; nameMap[u._id.toString()] = u.name; }
    const leaderboard = userIds.map((uid) => ({
      userId: uid, name: nameMap[uid] || "Unknown", score: scoreMap[uid], verified: verifiedMap[uid] || false,
    })).sort((a, b) => b.score - a.score).slice(0, 5);
    res.json(leaderboard);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Notifications ─────────────────────────────────────────────────────────────
app.get("/notifications/:userId", authMiddleware, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipientId: req.params.userId }).sort({ createdAt: -1 }).limit(20);
    res.json(notifications);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/notifications/:userId/read", authMiddleware, async (req, res) => {
  try {
    await Notification.updateMany({ recipientId: req.params.userId }, { read: true });
    res.json({ message: "Marked as read" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Profile ───────────────────────────────────────────────────────────────────
app.get("/profile/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    const posts = await Post.find({ userId: req.params.userId, anonymous: false }).sort({ createdAt: -1 });
    const trustScore = posts.reduce((total, post) => total + post.trustUpvotes.length - post.trustDownvotes.length, 0);
    res.json({
      user: {
        id:            user._id,
        name:          user.name,
        area:          user.area,
        bio:           user.bio || "",
        verified:      user.verified,
        aadhaarStatus: user.aadhaarStatus,
        createdAt:     user.createdAt,
      },
      posts, trustScore, postCount: posts.length,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/users/:userId/area", authMiddleware, async (req, res) => {
  try {
    if (req.userId !== req.params.userId) return res.status(403).json({ message: "Not authorized" });
    const area = req.body.area?.toLowerCase().replace(/\s/g, "-");
    await User.findByIdAndUpdate(req.params.userId, { area });
    await saveArea(area);
    res.json({ message: "Area updated" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/users/:userId/bio", authMiddleware, async (req, res) => {
  try {
    if (req.userId !== req.params.userId) return res.status(403).json({ message: "Not authorized" });
    const bio = req.body.bio?.slice(0, 160) || "";
    await User.findByIdAndUpdate(req.params.userId, { bio });
    res.json({ message: "Bio updated" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));
