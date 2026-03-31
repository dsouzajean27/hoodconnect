# HoodConnect 🌍🚀

**HoodConnect** is a smart hyperlocal community platform that connects people within their neighborhood in real-time.  
It enables users to share updates, alerts, and events based on their live location.

---

## ✨ Key Highlights

- 📍 **Live Location-Based Feed**  
  View posts happening around you within a specific radius.

- 🚨 **Emergency Alert System**  
  Instantly broadcast urgent alerts to nearby users.

- 🧭 **Smart Nearby Filter (5km radius)**  
  Discover what's happening around you using geolocation.

- 💬 **Interactive Community**  
  Like and comment on posts to stay engaged.

- 🕶️ **Anonymous Posting**  
  Share sensitive information without revealing identity.

- 📸 **Media Sharing**  
  Upload images and videos with posts.

- 🔎 **Location Search & Filters**  
  Filter posts by type (Emergency, Events, Casual, Promo).

- ⚡ **Real-Time Alert Detection**  
  Automatic pop-up alerts for emergency posts.

---

## 🧠 Advanced Features (What makes it stand out)

- 🌐 Reverse Geocoding (Auto-detect user address)
- 📡 GeoSpatial Queries using MongoDB (2dsphere indexing)
- 📍 Distance-based filtering (Haversine formula)
- 🧩 Modular full-stack architecture
- 🔄 Dynamic UI with React Hooks

---

## 🛠️ Tech Stack

| Layer      | Technology |
|-----------|-----------|
| Frontend  | React, Tailwind CSS |
| Backend   | Node.js, Express |
| Database  | MongoDB |
| Maps      | Geolocation API |
| Uploads   | Multer |

---

## 🚀 How It Works

1. User shares a post with location 📍  
2. Backend processes coordinates & detects address 🌐  
3. Posts are stored with geo-indexing 📡  
4. Nearby users receive relevant posts & alerts 🚨  

---

## ⚙️ Installation & Setup

### Backend
```bash
cd backend
npm install
node server.js