const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const geocoder = require("./geocoder");
const bcrypt = require("bcrypt");
const fs = require("fs");
const http = require("http");
const { Server } = require("socket.io");


if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://hoodconnect.vercel.app",
  },
});

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // 🟣 JOIN ROOM (CITY)
  socket.on("joinRoom", ({ area }) => {
    socket.join(area);
    socket.area = area;

    console.log("User joined room:", area);
  });

  // 🟢 SAVE LOCATION
  socket.on("joinLocation", ({ latitude, longitude }) => {
    socket.latitude = latitude;
    socket.longitude = longitude;
  });

  // 🔥 NEW POST LOGIC (ROOM + DISTANCE)
  socket.on("newPost", (post) => {
    const room = post.city; // IMPORTANT: post must include city

    // Step 1: only send to city room
    io.to(room).emit("newPost", post);

    // Step 2: (optional upgrade) filter inside room
    io.to(room).sockets.forEach((s) => {
      if (!s.latitude || !s.longitude) return;

      const distance = getDistance(
        s.latitude,
        s.longitude,
        post.targetLat,
        post.targetLng
      );

      if (distance <= 5) {
        s.emit("newPost", post);
      }
    });
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});


// ================= MIDDLEWARE =================

app.use(cors({
  origin: ["https://hoodconnect.vercel.app"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// 🔥 VERY IMPORTANT (handles preflight)

app.use(express.json());
app.use("/uploads", express.static("uploads"));

//TEST
app.get("/", (req, res) => {
  res.send("HoodConnect Backend is running 🚀");
});

// ================= MODELS =================
const User = require("./models/user");
const Post = require("./models/post");

// ================= DB =================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("connected to mongodb"))
  .catch((err) => {
    console.log("MONGO ERROR:", err);
    process.exit(1); // 👈 force visible crash log
  });

// ================= MULTER =================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "-" + file.originalname),
});

const upload = multer({ storage });

// ================= REGISTER =================
app.post("/register", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    const newUser = new User({
      ...req.body,
      area: req.body.area,
      password: hashedPassword,
    });

    await newUser.save();
    res.json({ message: "User registered" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= LOGIN =================
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Wrong password" });
    } 

    // ✅ RETURN USER DATA TO FRONTEND
    res.json({
      message: "Login success",
      user: {
        name: user.name,
        email: user.email,
        id: user._id,
        area: user.area, // ✅ ADD THIS
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================= CREATE POST (FIXED + CITY DETECTION) =================
app.post(
  "/posts",
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
      } = req.body;

       const isAnonymous = anonymous === "true";
       const isAlert = alert === "true";
      
      console.log("userName:", userName);
      console.log("anonymous:", anonymous);
      console.log("isAnonymous:", isAnonymous);
      

      if (!latitude || !longitude) {
        return res.status(400).json({ message: "Missing location" });
      }

      // ================= GEO CODING =================
      let originAddress = "Unknown";
      let targetAddress = "Unknown";

      let originLat = latitude;
      let originLng = longitude;

      let targetLat = null;
      let targetLng = null;

      // ✅ ALWAYS SAVE USER REAL LOCATION
      if (latitude && longitude) {
        try {
          const geoData = await geocoder.reverse({
            lat: parseFloat(latitude),
            lon: parseFloat(longitude),
          });

          if (geoData && geoData[0]) {
            originAddress = geoData[0].formattedAddress;
          }
        } catch (err) {
          console.log("Origin geocode error:", err);
        }
      }

      // ✅ IF USER TYPES LOCATION → GET FULL ADDRESS + COORDS
      if (location && location !== "Unknown") {
        try {
          const geoData = await geocoder.geocode(location);

          if (geoData && geoData[0]) {
            targetLat = geoData[0].latitude;
            targetLng = geoData[0].longitude;
            targetAddress = geoData[0].formattedAddress;
          }
        } catch (err) {
          console.log("Target geocode error:", err);
        }
      }

      // ✅ IF USER DID NOT ENTER LOCATION → USE THEIR CURRENT LOCATION
      // FINAL SAFETY CHECK
        if (!targetLat || !targetLng) {
          targetLat = originLat;
          targetLng = originLng;
          targetAddress = originAddress;
        }

      // ================= CREATE POST =================
      const post = new Post({
        title,
        content,

        // ✅ BOTH LOCATIONS
        originAddress,
        targetAddress,

        originLat: parseFloat(originLat),
        originLng: parseFloat(originLng),

        targetLat: targetLat ? parseFloat(targetLat) : null,
        targetLng: targetLng ? parseFloat(targetLng) : null,

        type,

        userId: isAnonymous ? null : userId,
        userName: isAnonymous ? "Anonymous" : userName,
        anonymous: isAnonymous,
        alert: isAlert,
        priority: req.body.priority || "low",

        // ✅ MAP WILL USE TARGET LOCATION IF EXISTS
        geo: {
          type: "Point",
          coordinates: targetLat
            ? [parseFloat(targetLng), parseFloat(targetLat)]
            : [parseFloat(originLng), parseFloat(originLat)],
        },

        image: req.files?.image?.[0]?.filename,
        video: req.files?.video?.[0]?.filename,
      });

      await post.save();

        // ✅ decide area (for now simple fallback)
        const area = req.body.area || "mumbai";

        post.area = area; // attach to object (optional)

        // 🔥 SEND ONLY TO THAT ROOM
        io.to(area).emit("newPost", post);

        console.log("Emitted to room:", area);

      res.json(post);
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ================= NEARBY POSTS =================
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
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});

// ================= LIKE / UNLIKE =================
app.put("/posts/:id/like", async (req, res) => {
  try {
    const { userId } = req.body;

    const post = await Post.findById(req.params.id);

    if (!post) return res.status(404).json({ message: "Post not found" });

    const alreadyLiked = post.likes.includes(userId);

    if (alreadyLiked) {
      post.likes = post.likes.filter((id) => id.toString() !== userId);
    } else {
      post.likes.push(userId);
    }

    await post.save();
    res.json(post);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ================= ADD COMMENT =================
app.post("/posts/:id/comment", async (req, res) => {
  try {
    const { text, userName } = req.body;

    const post = await Post.findById(req.params.id);

    post.comments.push({ text, userName });

    await post.save();

    res.json(post);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/posts/:id", async (req, res) => {
  try {
    const updatedPost = await Post.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json(updatedPost);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/posts/:id", async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: "Post deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

//===============TRUST ========================
app.put("/posts/:id/trust", async (req, res) => {
  try {
    const { userId, type } = req.body;

    const post = await Post.findById(req.params.id);

    if (!post) return res.status(404).json({ message: "Post not found" });

    // remove from both first
    post.trustUpvotes = post.trustUpvotes.filter(
      (id) => id.toString() !== userId
    );
    post.trustDownvotes = post.trustDownvotes.filter(
      (id) => id.toString() !== userId
    );

    if (type === "up") {
      post.trustUpvotes.push(userId);
    } else {
      post.trustDownvotes.push(userId);
    }

    await post.save();
    res.json(post);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ================= GET ALL POSTS =================
app.get("/posts", async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 }); // 🔥 newest first
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ================= START SERVER =================
server.listen(8000, () => {
  console.log("Server running with socket 🚀");
});