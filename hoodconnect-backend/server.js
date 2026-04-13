const express    = require("express");
const mongoose   = require("mongoose");
const cors       = require("cors");
const multer     = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
const geocoder   = require("./geocoder");
const bcrypt     = require("bcrypt");
const jwt        = require("jsonwebtoken");
const http       = require("http");
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

// ── Auth middleware ───────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });
  try {
    req.userId = jwt.verify(token, process.env.JWT_SECRET).id;
    next();
  } catch {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
}

// ── Admin middleware ──────────────────────────────────────────────────────────
function adminMiddleware(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token || token !== process.env.ADMIN_SECRET)
    return res.status(403).json({ message: "Admin access only" });
  next();
}

// ═════════════════════════════════════════════════════════════════════════════
// BADGE LOGIC
// Centralised function — call after any action that might unlock a badge.
// Adds badge only once (avoids duplicates with $addToSet).
// ═════════════════════════════════════════════════════════════════════════════
async function checkAndGrantBadges(userId) {
  try {
    const User = require("./models/user");
    const Post = require("./models/post");

    const user  = await User.findById(userId);
    if (!user || user.banned) return;

    const posts   = await Post.find({ userId, anonymous: false });
    const newBadges = [];

    // 🟢 Verified Citizen — Aadhaar approved
    if (user.aadhaarStatus === "verified") newBadges.push("verified_citizen");

    // 🚨 First Responder — 3+ emergency posts
    const emergencyCount = posts.filter(p => p.type === "emergency").length;
    if (emergencyCount >= 3) newBadges.push("first_responder");

    // 💬 Active Contributor — 20+ total posts
    if (posts.length >= 20) newBadges.push("active_contributor");

    // 🏆 Top of Area — trust score >= 50
    const trustScore = posts.reduce((t, p) => t + p.trustUpvotes.length - p.trustDownvotes.length, 0);
    if (trustScore >= 50) {
      newBadges.push("top_of_area");
      // Also grant verified badge if not already
      if (!user.verified) await User.findByIdAndUpdate(userId, { verified: true });
    }

    // 🔍 Truth Seeker — received 25+ trust upvotes total
    const totalUpvotes = posts.reduce((t, p) => t + p.trustUpvotes.length, 0);
    if (totalUpvotes >= 25) newBadges.push("truth_seeker");

    // 📅 Old Timer — account older than 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    if (user.createdAt < sixMonthsAgo) newBadges.push("old_timer");

    // ✨ Newcomer — made their very first post
    if (posts.length >= 1) newBadges.push("newcomer");

    if (newBadges.length > 0) {
      await User.findByIdAndUpdate(userId, { $addToSet: { badges: { $each: newBadges } } });
    }
  } catch (err) {
    console.log("checkAndGrantBadges:", err.message);
  }
}

// ── Socket ────────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", ({ area }) => {
    for (const room of socket.rooms) { if (room !== socket.id) socket.leave(room); }
    socket.join(area.toLowerCase().replace(/\s/g, "-"));
  });

  socket.on("joinUserRoom", ({ userId }) => { socket.join(`user:${userId}`); });

  // ── DM: join a conversation room ─────────────────────────────────────────
  // Room key = sorted pair of userIds so both sides join the same room
  socket.on("joinConversation", ({ userId, otherId }) => {
    const room = [userId, otherId].sort().join("_");
    socket.join(`chat:${room}`);
  });

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
const Message      = require("./models/message");

// ── DB ────────────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => { console.log("MONGO ERROR:", err); process.exit(1); });

// ═════════════════════════════════════════════════════════════════════════════
// AUTH
// ═════════════════════════════════════════════════════════════════════════════

