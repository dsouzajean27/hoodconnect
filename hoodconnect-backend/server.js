const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");
const geocoder = require("./geocoder");

const app = express();

// ================= MIDDLEWARE =================
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// ================= MODELS =================
const User = require("./models/user");
const Post = require("./models/post");

// ================= DB =================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("connected to mongodb"))
  .catch((err) => console.log(err));

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
        id: user._id
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
      let fullAddress = "Unknown";
      let city = "Unknown";

      try {
        const geoData = await geocoder.reverse({
          lat: parseFloat(latitude),
          lon: parseFloat(longitude),
        });

       if (geoData && geoData[0]) {

        // ✅ FULL ADDRESS (MAIN THING)
        fullAddress = geoData[0].formattedAddress;

        // ✅ KEEP CITY ALSO (for filters)
        city =
          geoData[0].city ||
          geoData[0].town ||
          geoData[0].state ||
          "Unknown";
}
      } catch (err) {
        console.log("Geocoder error:", err);
      }

      // ================= CREATE POST =================
      const post = new Post({
      title,
      content,
      location: fullAddress, // 🔥 THIS IS THE FIX
      city,
      type,
      latitude,
      longitude,
      userId: isAnonymous ? null : userId,
      userName: isAnonymous ? "Anonymous" : userName,
      anonymous: isAnonymous,
      alert: isAlert,

      geo: {
        type: "Point",
        coordinates: [
          parseFloat(longitude),
          parseFloat(latitude),
        ],
      },

      image: req.files?.image?.[0]?.filename,
      video: req.files?.video?.[0]?.filename,
    });

      await post.save();

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
app.listen(8000, () => {
  console.log("Server started on port 8000");
});