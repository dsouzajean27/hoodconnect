const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
const geocoder = require("./geocoder");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const http = require("http");
const { Server } = require("socket.io");

// ================= CLOUDINARY SETUP =================
// FIX: replaced local disk storage (ephemeral on Render) with Cloudinary.
// Run: npm install cloudinary multer-storage-cloudinary
// Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET to Render env vars.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
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

// ================= APP + SOCKET SETUP =================
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://hoodconnect.vercel.app",
    methods: ["GET", "POST"],
  },
});

// ================= HAVERSINE UTIL =================
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ================= AUTH MIDDLEWARE =================
// FIX: added JWT auth middleware. Protects edit, delete, like, trust, comment routes.
// Add JWT_SECRET to your Render env vars (any long random string).
function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // "Bearer <token>"
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
}

// ================= SOCKET LOGIC =================
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // FIX: only one join handler — area is always the normalized room key.
  socket.on("joinRoom", ({ area }) => {
    // Leave any previously joined rooms (except the socket's own room)
    for (const room of socket.rooms) {
      if (room !== socket.id) socket.leave(room);
    }
    const normalizedArea = area.toLowerCase().replace(/\s/g, "-");
    socket.join(normalizedArea);
    console.log(`${socket.id} joined room: ${normalizedArea}`);
  });

  socket.on("joinUserRoom", ({ userId }) => {
    socket.join(`user:${userId}`);
    console.log(`${socket.id} joined user room: user:${userId}`);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// ================= MIDDLEWARE =================
app.use(
  cors({
    origin: ["https://hoodconnect.vercel.app"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(express.json());

// TEST ROUTE
app.get("/", (req, res) => {
  res.send("HoodConnect Backend is running 🚀");
});

// ================= MODELS =================
const User = require("./models/user");
const Post = require("./models/post");
const Area = require("./models/area");
const Notification = require("./models/notification");
//GET /profile/:userId 


// ================= DB CONNECTION =================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => {
    console.log("MONGO ERROR:", err);
    process.exit(1);
  });

// ================= AUTH ROUTES =================
app.post("/register", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    // FIX: now correctly maps to the "area" field in the user schema.
    const area = (req.body.area || req.body.location || "unknown")
      .toLowerCase()
      .replace(/\s/g, "-");

    const newUser = new User({
      name: req.body.name,
      email: req.body.email,
      password: hashedPassword,
      area,
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

    // FIX: now returns a JWT token alongside the user object.
    // Frontend stores this token and sends it as Authorization header.
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      message: "Login success",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        area: user.area,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= POSTS ROUTES =================
app.post(
  "/posts",
  authMiddleware,
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        title,
        content,
        location,
        type,
        latitude,
        longitude,
        userId,
        userName,
        anonymous,
        alert,
        severity,
        area,
      } = req.body;

      const isAnonymous = anonymous === "true";
      const isAlert = alert === "true";

      if (!latitude || !longitude) {
        return res.status(400).json({ message: "Missing location" });
      }

      // GEOCODING
      let originAddress = "Unknown";
      let targetAddress = "Unknown";
      let targetLat = null;
      let targetLng = null;

      try {
        const geoData = await geocoder.reverse({
          lat: parseFloat(latitude),
          lon: parseFloat(longitude),
        });
        if (geoData?.[0]) originAddress = geoData[0].formattedAddress;
      } catch (err) {
        console.log("Origin geocode error:", err.message);
      }

      if (location && location !== "Unknown") {
        try {
          const geoData = await geocoder.geocode(location);
          if (geoData?.[0]) {
            targetLat = geoData[0].latitude;
            targetLng = geoData[0].longitude;
            targetAddress = geoData[0].formattedAddress;
          }
        } catch (err) {
          console.log("Target geocode error:", err.message);
        }
      }

      // Fall back to origin if no target geocoded
      if (!targetLat || !targetLng) {
        targetLat = parseFloat(latitude);
        targetLng = parseFloat(longitude);
        targetAddress = originAddress;
      }

      // FIX: area now comes from req.body.area (sent as user?.area from frontend),
      // NOT from location.toLowerCase() which was sending the address string as the room key.
      const normalizedArea = (area || "unknown")
        .toLowerCase()
        .replace(/\s/g, "-");

      // FIX: image/video are now Cloudinary URLs (req.files[x][0].path),
      // not local filenames. Cloudinary's multer storage puts the full URL in .path.
      const post = new Post({
        title,
        content,
        area: normalizedArea,
        originAddress,
        originLat: parseFloat(latitude),
        originLng: parseFloat(longitude),
        targetAddress,
        targetLat,
        targetLng,
        type,
        anonymous: isAnonymous,
        alert: isAlert,
        userName: isAnonymous ? "Anonymous" : userName,
        userId: isAnonymous ? null : userId,
        severity: severity || "low",
        geo: {
          type: "Point",
          coordinates: [targetLng, targetLat],
        },
        image: req.files?.image?.[0]?.path || null,
        video: req.files?.video?.[0]?.path || null,
      });

      await post.save();
      await saveArea(normalizedArea); 

      // Emit to the correct socket room
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/posts/nearby", async (req, res) => {
  try {
    const { lat, lng, radius = 5 } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ message: "Missing coordinates" });
    }
    const posts = await Post.find({
      geo: {
        $near: {
          $geometry: {
            type: "Point",
            coordinates: [parseFloat(lng), parseFloat(lat)],
          },
          $maxDistance: radius * 1000,
        },
      },
    });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// FIX: added the missing PUT /posts/:id edit route.
// Was called from handleEdit in Dashboard.jsx but didn't exist — caused silent failures.
app.put("/posts/:id", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    // Only the post author can edit
    if (post.userId?.toString() !== req.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    post.content = req.body.content || post.content;
    await post.save();
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/posts/:id", authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    // Only the post author can delete
    if (post.userId?.toString() !== req.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: "Post deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
      const notif = await Notification.create({
        recipientId: post.userId,
        senderId: userId,
        senderName: req.body.userName || "Someone",
        type: "like",
        postId: post._id,
        postTitle: post.title,
      });
      io.to(`user:${post.userId}`).emit("newNotification", notif);
    }

    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/posts/:id/comment", authMiddleware, async (req, res) => {
  try {

    const { text, userName } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    post.comments.push({ text, userName });
    await post.save();
    // After post.save(), add:
    if (post.userId && post.userId.toString() !== req.body.userId) {
      const notif = await Notification.create({
        recipientId: post.userId,
        senderId: req.body.userId || null,
        senderName: userName || "Someone",
        type: "comment",
        postId: post._id,
        postTitle: post.title,
      });
      io.to(`user:${post.userId}`).emit("newNotification", notif);
    }
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/posts/:id/trust", authMiddleware, async (req, res) => {
  try {
    const { userId, type } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });

    // Remove from both, then add to the chosen one (toggle logic)
    post.trustUpvotes = post.trustUpvotes.filter(
      (id) => id.toString() !== userId
    );
    post.trustDownvotes = post.trustDownvotes.filter(
      (id) => id.toString() !== userId
    );

    if (type === "up") post.trustUpvotes.push(userId);
    else post.trustDownvotes.push(userId);

    await post.save();
    // After post.save(), add:
    if (post.userId && post.userId.toString() !== userId) {
      const notif = await Notification.create({
        recipientId: post.userId,
        senderId: userId,
        senderName: req.body.userName || "Someone",
        type: "trust",
        postId: post._id,
        postTitle: post.title,
      });
      io.to(`user:${post.userId}`).emit("newNotification", notif);
    }
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/areas", authMiddleware, async (req, res) => {
  try {
    const name = req.body.name?.toLowerCase().replace(/\s/g, "-");
    if (!name) return res.status(400).json({ message: "Name required" });
    const area = await Area.findOneAndUpdate(
      { name },
      { name },
      { upsert: true, new: true }
    );
    res.json(area);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
//==============area=====================

// Get all areas for the dropdown
app.get("/areas", async (req, res) => {
  try {
    const areas = await Area.find().sort({ name: 1 });
    res.json(areas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save area if it doesn't exist (called internally)
async function saveArea(name) {
  try {
    await Area.findOneAndUpdate(
      { name },
      { name },
      { upsert: true, new: true }
    );
  } catch (err) {
    console.log("saveArea error:", err.message);
  }
}

//==================notifs=============
// Get notifications for a user
app.get("/notifications/:userId", authMiddleware, async (req, res) => {
  try {
    const notifications = await Notification.find({
      recipientId: req.params.userId
    }).sort({ createdAt: -1 }).limit(20);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark all as read
app.put("/notifications/:userId/read", authMiddleware, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipientId: req.params.userId },
      { read: true }
    );
    res.json({ message: "Marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//=================profile userid==================
app.get("/profile/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    const posts = await Post.find({ 
      userId: req.params.userId,
      anonymous: false  // don't show anonymous posts on profile
    }).sort({ createdAt: -1 });

    // Calculate trust score across all posts
    const trustScore = posts.reduce((total, post) => {
      return total + post.trustUpvotes.length - post.trustDownvotes.length;
    }, 0);

    res.json({
      user: {
        id: user._id,
        name: user.name,
        area: user.area,
        createdAt: user.createdAt,
      },
      posts,
      trustScore,
      postCount: posts.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/users/:userId/area", authMiddleware, async (req, res) => {
  try {
    if (req.userId !== req.params.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }
    const area = req.body.area?.toLowerCase().replace(/\s/g, "-");
    await User.findByIdAndUpdate(req.params.userId, { area });
    await saveArea(area);
    res.json({ message: "Area updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});
