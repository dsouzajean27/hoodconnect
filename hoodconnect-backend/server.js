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
const webpush    = require("web-push");   // NEW — npm install web-push

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

// ── Web Push setup ─────────────────────────────────────────────────────────────
// Run once: node -e "const wp=require('web-push');console.log(wp.generateVAPIDKeys())"
// Then add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to your Render env vars.
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:admin@hoodconnect.app",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

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

// ══════════════════════════════════════════════════════════════════════════════
// NEW — MUMBAI AREA MASTER LIST + FUZZY MATCHING
// Prevents "rustomjee azziano" and "rustomjee acura" from creating separate
// rooms — both get resolved to "rustomjee" (or whichever canonical area fits).
// ══════════════════════════════════════════════════════════════════════════════
const MUMBAI_AREAS = [
  // Western suburbs
  "andheri","andheri-west","andheri-east",
  "bandra","bandra-west","bandra-east","bandra-kurla-complex",
  "borivali","borivali-west","borivali-east",
  "malad","malad-west","malad-east",
  "kandivali","kandivali-west","kandivali-east",
  "goregaon","goregaon-west","goregaon-east",
  "jogeshwari","jogeshwari-west","jogeshwari-east",
  "vile-parle","vile-parle-west","vile-parle-east",
  "santacruz","santacruz-west","santacruz-east",
  "khar","khar-west","juhu","versova","lokhandwala",
  "four-bungalows","seven-bungalows","oshiwara","link-road","sv-road",
  "dahisar","mira-road","bhayander","naigaon","vasai","virar",
  // Thane belt
  "thane","thane-west","thane-east","ghodbunder-road",
  "majiwada","pokhran","teen-hath-naka","hiranandani-estate",
  "mulund","mulund-west","mulund-east","bhandup","kanjurmarg","nahur",
  "ghatkopar","ghatkopar-west","ghatkopar-east",
  "vikhroli","vikhroli-west","vikhroli-east",
  // Central
  "kurla","chunabhatti","sion","matunga","dadar","dadar-west","dadar-east",
  "parel","lower-parel","worli","mahim","dharavi",
  "chembur","govandi","mankhurd","trombay",
  "powai","hiranandani","chandivali","sakinaka","marol","chakala",
  // Navi Mumbai
  "kharghar","nerul","vashi","koparkhairane","ghansoli",
  "airoli","rabale","mahape","belapur","panvel","ulwe","kamothe",
  // South Mumbai
  "colaba","cuffe-parade","fort","churchgate","marine-lines",
  "grant-road","byculla","nagpada","dongri","bhendi-bazaar","cst","mumbai-central",
  "breach-candy","malabar-hill","pedder-road","tardeo","nariman-point","wadala",
  // Far suburbs
  "kalyan","dombivali","ambernath","badlapur","ulhasnagar","bhiwandi",
  // Common residential project names → map to parent area
  "rustomjee","lodha","godrej-hill","vasant-vihar","oberoi-garden","raheja",
];

// Build flat-key → canonical name map for O(1) lookup
const AREA_FLAT_MAP = {};
MUMBAI_AREAS.forEach(a => { AREA_FLAT_MAP[a.replace(/-/g, "")] = a; });

/**
 * Given any free-text input, return the best canonical Mumbai area.
 * Strategy (in order):
 *   1. Exact match
 *   2. Flat-key lookup (strips hyphens)
 *   3. Input starts with a known area name ("rustomjee-azziano" → "rustomjee")
 *   4. Known area starts with input prefix ("andh" → "andheri")
 *   5. Substring match either direction
 *   6. Fallback — return cleaned input (new area created as-is)
 */
function fuzzyMatchArea(input) {
  if (!input) return null;
  const q    = input.toLowerCase().trim().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "");
  const flat = q.replace(/-/g, "");

  if (MUMBAI_AREAS.includes(q))  return q;
  if (AREA_FLAT_MAP[flat])       return AREA_FLAT_MAP[flat];

  // Input starts with a known area ("rustomjee-azziano" → "rustomjee")
  const byInputPrefix = MUMBAI_AREAS.find(a => flat.startsWith(a.replace(/-/g, "")));
  if (byInputPrefix) return byInputPrefix;

  // Known area starts with input ("andh" → "andheri")
  const byAreaPrefix = MUMBAI_AREAS.find(a => a.replace(/-/g,"").startsWith(flat.slice(0, 6)));
  if (byAreaPrefix) return byAreaPrefix;

  // Substring match
  const sub = MUMBAI_AREAS.find(a => {
    const af = a.replace(/-/g, "");
    return af.includes(flat.slice(0, 5)) || flat.includes(af.slice(0, 5));
  });
  if (sub) return sub;

  return q; // fallback — creates a new area slug
}

