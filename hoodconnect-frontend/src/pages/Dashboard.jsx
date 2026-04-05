import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  Globe,
  AlertTriangle,
  Calendar,
  User,
  Megaphone,
  Menu,
} from "lucide-react";
import { useRef } from "react";
import { io } from "socket.io-client";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useMapEvents } from "react-leaflet";

import L from "leaflet";

delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

export default function Dashboard() {
  const [posts, setPosts] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState("casual");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const [image, setImage] = useState(null);
  const [video, setVideo] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [userArea, setUserArea] = useState("");

  const [nearMe, setNearMe] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [anonymous, setAnonymous] = useState(false);

  const [emergencyPost, setEmergencyPost] = useState(null);
  const alertSound = new Audio("https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3");
  const seenAlertsRef = useRef(new Set());

  const [selectedPosition, setSelectedPosition] = useState(null);
  const [severity, setSeverity] = useState("low");

  const [city, setCity] = useState("mumbai");

  const [alertUsers, setAlertUsers] = useState(false);

  let user = null;
  try {
    user = JSON.parse(localStorage.getItem("user"));
  } catch {
    user = null;
  }

  const navigate = useNavigate();
  const BASE_URL = "https://hoodconnect-backend.onrender.com";

  const filters = [
    { key: "all", label: "All", icon: Globe },
    { key: "emergency", label: "Emergency", icon: AlertTriangle },
    { key: "event", label: "Event", icon: Calendar },
    { key: "casual", label: "Casual", icon: User },
    { key: "promotional", label: "Promo", icon: Megaphone },
  ];

  const handleDelete = async (postId) => {
    try {
      await axios.delete(`${BASE_URL}/posts/${postId}`);
      fetchPosts();
    } catch (err) {
      console.log(err);
    }
  };

const handleEdit = async (postId) => {
  const newText = prompt("Edit your post content:");
    if (!newText) return;

    try {
      await axios.put(`${BASE_URL}/posts/${postId}`, {
        content: newText,
      });

      fetchPosts();
    } catch (err) {
      console.log(err);
    }
  };

  const icons = {
    emergency: new L.Icon({
      iconUrl: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
      iconSize: [32, 32],
    }),
    casual: new L.Icon({
      iconUrl: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
      iconSize: [32, 32],
    }),
    event: new L.Icon({
      iconUrl: "https://maps.google.com/mapfiles/ms/icons/yellow-dot.png",
      iconSize: [32, 32],
    }),
    promotional: new L.Icon({
      iconUrl: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
      iconSize: [32, 32],
    }),
  };

  const handleTrust = async (postId, type) => {
    try {
      await axios.put(`${BASE_URL}/posts/${postId}/trust`, {
        userId: user?.id,
        type,
      });

      fetchPosts();
    } catch (err) {
      console.log(err);
    }
  };

  const getTimeLeft = (createdAt) => {
  const diff = 24 * 60 * 60 * 1000 - (new Date() - new Date(createdAt));

  if (diff <= 0) return "Expired";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff / (1000 * 60)) % 60);

  return `${hours}h ${mins}m left`;
};

