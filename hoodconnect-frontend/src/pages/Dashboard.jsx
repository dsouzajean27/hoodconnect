import { useEffect, useState, useRef } from "react";
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
import { io } from "socket.io-client";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// ── Leaflet default icon fix ──────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

// ── Map icons (one declaration, used everywhere) ──────────────────────────────
// FIX: removed duplicate MAP_ICONS object. One icons map, used on the map markers.
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

// ── Alert sound (one declaration at module level, not inside component) ───────
// FIX: was declared twice inside the component body — caused a runtime error.
const alertSound = new Audio(
  "https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3"
);

const BASE_URL = "https://hoodconnect-backend.onrender.com";

// ── Axios helper: attaches JWT token to every request ────────────────────────
// FIX: backend routes are now protected. This ensures the token is always sent.
function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── MapClickHandler (defined outside Dashboard to avoid re-render issues) ─────
function MapClickHandler({ setSelectedPosition, setLatitude, setLongitude, setLocation, setShowModal }) {
  useMapEvents({
    async click(e) {
      const { lat, lng } = e.latlng;
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
        console.log("Reverse geocode error:", err);
      }

      setShowModal(true);
    },
  });
  return null;
}

export default function Dashboard() {
  const [posts, setPosts] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [location, setLocation] = useState("");
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const [image, setImage] = useState(null);
  const [video, setVideo] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const [showLocationModal, setShowLocationModal] = useState(false);
  const [tempArea, setTempArea] = useState("");
  const [areas, setAreas] = useState([]);

  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const [nearMe, setNearMe] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [alertUsers, setAlertUsers] = useState(false);
  const [severity, setSeverity] = useState("low");

  const [emergencyPost, setEmergencyPost] = useState(null);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [commentText, setCommentText] = useState({});

  const seenAlertsRef = useRef(new Set());
  const socketRef = useRef(null);

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null;
    }
  });

  const navigate = useNavigate();

  const filters = [
    { key: "all", label: "All", icon: Globe },
    { key: "emergency", label: "Emergency", icon: AlertTriangle },
    { key: "event", label: "Event", icon: Calendar },
    { key: "casual", label: "Casual", icon: User },
    { key: "promotional", label: "Promo", icon: Megaphone },
  ];

  // ── Fetch posts for current area ───────────────────────────────────────────
  const fetchPosts = async () => {
    try {
      const area = user?.area || "unknown";
      const res = await axios.get(`${BASE_URL}/posts?area=${area}`);
      setPosts(res.data);
    } catch (err) {
      console.log("fetchPosts error:", err);
    }
  };

  // ── Socket setup ───────────────────────────────────────────────────────────
  // FIX: merged the two socket useEffects into one.
  // Previously both fired on mount — causing the room to be joined twice.
  // Now: connect once, join the user's area, re-join when user.area changes.
  useEffect(() => {
  socketRef.current = io(BASE_URL, { transports: ["websocket"] });

  const area = user?.area?.toLowerCase().replace(/\s/g, "-") || "unknown";
  socketRef.current.emit("joinRoom", { area });

  // ADD THESE TWO:
  if (user?.id) {
    socketRef.current.emit("joinUserRoom", { userId: user.id });
  }
  socketRef.current.on("newNotification", (notif) => {
    setNotifications(prev => [notif, ...prev]);
  });

  socketRef.current.on("newPost", (post) => {
    setPosts((prev) => [post, ...prev]);
  });

  return () => {
    socketRef.current.disconnect();
  };
}, []);

  // Re-join when user switches area (from the dropdown)
  useEffect(() => {
    if (!user?.area || !socketRef.current) return;
    const area = user.area.toLowerCase().replace(/\s/g, "-");
    socketRef.current.emit("joinRoom", { area });
  }, [user?.area]);

  // ── Fetch posts on mount + when area changes ───────────────────────────────
  // FIX: fetchPosts was defined but never called on mount. Posts only appeared
  // after a new socket event — existing posts were invisible on load.
  useEffect(() => {
    fetchPosts();
  }, [user?.area]);


  // ── Show location modal if user has no area ───────────────────────────────
  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    if (!storedUser?.area || storedUser.area === "unknown") {
      setShowLocationModal(true);
    }
  }, []);

  // ── Emergency alert popup ─────────────────────────────────────────────────
  useEffect(() => {
    posts.forEach((post) => {
      const isRecent = new Date() - new Date(post.createdAt) < 24 * 60 * 60 * 1000;
      if (
        post.type === "emergency" &&
        post.alert &&
        isRecent &&
        !seenAlertsRef.current.has(post._id)
      ) {
        setEmergencyPost(post);
        alertSound.play().catch(() => {}); // ignore autoplay policy errors
        seenAlertsRef.current.add(post._id);
      }
    });
  }, [posts]);

  useEffect(() => {
    axios.get(`${BASE_URL}/areas`).then(res => setAreas(res.data));
  }, []);

  // ── Geolocation ───────────────────────────────────────────────────────────
  const getLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
      },
      (err) => console.log("Geolocation error:", err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // ── Haversine distance ────────────────────────────────────────────────────
  const getDistance = (lat1, lon1, lat2, lon2) => {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const getTimeLeft = (createdAt) => {
    const diff = 24 * 60 * 60 * 1000 - (new Date() - new Date(createdAt));
    if (diff <= 0) return "Expired";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    return `${hours}h ${mins}m left`;
  };

  // ── Filtered posts ────────────────────────────────────────────────────────
  const filteredPosts = (posts || []).filter((post) => {
    if (!post) return false;
    const matchesType = type === "all" || post.type === type;
    const matchesSearch =
      search === "" ||
      ((post.title || "") + (post.content || "") + (post.targetAddress || ""))
        .toLowerCase()
        .includes(search.toLowerCase());

    let matchesNearMe = true;
    if (nearMe) {
      const postLat = Number(post.targetLat || post.originLat);
      const postLng = Number(post.targetLng || post.originLng);
      if (!latitude || !longitude || !postLat || !postLng) return false;
      matchesNearMe = getDistance(Number(latitude), Number(longitude), postLat, postLng) <= 5;
    }

    return matchesType && matchesSearch && matchesNearMe;
  });

  // ── Post handlers ─────────────────────────────────────────────────────────
  const handlePost = async () => {
    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("content", content);
      formData.append("location", location || "Unknown");
      formData.append("latitude", latitude || "");
      formData.append("longitude", longitude || "");
      formData.append("type", type === "all" ? "casual" : type);
      // FIX: area now correctly sends the user's room key, NOT the location address string.
      // Previously: formData.append("area", location.toLowerCase()) — sent the address as room key.
      formData.append("area", user?.area || "unknown");
      formData.append("userId", user?.id);
      formData.append("userName", user?.name || "Unknown");
      formData.append("anonymous", String(anonymous));
      formData.append("alert", String(alertUsers));
      formData.append("severity", severity);

      if (image) formData.append("image", image);
      if (video) formData.append("video", video);

      await axios.post(`${BASE_URL}/posts`, formData, {
        headers: { ...authHeaders() },
      });

      setTitle("");
      setContent("");
      setLocation("");
      setImage(null);
      setVideo(null);
      setImagePreview(null);
      setAnonymous(false);
      setAlertUsers(false);
      setSelectedPosition(null);
      fetchPosts();
    } catch (err) {
      console.log("handlePost error:", err);
    }
  };

  const handleDelete = async (postId) => {
    try {
      await axios.delete(`${BASE_URL}/posts/${postId}`, {
        headers: authHeaders(),
      });
      fetchPosts();
    } catch (err) {
      console.log("handleDelete error:", err);
    }
  };

  const handleEdit = async (postId) => {
    const newText = prompt("Edit your post content:");
    if (!newText) return;
    try {
      // FIX: route now exists on backend (was missing before)
      await axios.put(
        `${BASE_URL}/posts/${postId}`,
        { content: newText },
        { headers: authHeaders() }
      );
      fetchPosts();
    } catch (err) {
      console.log("handleEdit error:", err);
    }
  };

  const handleLike = async (postId) => {
    try {
      await axios.put(
        `${BASE_URL}/posts/${postId}/like`,
        { userId: user?.id },
        { headers: authHeaders() }
      );
      fetchPosts();
    } catch (err) {
      console.log("handleLike error:", err);
    }
  };

  const handleComment = async (postId) => {
    try {
      if (!commentText[postId]) return;
      await axios.post(
        `${BASE_URL}/posts/${postId}/comment`,
        { text: commentText[postId], userName: user?.name || "Anonymous" },
        { headers: authHeaders() }
      );
      setCommentText({ ...commentText, [postId]: "" });
      fetchPosts();
    } catch (err) {
      console.log("handleComment error:", err);
    }
  };

  const handleTrust = async (postId, type) => {
    try {
      await axios.put(
        `${BASE_URL}/posts/${postId}/trust`,
        { userId: user?.id, type },
        { headers: authHeaders() }
      );
      fetchPosts();
    } catch (err) {
      console.log("handleTrust error:", err);
    }
  };

  // FIX: logout now clears localStorage. Previously it just navigated away,
  // leaving the user data behind — anyone could navigate back to /dashboard.
  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/");
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-slate-900 flex flex-col text-white">

      {/* HEADER */}
      <div className="flex justify-between items-center p-6 bg-white/5 border-b border-white/10">
  <h1 className="text-3xl font-extrabold tracking-widest">HOODCONNECT</h1>

  <div className="flex items-center gap-4">
    {/* BELL */}
    <div className="relative">
      <button
        onClick={() => {
          setShowNotifications(!showNotifications);
          if (!showNotifications && user?.id) {
            axios.put(`${BASE_URL}/notifications/${user.id}/read`, {}, {
              headers: authHeaders()
            });
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
          }
        }}
        className="relative text-2xl"
      >
        🔔
        {notifications.filter(n => !n.read).length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {notifications.filter(n => !n.read).length}
          </span>
        )}
      </button>

      {showNotifications && (
        <div className="absolute right-0 top-10 w-80 bg-white text-black rounded-2xl shadow-2xl z-50 overflow-hidden">
          <div className="p-3 border-b font-bold text-gray-700">Notifications</div>
          {notifications.length === 0 ? (
            <p className="p-4 text-sm text-gray-500 text-center">No notifications yet</p>
          ) : (
            notifications.slice(0, 10).map((n, i) => (
              <div key={i} className={`p-3 border-b text-sm ${!n.read ? "bg-blue-50" : ""}`}>
                <p>
                  <b>{n.senderName}</b>{" "}
                  {n.type === "like" && "liked your post"}
                  {n.type === "comment" && "commented on your post"}
                  {n.type === "trust" && "voted on your post"}
                </p>
                <p className="text-xs text-gray-500 mt-1">📝 {n.postTitle}</p>
                <p className="text-xs text-gray-400">
                  {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>

    <button onClick={handleLogout} className="bg-red-500 px-4 py-2 rounded-lg">
      Logout
    </button>
  </div>
</div>

      {/* BODY */}
      <div className="flex flex-1 gap-6 px-6">

        {/* LEFT SIDEBAR */}
        <div
          className={`bg-white/10 relative z-20 backdrop-blur-xl border border-white/20 p-4 rounded-2xl h-fit sticky top-6 ${
            collapsed ? "w-20" : "w-64"
          }`}
        >
          <button onClick={() => setCollapsed(!collapsed)} className="mb-4">
            <Menu />
          </button>

          <button
            onClick={() => { setNearMe(!nearMe); getLocation(); }}
            className="w-full p-2 mb-2 rounded-lg hover:bg-white/10"
          >
            📍 Near Me
          </button>

          {filters.map((f) => {
            const Icon = f.icon;
            return (
              <button
                key={f.key}
                onClick={() => setType(f.key)}
                className={`flex items-center gap-3 w-full p-2 rounded-lg hover:bg-white/10 ${
                  type === f.key ? "bg-white/20" : ""
                }`}
              >
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
            placeholder="Search posts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <button
            onClick={() => setShowModal(true)}
            className="w-full mb-6 bg-gradient-to-r from-blue-500 to-purple-600 p-3 rounded-xl"
          >
            ➕ Create Post
          </button>

          {/* MAP */}
          <div className="mb-6 rounded-2xl overflow-hidden relative z-10">
            <MapContainer
              center={[19.076, 72.8777]}
              zoom={13}
              style={{ height: "300px", width: "100%", zIndex: 0 }}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

              <MapClickHandler
                setSelectedPosition={setSelectedPosition}
                setLatitude={setLatitude}
                setLongitude={setLongitude}
                setLocation={setLocation}
                setShowModal={setShowModal}
              />

              {filteredPosts.map((post) => {
                const lat = Number(post.targetLat || post.originLat);
                const lng = Number(post.targetLng || post.originLng);
                const isRecent =
                  new Date() - new Date(post.createdAt) < 24 * 60 * 60 * 1000;
                if (!isRecent || !lat || !lng || isNaN(lat) || isNaN(lng))
                  return null;

                return (
                  <Marker
                    key={post._id}
                    position={[lat, lng]}
                    icon={icons[post.type] || icons.casual}
                  >
                    <Popup>
                      <div className="text-black w-48">
                        <h3 className="font-bold text-purple-600">{post.title}</h3>
                        <p className="text-xs mt-1">{post.content}</p>
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
                  <Popup>📍 Selected Location</Popup>
                </Marker>
              )}
            </MapContainer>
          </div>

          {/* POST CARDS */}
          {filteredPosts.map((post) => (
            <div
              key={post._id}
              className="bg-white text-black rounded-2xl mb-6 overflow-hidden"
            >
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
                    ).toFixed(1)}{" "}
                    km away
                  </p>
                )}
                <p className="text-xs text-gray-500">{post.type}</p>
                <p className="text-xs text-gray-500">⏳ {getTimeLeft(post.createdAt)}</p>
              </div>

              {post.type === "emergency" && post.alert && (
                <div className="bg-red-500 text-white p-2 text-center font-bold">
                  🚨 EMERGENCY ALERT
                </div>
              )}

              <h3 className="px-4 font-bold text-purple-600">{post.title}</h3>
              <p className="px-4">{post.content}</p>

              {/* FIX: image/video src is now the full Cloudinary URL stored in post.image,
                  not a relative /uploads/ path which broke after Render restarts. */}
              {post.image && (
                <img
                  src={post.image}
                  className="w-full"
                  onError={(e) => (e.target.style.display = "none")}
                  alt="post"
                />
              )}
              {post.video && <video src={post.video} controls className="w-full" />}

              {/* ACTIONS */}
              <div className="flex justify-between px-4 py-3 text-sm">
                <div className="flex gap-4 flex-wrap">
                  <button onClick={() => handleTrust(post._id, "up")}>
                    👍 {post.trustUpvotes?.length || 0}
                  </button>
                  <button onClick={() => handleTrust(post._id, "down")}>
                    ❌ {post.trustDownvotes?.length || 0}
                  </button>
                  <button onClick={() => handleLike(post._id)}>
                    ❤️ {post.likes?.length || 0}
                  </button>
                  <button>💬 {post.comments?.length || 0}</button>
                  <button onClick={() => handleEdit(post._id)}>✏️ Edit</button>
                  <button onClick={() => handleDelete(post._id)}>🗑️ Delete</button>
                </div>
              </div>

              {/* COMMENTS */}
              <div className="px-4 pb-4">
                <input
                  className="w-full p-2 border rounded mb-2 text-black"
                  placeholder="Write a comment..."
                  value={commentText[post._id] || ""}
                  onChange={(e) =>
                    setCommentText({ ...commentText, [post._id]: e.target.value })
                  }
                />
                <button
                  onClick={() => handleComment(post._id)}
                  className="bg-blue-500 text-white px-3 py-1 rounded"
                >
                  Post
                </button>
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

        {/* RIGHT SIDEBAR */}
        <div className="w-72 bg-white/10 p-5 rounded-2xl h-fit sticky top-6">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto bg-purple-500 rounded-full flex items-center justify-center text-xl">
              {user?.name?.charAt(0) || "U"}
            </div>
            <h2 className="mt-3">{user?.name || "Unknown User"}</h2>
            <p className="text-sm text-gray-300 mt-1">
              📍 {user?.area || "No area selected"}
            </p>

            {/* AREA SWITCH */}
            <select
              className="mt-3 w-full p-2 rounded text-black"
              value={user?.area || ""}
              onChange={(e) => {
                const newArea = e.target.value;
                const updatedUser = { ...user, area: newArea };
                localStorage.setItem("user", JSON.stringify(updatedUser));
                setUser(updatedUser);
                if (socketRef.current) {
                  socketRef.current.emit("joinRoom", { area: newArea });
                }
              }}
            >
              {areas.map((a) => (
                <option key={a._id} value={a.name}>
                  {a.name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* CREATE POST MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
          <div className="bg-gradient-to-br from-blue-900 via-purple-900 to-slate-800 p-6 rounded-2xl w-[420px] shadow-2xl relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-3 right-4 text-white/60 text-xl"
            >
              ✖
            </button>

            <h2 className="text-xl font-bold mb-4 text-center">✨ Create New Post</h2>

            <input
              className="w-full p-3 mb-3 rounded-xl bg-white/10 border border-white/20"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="w-full p-3 mb-3 rounded-xl bg-white/10 border border-white/20"
              placeholder="Content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <input
              className="w-full p-3 mb-3 rounded-xl bg-white/10 border border-white/20"
              placeholder="Location (where is this about?)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />

            <button
              onClick={getLocation}
              className="w-full mb-3 bg-green-500/80 hover:bg-green-500 p-2 rounded-xl transition"
            >
              📍 Use My Location
            </button>

            <select
              className="w-full p-2 mb-3 rounded-xl bg-white/10 border border-white/20"
              value={type === "all" ? "casual" : type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="casual">Casual</option>
              <option value="emergency">Emergency</option>
              <option value="event">Event</option>
              <option value="promotional">Promotional</option>
            </select>

            <select
              className="w-full p-2 mb-3 rounded-xl bg-white/10 border border-white/20"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="low">Low severity</option>
              <option value="medium">Medium severity</option>
              <option value="high">High severity</option>
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

            <div className="flex gap-3 mb-3">
              <label className="flex-1 bg-white/10 border border-white/20 p-2 rounded-xl text-center cursor-pointer hover:bg-white/20">
                📸 Choose Image
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files[0];
                    setImage(file);
                    setImagePreview(URL.createObjectURL(file));
                  }}
                />
              </label>
              <label className="flex-1 bg-white/10 border border-white/20 p-2 rounded-xl text-center cursor-pointer hover:bg-white/20">
                🎥 Choose Video
                <input
                  type="file"
                  accept="video/*"
                  hidden
                  onChange={(e) => setVideo(e.target.files[0])}
                />
              </label>
            </div>

            {imagePreview && (
              <img src={imagePreview} className="w-full rounded-xl mt-3" alt="preview" />
            )}

            <button
              onClick={() => { handlePost(); setShowModal(false); }}
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 p-3 rounded-xl mt-3"
            >
              🚀 Post
            </button>
          </div>
        </div>
      )}

      {/* EMERGENCY POPUP */}
      {emergencyPost && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-red-600 text-white p-8 rounded-2xl w-[400px] text-center shadow-2xl animate-pulse">
            <h2 className="text-2xl font-bold mb-4">🚨 EMERGENCY ALERT 🚨</h2>
            <h3 className="text-lg font-semibold">{emergencyPost.title}</h3>
            <p className="mt-2">{emergencyPost.content}</p>
            <p className="mt-2 text-sm">
              📍 {emergencyPost.targetAddress || emergencyPost.originAddress}
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

      {/* FIRST-TIME AREA MODAL */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-50">
          <div className="bg-white text-black p-6 rounded-2xl w-[350px] text-center">
            <h2 className="text-xl font-bold mb-4">📍 Enter Your Area</h2>
            <input
              className="w-full p-3 border rounded mb-4"
              placeholder="e.g. Andheri, Borivali, Majiwada"
              value={tempArea}
              onChange={(e) => setTempArea(e.target.value)}
            />
            <button
              className="bg-blue-500 text-white px-4 py-2 rounded"
              onClick={() => {
                if (!tempArea) return;
                const formatted = tempArea.toLowerCase().replace(/\s/g, "-");
                
                // Save to DB so it appears in everyone's dropdown
                axios.post(`${BASE_URL}/areas`, { name: formatted }, { headers: authHeaders() });
                
                const updatedUser = { ...user, area: formatted };
                localStorage.setItem("user", JSON.stringify(updatedUser));
                setUser(updatedUser);
                if (socketRef.current) socketRef.current.emit("joinRoom", { area: formatted });
                setShowLocationModal(false);
              }}
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