// ── NEW — push notification helper ───────────────────────────────────────────
// Sends a push notification to every subscriber in a given area.
// Only called for emergency broadcasts, so sound/requireInteraction is set in sw.js.
async function sendPushToArea(area, payload) {
  if (!process.env.VAPID_PUBLIC_KEY) return; // push not configured — skip silently
  try {
    const subs = await Subscription.find({ area });
    await Promise.all(subs.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        JSON.stringify(payload)
      ).catch(async err => {
        // 410 Gone = subscription expired — clean it up
        if (err.statusCode === 410) await Subscription.findByIdAndDelete(sub._id);
      })
    ));
  } catch (err) { console.log("sendPushToArea:", err.message); }
}

// ══════════════════════════════════════════════════════════════════════════════
// BADGE LOGIC  (unchanged from your current code)
// ══════════════════════════════════════════════════════════════════════════════
async function checkAndGrantBadges(userId) {
  try {
    const user  = await User.findById(userId);
    if (!user || user.banned) return;
    const posts = await Post.find({ userId, anonymous: false });
    const newBadges = [];

    if (user.aadhaarStatus === "verified")                              newBadges.push("verified_citizen");
    if (posts.filter(p => p.type === "emergency").length >= 3)         newBadges.push("first_responder");
    if (posts.length >= 20)                                            newBadges.push("active_contributor");

    const trustScore   = posts.reduce((t,p) => t + p.trustUpvotes.length - p.trustDownvotes.length, 0);
    const totalUpvotes = posts.reduce((t,p) => t + p.trustUpvotes.length, 0);

    if (trustScore >= 50) {
      newBadges.push("top_of_area");
      if (!user.verified) await User.findByIdAndUpdate(userId, { verified: true });
    }
    if (totalUpvotes >= 25) newBadges.push("truth_seeker");

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    if (user.createdAt < sixMonthsAgo) newBadges.push("old_timer");
    if (posts.length >= 1)             newBadges.push("newcomer");

    if (newBadges.length > 0)
      await User.findByIdAndUpdate(userId, { $addToSet: { badges: { $each: newBadges } } });
  } catch (err) { console.log("checkAndGrantBadges:", err.message); }
}

// ── Socket ────────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", ({ area }) => {
    for (const room of socket.rooms) { if (room !== socket.id) socket.leave(room); }
    // NEW — canonicalise before joining so "rustomjee-azziano" → "rustomjee"
    const canonical = fuzzyMatchArea(area) || area.toLowerCase().replace(/\s/g, "-");
    socket.join(canonical);
  });

  socket.on("joinUserRoom", ({ userId }) => { socket.join(`user:${userId}`); });

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
const Subscription = require("./models/subscription"); // NEW model (see below)

// ── DB + seed Mumbai areas ────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("Connected to MongoDB");
    // NEW — seed all Mumbai areas so they exist for recommendations
    for (const name of MUMBAI_AREAS) {
      await Area.findOneAndUpdate({ name }, { name }, { upsert: true }).catch(() => {});
    }
    console.log(`Mumbai areas seeded (${MUMBAI_AREAS.length}) ✅`);
  })
  .catch(err => { console.log("MONGO ERROR:", err); process.exit(1); });