const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = io("https://hoodconnect-backend.onrender.com", {
      transports: ["websocket"],
    });

    const area = user?.area?.toLowerCase().replace(/\s/g, "-") || "mumbai";

    console.log("JOINING ROOM:", area);

    socketRef.current.emit("joinRoom", { area });

    socketRef.current.on("newPost", (post) => {
      setPosts((prev) => [post, ...prev]);
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

    
  useEffect(() => {
    posts.forEach((post) => {
      const isRecent =
        new Date() - new Date(post.createdAt) < 24 * 60 * 60 * 1000;

      if (
        post.type === "emergency" &&
        post.alert &&
        isRecent &&
        !seenAlertsRef.current.has(post._id)
      ) {
        setEmergencyPost(post);
        alertSound.play();
        seenAlertsRef.current.add(post._id);
      }
    });
  }, [posts]);

  const fetchPosts = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/posts`);
      setPosts(res.data);
    } catch (err) {
      console.log(err);
    }
  };

  const getLocation = () => {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setLatitude(pos.coords.latitude);
      setLongitude(pos.coords.longitude);
    },
    (err) => console.log(err),
    {
      enableHighAccuracy: true, // 🔥 IMPORTANT
      timeout: 10000,
      maximumAge: 0,
    }
  );
};

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const filteredPosts = (posts || []).filter((post) => {
  if (!post) return false;

  const matchesType = type === "all" || post.type === type;

  const matchesSearch =
    search === "" ||
    (post.targetAddress || "")
      .toLowerCase()
      .includes(search.toLowerCase());

  let matchesNearMe = true;

  /*
  if (nearMe) {
    const postLat = Number(post.targetLat || post.originLat);
    const postLng = Number(post.targetLng || post.originLng);

    if (!latitude || !longitude || !postLat || !postLng) return false;

    const distance = getDistance(
      Number(latitude),
      Number(longitude),
      postLat,
      postLng
    );

    matchesNearMe = distance <= 5; // same logic you intended
  }
  */

  return matchesType && matchesSearch && matchesNearMe;
});

  
  const handlePost = async () => {
    try {
      const formData = new FormData();

      formData.append("title", title);
      formData.append("content", content);
      formData.append("location", location || "Unknown");
      formData.append("latitude", latitude || "");
      formData.append("longitude", longitude || "");
      formData.append("geo[coordinates][]", longitude);
      formData.append("geo[coordinates][]", latitude);
      formData.append("type", type);
      formData.append("city", city);
      formData.append("area", location.toLowerCase());

      formData.append("userId", user?.id);
      formData.append("userName", user?.name || "Unknown");
      formData.append("anonymous", String(anonymous)); // 🔥 FIX
      formData.append("alert", String(alertUsers));
      formData.append("severity", severity);

      if (image) formData.append("image", image);
      if (video) formData.append("video", video);

      await axios.post(`${BASE_URL}/posts`, formData);

      setSelectedPosition(null);

      setTitle("");
      setContent("");
      setLocation("");
      setImage(null);
      setVideo(null);
      setAnonymous(false);

      fetchPosts();
    } catch (err) {
      console.log(err);
    }
  };

  const handleLogout = () => {
    navigate("/");
  };

  const handleLike = async (postId) => {
  try {
    await axios.put(`${BASE_URL}/posts/${postId}/like`, {
      userId: user?.id,
    });

    fetchPosts();
  } catch (err) {
    console.log("LIKE ERROR:", err);
  }
};

const [commentText, setCommentText] = useState({});

const handleComment = async (postId) => {
  try {
    if (!commentText[postId]) return;

    await axios.post(`${BASE_URL}/posts/${postId}/comment`, {
      text: commentText[postId],
      userName: user?.name || "Anonymous",
    });

    setCommentText({ ...commentText, [postId]: "" });
    fetchPosts();
  } catch (err) {
    console.log("COMMENT ERROR:", err);
  }
};

function MapClickHandler() {
  useMapEvents({
    async click(e) {
      const { lat, lng } = e.latlng;

      // ✅ show temp marker
      setSelectedPosition([lat, lng]);

      setLatitude(lat);
      setLongitude(lng);

      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`
        );
        const data = await res.json();

        setLocation(data.display_name || "Selected location");
      } catch (err) {
        console.log(err);
      }

      setShowModal(true);
    },
  });

  return null;
}

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-slate-900 flex flex-col text-white">

      {/* HEADER */}
      <div className="flex justify-between items-center p-6 bg-white/5 border-b border-white/10">
        <h1 className="text-3xl font-extrabold tracking-widest">
          HOODCONNECT
        </h1>
        <button onClick={handleLogout} className="bg-red-500 px-4 py-2 rounded-lg">
          Logout
        </button>
      </div>

      {/* BODY */}
      <div className="flex flex-1 gap-6 px-6">

        {/* LEFT SIDEBAR */}
        <div className={`bg-white/10 relative z-20 backdrop-blur-xl border border-white/20 p-4 rounded-2xl h-fit sticky top-6 ${collapsed ? "w-20" : "w-64"}`}>
          <button onClick={() => setCollapsed(!collapsed)} className="mb-4">
            <Menu />
          </button>

          <button onClick={() => { setNearMe(!nearMe); getLocation(); }}
            className="w-full p-2 mb-2 rounded-lg hover:bg-white/10">
            📍 Near Me
          </button>

          {filters.map((f) => {
            const Icon = f.icon;
            return (
              <button key={f.key} onClick={() => setType(f.key)}
                className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-white/10">
                <Icon size={18} />
                {!collapsed && <span>{f.label}</span>}
              </button>
            );
          })}
        </div>

        {/* CENTER */}
        <div className="flex-1 max-w-2xl mx-auto p-6 relative z-10">

          <input
            className="w-full p-3 mb-4 rounded-xl text-black"
            placeholder="Search location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <button
            onClick={() => setShowModal(true)}
            className="w-full mb-6 bg-gradient-to-r from-blue-500 to-purple-600 p-3 rounded-xl"
          >
            ➕ Create Post
          </button>

          <div className="mb-6 rounded-2xl overflow-hidden relative z-10">
          <MapContainer
            center={[19.076, 72.8777]}
            zoom={13}
            style={{ height: "300px", width: "100%", zIndex: 0 }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapClickHandler />

            {filteredPosts.map((post) => {
                const lat = Number(post.targetLat || post.originLat);
                const lng = Number(post.targetLng || post.originLng);

                // ⏰ check if post is within 24 hours
                const isRecent =
                  new Date() - new Date(post.createdAt) < 24 * 60 * 60 * 1000;

                // ❌ hide old markers
                if (!isRecent) return null;

                if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
                  return null;
                }

                return (
                  <Marker
                    key={post._id}
                    position={[lat, lng]}
                    icon={icons[post.type] || icons.casual}
                  >
                    <Popup>
                      <div className="text-black w-48">
                        <h3 className="font-bold text-purple-600">
                          {post.title}
                        </h3>

                        <p className="text-xs mt-1">
                          {post.content}
                        </p>

                        <p className="text-xs mt-2">
                          📍 {post.targetAddress || post.originAddress}
                        </p>

                        <p className="text-xs text-gray-500 mt-1">
                          👤 {post.userName || "Anonymous"}
                        </p>

                        {post.type === "emergency" && (
                          <p className="text-red-600 text-xs font-bold mt-2">
                            🚨 Emergency
                          </p>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
              {selectedPosition && (
                  <Marker position={selectedPosition}>
                    <Popup>
                      📍 Selected Location
                    </Popup>
                  </Marker>
                )}

          </MapContainer>
        </div>

          {filteredPosts.map((post) => (
            <div key={post._id} className="bg-white text-black rounded-2xl mb-6 overflow-hidden">

    {/* HEADER */}
    <div className="p-4">
      <p className="font-semibold text-sm text-gray-700">
        👤 {post.userName || "Anonymous"}
      </p>
      <p className="text-xs text-gray-500">
        {new Date(post.createdAt).toLocaleDateString()} •{" "}
        {new Date(post.createdAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
      <p className="font-semibold">
        📍 Located at: {post.targetAddress || "Not specified"}
      </p>

      <p className="text-xs text-gray-500">
        Posted from: {post.originAddress}
      </p>
      {latitude && (post.targetLat || post.originLat) && (
        <p className="text-xs text-gray-500">
          📍{" "}
          {getDistance(
            Number(latitude),
            Number(longitude),
            Number(post.targetLat || post.originLat),
            Number(post.targetLng || post.originLng)
          ).toFixed(1)} km away
        </p>
      )}
      <p className="text-xs text-gray-500">{post.type}</p>

      <p className="text-xs text-gray-500">
        ⏳ {getTimeLeft(post.createdAt)}
      </p>
    </div>

    {/* CONTENT */}
    {post.type === "emergency" && post.alert && (
      <div className="bg-red-500 text-white p-2 text-center font-bold">
        🚨 EMERGENCY ALERT
      </div>
    )}
    <h3 className="px-4 font-bold text-purple-600">{post.title}</h3>
    <p className="px-4">{post.content}</p>

    {post.image && (
      <img src={`${BASE_URL}/uploads/${post.image}`} />
    )}
    {post.video && (
      <video src={`${BASE_URL}/uploads/${post.video}`} controls />
    )}

    {/* ❤️ ACTIONS */}
    <div className="flex justify-between px-4 py-3 text-sm">
      <div className="flex gap-4">

        <button onClick={() => handleTrust(post._id, "up")}>
          👍 {post.trustUpvotes?.length || 0}
        </button>

        <button onClick={() => handleTrust(post._id, "down")}>
          ❌ {post.trustDownvotes?.length || 0}
        </button>

        <button onClick={() => handleLike(post._id)}>
          ❤️ {post.likes?.length || 0}
        </button>

        <button>
          💬 {post.comments?.length || 0}
        </button>

        {/* ✏️ EDIT */}
        <button onClick={() => handleEdit(post._id)}>
          ✏️ Edit
        </button>

        {/* 🗑️ DELETE */}
        <button onClick={() => handleDelete(post._id)}>
          🗑️ Delete
        </button>

      </div>
    </div>

    {/* 💬 COMMENT SECTION */}
    <div className="px-4 pb-4">

      <input
        className="w-full p-2 border rounded mb-2 text-black"
        placeholder="Write a comment..."
        value={commentText[post._id] || ""}
        onChange={(e) =>
          setCommentText({
            ...commentText,
            [post._id]: e.target.value,
          })
        }
      />

      <button
        onClick={() => handleComment(post._id)}
        className="bg-blue-500 text-white px-3 py-1 rounded"
      >
        Post
      </button>

      {/* COMMENTS */}
      <div className="mt-3">
        {post.comments?.map((c, i) => (
          <p key={i} className="text-sm text-gray-700">
            <b>{c.userName}:</b> {c.text}
          </p>
        ))}
      </div>

    </div>

  </div>
))}

   </div>

        {/* RIGHT */}
        <div className="w-72 bg-white/10 p-5 rounded-2xl h-fit sticky top-6">
          <div className="text-center">
            
            <div className="w-16 h-16 mx-auto bg-purple-500 rounded-full flex items-center justify-center text-xl">
              {user?.name?.charAt(0) || "U"}
            </div>

            <h2 className="mt-3">{user?.name || "Unknown User"}</h2>

            {/* ✅ CURRENT AREA DISPLAY */}
            <p className="text-sm text-gray-300 mt-1">
              📍 {user?.area || "No area selected"}
            </p>

            {/* ✅ STEP 5 — AREA SWITCH DROPDOWN */}
            <select
              className="mt-3 w-full p-2 rounded text-black"
              defaultValue={user?.area}
              onChange={(e) => {
                const newArea = e.target.value.toLowerCase().replace(/\s/g, "-");

                console.log("SWITCHING TO:", newArea);

                // 🔥 join new room
                socketRef.current.emit("joinRoom", { area: newArea });

                // 🔥 update local storage
                const updatedUser = { ...user, area: newArea };
                localStorage.setItem("user", JSON.stringify(updatedUser));

                // quick refresh
                window.location.reload();
              }}
            >
              <option value="majiwada">Majiwada</option>
              <option value="andheri">Andheri</option>
              <option value="borivali">Borivali</option>
              <option value="dadar">Dadar</option>
            </select>

          </div>
        </div>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">

          <div className="bg-gradient-to-br from-blue-900 via-purple-900 to-slate-800 p-6 rounded-2xl w-[420px] shadow-2xl relative">

            <button onClick={() => setShowModal(false)}
              className="absolute top-3 right-4 text-white/60 text-xl">
              ✖
            </button>

            <h2 className="text-xl font-bold mb-4 text-center">
              ✨ Create New Post
            </h2>

            <input className="w-full p-3 mb-3 rounded-xl bg-white/10 border border-white/20"
              placeholder="Title" value={title} onChange={(e)=>setTitle(e.target.value)} />

            <textarea className="w-full p-3 mb-3 rounded-xl bg-white/10 border border-white/20"
              placeholder="Content" value={content} onChange={(e)=>setContent(e.target.value)} />

            <input className="w-full p-3 mb-3 rounded-xl bg-white/10 border border-white/20"
              placeholder="Location" value={location} onChange={(e)=>setLocation(e.target.value)} />

            <button
              onClick={getLocation}
              className="w-full mb-3 bg-green-500/80 hover:bg-green-500 p-2 rounded-xl transition"
            >
              📍 Use My Location
            </button>

            <select
              className="w-full p-2 mb-3 rounded-xl bg-white/10 border border-white/20"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="casual">Casual</option>
              <option value="emergency">Emergency</option>
              <option value="event">Event</option>
              <option value="promotional">Promotional</option>
            </select>

            <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
            

            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                checked={alertUsers}
                onChange={(e) => setAlertUsers(e.target.checked)}
              />
              <span className="text-sm">🔔 Send Emergency Alert</span>
            </div>

            <div className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
            />
            <span className="text-sm">Post as Anonymous</span>
          </div>

            {/* 🔥 IMAGE + VIDEO BUTTONS BACK */}
            <div className="flex gap-3 mb-3">

              <label className="flex-1 bg-white/10 border border-white/20 p-2 rounded-xl text-center cursor-pointer hover:bg-white/20">
                📸 Choose Image
                <input type="file" accept="image/*" hidden
                  onChange={(e) => {
                    const file = e.target.files[0];
                    setImage(file);
                    setImagePreview(URL.createObjectURL(file));
                  }} />
              </label>

              <label className="flex-1 bg-white/10 border border-white/20 p-2 rounded-xl text-center cursor-pointer hover:bg-white/20">
                🎥 Choose Video
                <input type="file" accept="video/*" hidden
                  onChange={(e)=>setVideo(e.target.files[0])} />
              </label>

            </div>
            {imagePreview && (
              <img
                src={imagePreview}
                className="w-full rounded-xl mt-3"
                alt="preview"
              />
            )}

            <button
              onClick={() => { handlePost(); setShowModal(false); }}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 p-3 rounded-xl"
            >
              🚀 Post
            </button>

          </div>
        </div>

      )}
      {emergencyPost && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">

          <div className="bg-red-600 text-white p-8 rounded-2xl w-[400px] text-center shadow-2xl animate-pulse">

            <h2 className="text-2xl font-bold mb-4">🚨 EMERGENCY ALERT 🚨</h2>

            <h3 className="text-lg font-semibold">{emergencyPost.title}</h3>

            <p className="mt-2">{emergencyPost.content}</p>

            <p className="mt-2 text-sm">
              📍 {emergencyPost.location}
            </p>

            <button
              onClick={() => setEmergencyPost(null)}
              className="mt-6 bg-white text-red-600 px-4 py-2 rounded-lg font-semibold"
            >
              Close
            </button>

          </div>
        </div>
      )}
    </div>
  );
}