app.post("/register", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const area           = (req.body.area || req.body.location || "unknown").toLowerCase().replace(/\s/g, "-");
    const aadhaarLast4   = req.body.aadhaarLast4 || null;
    const newUser = new User({
      name: req.body.name, email: req.body.email, password: hashedPassword, area,
      aadhaarLast4, aadhaarStatus: aadhaarLast4 ? "pending" : "not_submitted",
      badges: [],
    });
    await newUser.save();
    await saveArea(area);
    res.json({ message: "User registered" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });
    if (user.banned) return res.status(403).json({ message: "Your account has been suspended." });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Wrong password" });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({
      message: "Login success", token,
      user: { id: user._id, name: user.name, email: user.email, area: user.area, verified: user.verified, aadhaarStatus: user.aadhaarStatus, badges: user.badges || [], warnings: user.warnings },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN — AADHAAR
// ═════════════════════════════════════════════════════════════════════════════

app.get("/admin/aadhaar-pending", adminMiddleware, async (req, res) => {
  try {
    const users = await User.find({ aadhaarStatus: "pending" }).select("name email area aadhaarLast4 aadhaarStatus createdAt").sort({ createdAt: -1 });
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/admin/aadhaar/:userId/approve", adminMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.userId, { aadhaarStatus: "verified" });
    await checkAndGrantBadges(req.params.userId); // may unlock verified_citizen
    res.json({ message: "Aadhaar verified" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/admin/aadhaar/:userId/reject", adminMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.userId, { aadhaarStatus: "rejected", aadhaarRejectionReason: req.body.reason || "Does not meet requirements" });
    res.json({ message: "Aadhaar rejected" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN — USER MODERATION
// ═════════════════════════════════════════════════════════════════════════════

app.get("/admin/reported-users", adminMiddleware, async (req, res) => {
  try {
    const users = await User.find({ reportCount: { $gt: 0 } }).select("name email area reportCount warnings banned createdAt").sort({ reportCount: -1 });
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/admin/users/:id/warn", adminMiddleware, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { $inc: { warnings: 1 } }, { new: true });
    res.json({ message: "Warning issued", warnings: user.warnings });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/admin/users/:id/ban", adminMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { banned: true });
    res.json({ message: "User banned" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN — REPORTED POSTS
// ═════════════════════════════════════════════════════════════════════════════

app.get("/admin/reported-posts", adminMiddleware, async (req, res) => {
  try {
    const posts = await Post.find({ reportCount: { $gt: 0 } }).sort({ reportCount: -1 });
    res.json(posts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/admin/posts/:id", adminMiddleware, async (req, res) => {
  try { await Post.findByIdAndDelete(req.params.id); res.json({ message: "Post deleted by admin" }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/admin/posts/:id/dismiss-report", adminMiddleware, async (req, res) => {
  try { await Post.findByIdAndUpdate(req.params.id, { reportCount: 0, reportedBy: [] }); res.json({ message: "Report dismissed" }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// POSTS
// ═════════════════════════════════════════════════════════════════════════════

app.post("/posts", authMiddleware,
  upload.fields([{ name: "image", maxCount: 1 }, { name: "video", maxCount: 1 }]),
  async (req, res) => {
    try {
      const { title, content, location, type, latitude, longitude, userId, userName, anonymous, alert, severity, area, geotagged, captureLat, captureLng, captureAddress } = req.body;
      const isAnonymous = anonymous === "true";
      const isAlert     = alert     === "true";
      const isGeotagged = geotagged === "true";
      if (!latitude || !longitude) return res.status(400).json({ message: "Missing location" });

      let originAddress = "Unknown", targetAddress = "Unknown", targetLat = null, targetLng = null;
      try { const g = await geocoder.reverse({ lat: parseFloat(latitude), lon: parseFloat(longitude) }); if (g?.[0]) originAddress = g[0].formattedAddress; } catch {}
      if (location && location !== "Unknown") {
        try { const g = await geocoder.geocode(location); if (g?.[0]) { targetLat = g[0].latitude; targetLng = g[0].longitude; targetAddress = g[0].formattedAddress; } } catch {}
      }
      if (!targetLat || !targetLng) { targetLat = parseFloat(latitude); targetLng = parseFloat(longitude); targetAddress = originAddress; }

      const normalizedArea = (area || "unknown").toLowerCase().replace(/\s/g, "-");
      const post = new Post({
        title, content, area: normalizedArea,
        originAddress, originLat: parseFloat(latitude), originLng: parseFloat(longitude),
        targetAddress, targetLat, targetLng, type,
        anonymous: isAnonymous, alert: isAlert,
        userName: isAnonymous ? "Anonymous" : userName,
        userId:   isAnonymous ? null : userId,
        severity: severity || "low",
        geo: { type: "Point", coordinates: [targetLng, targetLat] },
        image: req.files?.image?.[0]?.path || null,
        video: req.files?.video?.[0]?.path || null,
        geotagged: isGeotagged,
        captureLat: captureLat ? parseFloat(captureLat) : null,
        captureLng: captureLng ? parseFloat(captureLng) : null,
        captureAddress: captureAddress || null,
      });
      await post.save();
      await saveArea(normalizedArea);

      // Check badges for the poster
      if (!isAnonymous && userId) await checkAndGrantBadges(userId);

      io.to(normalizedArea).emit("newPost", post);

      // ── Emergency broadcast: emit to entire area room with special event ──
      if (isAlert && type === "emergency") {
        io.to(normalizedArea).emit("emergencyBroadcast", {
          postId:   post._id,
          title:    post.title,
          content:  post.content,
          address:  post.targetAddress || post.originAddress,
          lat:      targetLat,
          lng:      targetLng,
          severity: severity || "low",
          userName: isAnonymous ? "Anonymous" : userName,
        });
      }

      res.json(post);
    } catch (err) { console.log(err); res.status(500).json({ error: err.message }); }
  }
);

app.get("/posts", async (req, res) => {
  try {
    const { area } = req.query;
    const posts = await Post.find(area ? { area: area.toLowerCase().replace(/\s/g, "-") } : {}).sort({ createdAt: -1 });
    res.json(posts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/posts/nearby", async (req, res) => {
  try {
    const { lat, lng, radius = 5 } = req.query;
    if (!lat || !lng) return res.status(400).json({ message: "Missing coordinates" });
    const posts = await Post.find({ geo: { $near: { $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] }, $maxDistance: radius * 1000 } } });
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
    res.json({ message: "Post deleted" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/posts/:id/like", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const alreadyLiked = post.likes.includes(userId);
    post.likes = alreadyLiked ? post.likes.filter(id => id.toString() !== userId) : [...post.likes, userId];
    await post.save();
    if (post.userId && post.userId.toString() !== userId) {
      const notif = await Notification.create({ recipientId: post.userId, senderId: userId, senderName: req.body.userName || "Someone", type: "like", postId: post._id, postTitle: post.title });
      io.to(`user:${post.userId}`).emit("newNotification", notif);
    }
    res.json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Upgraded comment: supports mentions in text ───────────────────────────────
app.post("/posts/:id/comment", authMiddleware, async (req, res) => {
  try {
    const { text, userName, userId } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    // Extract @mentions from text
    const mentions = (text.match(/@(\w+)/g) || []).map(m => m.slice(1));

    post.comments.push({ text, userName, userId: userId || null, mentions, likes: [], replies: [] });
    await post.save();

    if (post.userId && post.userId.toString() !== userId) {
      const notif = await Notification.create({ recipientId: post.userId, senderId: userId || null, senderName: userName || "Someone", type: "comment", postId: post._id, postTitle: post.title });
      io.to(`user:${post.userId}`).emit("newNotification", notif);
    }
    await checkAndGrantBadges(userId);
    res.json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Like a comment ────────────────────────────────────────────────────────────
app.put("/posts/:id/comments/:commentId/like", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    const post    = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const already = comment.likes.some(id => id.toString() === userId);
    comment.likes = already
      ? comment.likes.filter(id => id.toString() !== userId)
      : [...comment.likes, userId];

    await post.save();
    res.json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Reply to a comment ────────────────────────────────────────────────────────
app.post("/posts/:id/comments/:commentId/reply", authMiddleware, async (req, res) => {
  try {
    const { text, userName, userId } = req.body;
    const post    = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const mentions = (text.match(/@(\w+)/g) || []).map(m => m.slice(1));
    comment.replies.push({ text, userName, userId: userId || null, mentions, likes: [] });
    await post.save();

    // Notify the original commenter
    if (comment.userId && comment.userId.toString() !== userId) {
      const notif = await Notification.create({ recipientId: comment.userId, senderId: userId || null, senderName: userName || "Someone", type: "comment", postId: post._id, postTitle: post.title });
      io.to(`user:${comment.userId}`).emit("newNotification", notif);
    }
    res.json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Like a reply ──────────────────────────────────────────────────────────────
app.put("/posts/:id/comments/:commentId/replies/:replyId/like", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    const post    = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });
    const reply   = comment.replies.id(req.params.replyId);
    if (!reply)   return res.status(404).json({ message: "Reply not found" });

    const already = reply.likes.some(id => id.toString() === userId);
    reply.likes = already
      ? reply.likes.filter(id => id.toString() !== userId)
      : [...reply.likes, userId];

    await post.save();
    res.json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/posts/:id/trust", authMiddleware, async (req, res) => {
  try {
    const { userId, type } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    post.trustUpvotes   = post.trustUpvotes.filter(id => id.toString() !== userId);
    post.trustDownvotes = post.trustDownvotes.filter(id => id.toString() !== userId);
    if (type === "up") post.trustUpvotes.push(userId);
    else               post.trustDownvotes.push(userId);
    await post.save();
    if (post.userId) await checkAndGrantBadges(post.userId);
    if (post.userId && post.userId.toString() !== userId) {
      const notif = await Notification.create({ recipientId: post.userId, senderId: userId, senderName: req.body.userName || "Someone", type: "trust", postId: post._id, postTitle: post.title });
      io.to(`user:${post.userId}`).emit("newNotification", notif);
    }
    res.json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/posts/:id/report", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    if (post.reportedBy?.includes(userId)) return res.status(400).json({ message: "Already reported" });
    post.reportCount = (post.reportCount || 0) + 1;
    if (!post.reportedBy) post.reportedBy = [];
    post.reportedBy.push(userId);
    await post.save();
    if (post.userId) await User.findByIdAndUpdate(post.userId, { $inc: { reportCount: 1 } });
    res.json({ message: "Post reported" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// DM / CHAT ROUTES
// ═════════════════════════════════════════════════════════════════════════════

// GET /conversations/:userId — list all users this person has chatted with
app.get("/conversations/:userId", authMiddleware, async (req, res) => {
  try {
    const uid = req.params.userId;
    // Find all messages where user is sender or receiver
    const messages = await Message.find({
      $or: [{ senderId: uid }, { receiverId: uid }],
    }).sort({ createdAt: -1 });

    // Build unique conversation partner list with latest message
    const seen = new Map();
    for (const msg of messages) {
      const otherId = msg.senderId.toString() === uid ? msg.receiverId.toString() : msg.senderId.toString();
      if (!seen.has(otherId)) seen.set(otherId, msg);
    }

    // Fetch partner names
    const partnerIds  = [...seen.keys()];
    const partnerUsers = await User.find({ _id: { $in: partnerIds } }).select("name area badges");

    const conversations = partnerUsers.map(u => ({
      userId:      u._id,
      name:        u.name,
      area:        u.area,
      badges:      u.badges || [],
      lastMessage: seen.get(u._id.toString()),
      unread:      messages.filter(m => m.senderId.toString() === u._id.toString() && m.receiverId.toString() === uid && !m.read).length,
    }));

    res.json(conversations);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /messages/:userId/:otherId — fetch chat history between two users
app.get("/messages/:userId/:otherId", authMiddleware, async (req, res) => {
  try {
    const { userId, otherId } = req.params;
    const messages = await Message.find({
      $or: [
        { senderId: userId, receiverId: otherId },
        { senderId: otherId, receiverId: userId },
      ],
    }).sort({ createdAt: 1 }).limit(100);

    // Mark messages as read
    await Message.updateMany(
      { senderId: otherId, receiverId: userId, read: false },
      { read: true }
    );

    res.json(messages);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /messages — send a DM
app.post("/messages", authMiddleware, async (req, res) => {
  try {
    const { receiverId, text } = req.body;
    if (!receiverId || !text?.trim()) return res.status(400).json({ message: "receiverId and text required" });

    const msg = await Message.create({ senderId: req.userId, receiverId, text: text.trim() });

    // Emit to both sides via the shared conversation room
    const room = [req.userId, receiverId].sort().join("_");
    io.to(`chat:${room}`).emit("newMessage", msg);

    // Also emit to receiver's personal room so they get a notification dot
    io.to(`user:${receiverId}`).emit("newDM", { from: req.userId, message: msg });

    res.json(msg);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// BOOKMARKS
// ═════════════════════════════════════════════════════════════════════════════

app.put("/posts/:id/bookmark", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    const postId = req.params.id;
    const already = user.bookmarks.some(id => id.toString() === postId);
    user.bookmarks = already ? user.bookmarks.filter(id => id.toString() !== postId) : [...user.bookmarks, postId];
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

// ═════════════════════════════════════════════════════════════════════════════
// AREAS
// ═════════════════════════════════════════════════════════════════════════════

app.post("/areas", authMiddleware, async (req, res) => {
  try {
    const name = req.body.name?.toLowerCase().replace(/\s/g, "-");
    if (!name) return res.status(400).json({ message: "Name required" });
    const area = await Area.findOneAndUpdate({ name }, { name }, { upsert: true, new: true });
    res.json(area);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/areas", async (req, res) => {
  try { res.json(await Area.find().sort({ name: 1 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

async function saveArea(name) {
  try { await Area.findOneAndUpdate({ name }, { name }, { upsert: true, new: true }); }
  catch (err) { console.log("saveArea:", err.message); }
}

// ═════════════════════════════════════════════════════════════════════════════
// LEADERBOARD
// ═════════════════════════════════════════════════════════════════════════════

app.get("/leaderboard/:area", async (req, res) => {
  try {
    const area  = req.params.area.toLowerCase().replace(/\s/g, "-");
    const posts = await Post.find({ area, anonymous: false });
    const scoreMap = {}, nameMap = {}, verifiedMap = {};
    for (const p of posts) {
      if (!p.userId) continue;
      const uid = p.userId.toString();
      scoreMap[uid] = (scoreMap[uid] || 0) + p.trustUpvotes.length - p.trustDownvotes.length;
      nameMap[uid]  = p.userName;
    }
    const users = await User.find({ _id: { $in: Object.keys(scoreMap) } }).select("verified name badges");
    for (const u of users) { verifiedMap[u._id.toString()] = u.verified; nameMap[u._id.toString()] = u.name; }
    const leaderboard = Object.keys(scoreMap).map(uid => ({
      userId: uid, name: nameMap[uid] || "Unknown", score: scoreMap[uid], verified: verifiedMap[uid] || false,
    })).sort((a, b) => b.score - a.score).slice(0, 5);
    res.json(leaderboard);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═════════════════════════════════════════════════════════════════════════════

app.get("/notifications/:userId", authMiddleware, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipientId: req.params.userId }).sort({ createdAt: -1 }).limit(20);
    res.json(notifications);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/notifications/:userId/read", authMiddleware, async (req, res) => {
  try { await Notification.updateMany({ recipientId: req.params.userId }, { read: true }); res.json({ message: "Marked as read" }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// PROFILE
// ═════════════════════════════════════════════════════════════════════════════

app.get("/profile/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    const posts      = await Post.find({ userId: req.params.userId, anonymous: false }).sort({ createdAt: -1 });
    const trustScore = posts.reduce((t, p) => t + p.trustUpvotes.length - p.trustDownvotes.length, 0);
    res.json({
      user: { id: user._id, name: user.name, area: user.area, bio: user.bio || "", verified: user.verified, aadhaarStatus: user.aadhaarStatus, badges: user.badges || [], warnings: user.warnings, banned: user.banned, createdAt: user.createdAt },
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
    await User.findByIdAndUpdate(req.params.userId, { bio: req.body.bio?.slice(0, 160) || "" });
    res.json({ message: "Bio updated" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═════════════════════════════════════════════════════════════════════════════
// START
// ═════════════════════════════════════════════════════════════════════════════

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));