// ══════════════════════════════════════════════════════════════════════════════
// AUTH  (unchanged — only area normalisation added)
// ══════════════════════════════════════════════════════════════════════════════
app.post("/register", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const rawArea  = req.body.area || req.body.location || "unknown";
    // NEW — fuzzy-match the area on registration
    const area     = fuzzyMatchArea(rawArea) || rawArea.toLowerCase().replace(/\s/g, "-");
    const aadhaarLast4 = req.body.aadhaarLast4 || null;
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

// ══════════════════════════════════════════════════════════════════════════════
// AREAS — existing routes preserved + 2 new routes added
// ══════════════════════════════════════════════════════════════════════════════
app.get("/areas", async (req, res) => {
  try { res.json(await Area.find().sort({ name: 1 })); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// NEW — fuzzy search: GET /areas/search?q=rustomjee  →  up to 8 suggestions
app.get("/areas/search", async (req, res) => {
  try {
    const q = (req.query.q || "").toLowerCase().trim();
    if (!q) return res.json([]);
    const canonical    = fuzzyMatchArea(q);
    const regex        = q.replace(/[-\s]+/g, ".*");
    const dbHits       = await Area.find({ name: { $regex: regex, $options: "i" } }).limit(8);
    const canonicalDoc = canonical ? await Area.findOne({ name: canonical }) : null;
    const combined     = canonicalDoc
      ? [canonicalDoc, ...dbHits.filter(a => a.name !== canonical)].slice(0, 8)
      : dbHits;
    res.json(combined);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /areas/nearby?lat=&lng=&radius=20 — existing route, fixed return shape
app.get("/areas/nearby", async (req, res) => {
  try {
    const { lat, lng, radius = 20 } = req.query;
    if (!lat || !lng) return res.status(400).json({ message: "lat and lng required" });

    const posts = await Post.find({
      geo: {
        $near: {
          $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: parseFloat(radius) * 1000,
        },
      },
    }).select("area targetLat targetLng originLat originLng");

    // Group by area, count posts, compute closest distance
    const areaMap = {};
    for (const p of posts) {
      const pLat = p.targetLat || p.originLat;
      const pLng = p.targetLng || p.originLng;
      if (!p.area || !pLat || !pLng) continue;
      const toRad = v => v * Math.PI / 180;
      const R = 6371;
      const dLat = toRad(pLat - parseFloat(lat)), dLon = toRad(pLng - parseFloat(lng));
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(parseFloat(lat))) * Math.cos(toRad(pLat)) * Math.sin(dLon/2)**2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      if (!areaMap[p.area]) areaMap[p.area] = { area: p.area, count: 0, minDist: dist };
      areaMap[p.area].count++;
      if (dist < areaMap[p.area].minDist) areaMap[p.area].minDist = dist;
    }

    const result = Object.values(areaMap)
      .sort((a, b) => a.minDist - b.minDist)
      .slice(0, 8)
      .map(a => ({
        name:     a.area,
        label:    a.area.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        count:    a.count,
        distance: parseFloat(a.minDist.toFixed(1)),
      }));

    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/areas", authMiddleware, async (req, res) => {
  try {
    // NEW — fuzzy-match the submitted area name
    const name = fuzzyMatchArea(req.body.name) || req.body.name?.toLowerCase().replace(/\s/g, "-");
    if (!name) return res.status(400).json({ message: "Name required" });
    const area = await Area.findOneAndUpdate({ name }, { name }, { upsert: true, new: true });
    res.json(area);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function saveArea(name) {
  try { await Area.findOneAndUpdate({ name }, { name }, { upsert: true, new: true }); }
  catch (err) { console.log("saveArea:", err.message); }
}

// ══════════════════════════════════════════════════════════════════════════════
// NEW — PUSH NOTIFICATION ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// Return VAPID public key to frontend
app.get("/push/vapid-key", (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || "" });
});

// Save a push subscription for the current user
app.post("/push/subscribe", authMiddleware, async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    const user = await User.findById(req.userId).select("area");
    await Subscription.findOneAndUpdate(
      { endpoint },
      { userId: req.userId, area: user?.area || "unknown", endpoint, keys },
      { upsert: true, new: true }
    );
    res.json({ message: "Subscribed" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Remove a push subscription
app.post("/push/unsubscribe", authMiddleware, async (req, res) => {
  try {
    await Subscription.deleteOne({ endpoint: req.body.endpoint });
    res.json({ message: "Unsubscribed" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN — AADHAAR  (unchanged)
// ══════════════════════════════════════════════════════════════════════════════
app.get("/admin/aadhaar-pending", adminMiddleware, async (req, res) => {
  try {
    res.json(await User.find({ aadhaarStatus: "pending" }).select("name email area aadhaarLast4 aadhaarStatus createdAt").sort({ createdAt: -1 }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/admin/aadhaar/:userId/approve", adminMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.userId, { aadhaarStatus: "verified" });
    await checkAndGrantBadges(req.params.userId);
    res.json({ message: "Aadhaar verified" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/admin/aadhaar/:userId/reject", adminMiddleware, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.userId, {
      aadhaarStatus: "rejected",
      aadhaarRejectionReason: req.body.reason || "Does not meet requirements",
    });
    res.json({ message: "Aadhaar rejected" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN — USER & POST MODERATION  (search + area filter added)
// ══════════════════════════════════════════════════════════════════════════════
app.get("/admin/reported-users", adminMiddleware, async (req, res) => {
  try {
    // NEW — optional ?search= and ?area= query params
    const q = { reportCount: { $gt: 0 } };
    if (req.query.area)   q.area = req.query.area;
    if (req.query.search) q.$or  = [
      { name:  { $regex: req.query.search, $options: "i" } },
      { email: { $regex: req.query.search, $options: "i" } },
    ];
    res.json(await User.find(q).select("name email area reportCount warnings banned createdAt").sort({ reportCount: -1 }));
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

app.get("/admin/reported-posts", adminMiddleware, async (req, res) => {
  try {
    // NEW — optional ?search= and ?area= query params
    const q = { reportCount: { $gt: 0 } };
    if (req.query.area)   q.area = req.query.area;
    if (req.query.search) q.$or  = [
      { title:   { $regex: req.query.search, $options: "i" } },
      { content: { $regex: req.query.search, $options: "i" } },
    ];
    res.json(await Post.find(q).sort({ reportCount: -1 }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/admin/posts/:id", adminMiddleware, async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: "Post deleted by admin" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/admin/posts/:id/dismiss-report", adminMiddleware, async (req, res) => {
  try {
    await Post.findByIdAndUpdate(req.params.id, { reportCount: 0, reportedBy: [] });
    res.json({ message: "Report dismissed" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// NEW — Admin analytics endpoint
app.get("/admin/analytics", adminMiddleware, async (req, res) => {
  try {
    const day7 = new Date(Date.now() - 7 * 86400000);

    const [
      postsPerDay, reportsPerDay, usersPerArea, postTypes,
      totalUsers, totalPosts, newUsers7d, totalReportsArr,
    ] = await Promise.all([
      Post.aggregate([
        { $match: { createdAt: { $gte: day7 } } },
        { $group: { _id: { $dateToString: { format: "%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      Post.aggregate([
        { $match: { reportCount: { $gt: 0 }, updatedAt: { $gte: day7 } } },
        { $group: { _id: { $dateToString: { format: "%m-%d", date: "$updatedAt" } }, count: { $sum: "$reportCount" } } },
        { $sort: { _id: 1 } },
      ]),
      User.aggregate([
        { $group: { _id: "$area", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      Post.aggregate([{ $group: { _id: "$type", count: { $sum: 1 } } }]),
      User.countDocuments(),
      Post.countDocuments(),
      User.countDocuments({ createdAt: { $gte: day7 } }),
      Post.aggregate([{ $group: { _id: null, total: { $sum: "$reportCount" } } }]),
    ]);

    res.json({
      postsPerDay, reportsPerDay, usersPerArea, postTypes,
      summary: {
        totalUsers, totalPosts,
        newUsers7d,
        totalReports: totalReportsArr[0]?.total || 0,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════════════════════════════════════════════════════════
// POSTS  (area fuzzy-match + emergency push added; everything else unchanged)
// ══════════════════════════════════════════════════════════════════════════════
app.post("/posts", authMiddleware,
  upload.fields([{ name: "image", maxCount: 1 }, { name: "video", maxCount: 1 }]),
  async (req, res) => {
    try {
      const {
        title, content, location, type,
        latitude, longitude, userId, userName,
        anonymous, alert, severity, area,
        geotagged, captureLat, captureLng, captureAddress,
        isPoll, pollOptions, pollEndsAt,
      } = req.body;

      const isAnonymous = anonymous === "true";
      const isAlert     = alert     === "true";
      const isGeotagged = geotagged === "true";
      const isPollPost  = isPoll    === "true";

      if (!latitude || !longitude) return res.status(400).json({ message: "Missing location" });

      let originAddress = "Unknown", targetAddress = "Unknown", targetLat = null, targetLng = null;
      try {
        const g = await geocoder.reverse({ lat: parseFloat(latitude), lon: parseFloat(longitude) });
        if (g?.[0]) originAddress = g[0].formattedAddress;
      } catch {}
      if (location && location !== "Unknown") {
        try {
          const g = await geocoder.geocode(location);
          if (g?.[0]) { targetLat = g[0].latitude; targetLng = g[0].longitude; targetAddress = g[0].formattedAddress; }
        } catch {}
      }
      if (!targetLat || !targetLng) { targetLat = parseFloat(latitude); targetLng = parseFloat(longitude); targetAddress = originAddress; }

      // NEW — fuzzy-match the area
      const normalizedArea = fuzzyMatchArea(area || "unknown") || (area || "unknown").toLowerCase().replace(/\s/g, "-");

      let parsedPollOptions = [];
      if (isPollPost && pollOptions) {
        try {
          const opts = typeof pollOptions === "string" ? JSON.parse(pollOptions) : pollOptions;
          parsedPollOptions = opts.filter(o => o.trim()).map(text => ({ text: text.trim(), votes: [] }));
        } catch {}
      }

      const post = new Post({
        title, content,
        area:           normalizedArea,
        originAddress,  originLat: parseFloat(latitude),  originLng: parseFloat(longitude),
        targetAddress,  targetLat, targetLng,
        type,
        anonymous:      isAnonymous,
        alert:          isAlert,
        userName:       isAnonymous ? "Anonymous" : userName,
        userId:         isAnonymous ? null : userId,
        severity:       severity || "low",
        geo:            { type: "Point", coordinates: [targetLng, targetLat] },
        image:          req.files?.image?.[0]?.path || null,
        video:          req.files?.video?.[0]?.path || null,
        geotagged:      isGeotagged,
        captureLat:     captureLat  ? parseFloat(captureLat)  : null,
        captureLng:     captureLng  ? parseFloat(captureLng)  : null,
        captureAddress: captureAddress || null,
        isPoll:         isPollPost,
        pollOptions:    parsedPollOptions,
        pollEndsAt:     pollEndsAt ? new Date(pollEndsAt) : null,
      });

      await post.save();
      await saveArea(normalizedArea);
      if (!isAnonymous && userId) await checkAndGrantBadges(userId);
      io.to(normalizedArea).emit("newPost", post);

      if (isAlert && type === "emergency") {
        const broadcastData = {
          postId: post._id, title: post.title, content: post.content,
          address: post.targetAddress || post.originAddress,
          lat: targetLat, lng: targetLng,
          severity: severity || "low",
          userName: isAnonymous ? "Anonymous" : userName,
        };
        io.to(normalizedArea).emit("emergencyBroadcast", broadcastData);

        // NEW — send push notification only to users in this area, with sound
        await sendPushToArea(normalizedArea, {
          type:  "emergency",
          title: `🚨 EMERGENCY in ${normalizedArea.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}`,
          body:  post.title,
          url:   "/dashboard",
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

app.post("/posts/:id/comment", authMiddleware, async (req, res) => {
  try {
    const { text, userName, userId } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
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

app.put("/posts/:id/comments/:commentId/like", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    const post    = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });
    const already = comment.likes.some(id => id.toString() === userId);
    comment.likes = already ? comment.likes.filter(id => id.toString() !== userId) : [...comment.likes, userId];
    await post.save();
    res.json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
    if (comment.userId && comment.userId.toString() !== userId) {
      const notif = await Notification.create({ recipientId: comment.userId, senderId: userId || null, senderName: userName || "Someone", type: "comment", postId: post._id, postTitle: post.title });
      io.to(`user:${comment.userId}`).emit("newNotification", notif);
    }
    res.json(post);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/posts/:id/comments/:commentId/replies/:replyId/like", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    const post    = await Post.findById(req.params.id);
    const comment = post?.comments.id(req.params.commentId);
    const reply   = comment?.replies.id(req.params.replyId);
    if (!reply) return res.status(404).json({ message: "Reply not found" });
    const already = reply.likes.some(id => id.toString() === userId);
    reply.likes = already ? reply.likes.filter(id => id.toString() !== userId) : [...reply.likes, userId];
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

app.put("/posts/:id/poll/:optionId", authMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post || !post.isPoll) return res.status(404).json({ message: "Poll not found" });
    if (post.pollEndsAt && new Date() > new Date(post.pollEndsAt))
      return res.status(400).json({ message: "Poll has ended" });
    for (const opt of post.pollOptions) opt.votes = opt.votes.filter(id => id.toString() !== userId);
    const target = post.pollOptions.id(req.params.optionId);
    if (!target) return res.status(404).json({ message: "Option not found" });
    target.votes.push(userId);
    await post.save();
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

// ── Bookmarks ─────────────────────────────────────────────────────────────────
app.put("/posts/:id/bookmark", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    const postId  = req.params.id;
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

// ── Leaderboard ───────────────────────────────────────────────────────────────
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

// ── Notifications ─────────────────────────────────────────────────────────────
app.get("/notifications/:userId", authMiddleware, async (req, res) => {
  try { res.json(await Notification.find({ recipientId: req.params.userId }).sort({ createdAt: -1 }).limit(20)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/notifications/:userId/read", authMiddleware, async (req, res) => {
  try { await Notification.updateMany({ recipientId: req.params.userId }, { read: true }); res.json({ message: "Marked as read" }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DM / Chat ─────────────────────────────────────────────────────────────────
app.get("/conversations/:userId", authMiddleware, async (req, res) => {
  try {
    const uid      = req.params.userId;
    const messages = await Message.find({ $or: [{ senderId: uid }, { receiverId: uid }] }).sort({ createdAt: -1 });
    const seen     = new Map();
    for (const msg of messages) {
      const otherId = msg.senderId.toString() === uid ? msg.receiverId.toString() : msg.senderId.toString();
      if (!seen.has(otherId)) seen.set(otherId, msg);
    }
    const partnerUsers = await User.find({ _id: { $in: [...seen.keys()] } }).select("name area badges verified");
    const conversations = partnerUsers.map(u => ({
      userId:      u._id,
      name:        u.name,
      area:        u.area,
      badges:      u.badges || [],
      verified:    u.verified,
      lastMessage: seen.get(u._id.toString()),
      unread: messages.filter(m => m.senderId.toString() === u._id.toString() && m.receiverId.toString() === uid && !m.read).length,
    }));
    res.json(conversations);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get("/messages/:userId/:otherId", authMiddleware, async (req, res) => {
  try {
    const { userId, otherId } = req.params;
    const messages = await Message.find({
      $or: [{ senderId: userId, receiverId: otherId }, { senderId: otherId, receiverId: userId }],
    }).sort({ createdAt: 1 }).limit(100);
    await Message.updateMany({ senderId: otherId, receiverId: userId, read: false }, { read: true });
    res.json(messages);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/messages", authMiddleware, async (req, res) => {
  try {
    const { receiverId, text } = req.body;
    if (!receiverId || !text?.trim()) return res.status(400).json({ message: "receiverId and text required" });
    const msg  = await Message.create({ senderId: req.userId, receiverId, text: text.trim() });
    const room = [req.userId.toString(), receiverId.toString()].sort().join("_");
    io.to(`chat:${room}`).emit("newMessage", msg);
    io.to(`user:${receiverId}`).emit("newDM", { from: req.userId, message: msg });
    res.json(msg);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Profile ───────────────────────────────────────────────────────────────────
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
    // NEW — fuzzy-match on area update
    const area = fuzzyMatchArea(req.body.area) || req.body.area?.toLowerCase().replace(/\s/g, "-");
    await User.findByIdAndUpdate(req.params.userId, { area });
    await saveArea(area);
    res.json({ message: "Area updated", area });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/users/:userId/bio", authMiddleware, async (req, res) => {
  try {
    if (req.userId !== req.params.userId) return res.status(403).json({ message: "Not authorized" });
    await User.findByIdAndUpdate(req.params.userId, { bio: req.body.bio?.slice(0, 160) || "" });
    res.json({ message: "Bio updated" });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));
