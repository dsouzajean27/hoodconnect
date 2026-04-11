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
  Bookmark,
  BookmarkCheck,
  Trophy,
  MapPin,
  Bell,
  LogOut,
  Plus,
  ChevronRight,
  X,
} from "lucide-react";
import { io } from "socket.io-client";
import logo from "../assets/logo.png";

const alertSound = new Audio(
  "https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3"
);

const BASE_URL = "https://hoodconnect-backend.onrender.com";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const TAG = {
  emergency: "bg-red-100 text-red-600 border border-red-200",
  event: "bg-amber-100 text-amber-700 border border-amber-200",
  casual: "bg-blue-100 text-blue-600 border border-blue-200",
  promotional: "bg-emerald-100 text-emerald-700 border border-emerald-200",
};

const TYPE_ICON = {
  emergency: "🚨",
  event: "📅",
  casual: "💬",
  promotional: "📢",
};

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
  const [commentText, setCommentText] = useState({});
  const [openComments, setOpenComments] = useState({});

  const [bookmarks, setBookmarks] = useState(new Set());
  const [leaderboard, setLeaderboard] = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);

  const seenAlertsRef = useRef(new Set());
  const socketRef = useRef(null);

  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user")); }
    catch { return null; }
  });

  const navigate = useNavigate();

  const filters = [
    { key: "all", label: "All", icon: Globe },
    { key: "emergency", label: "Emergency", icon: AlertTriangle },
    { key: "event", label: "Event", icon: Calendar },
    { key: "casual", label: "Casual", icon: User },
    { key: "promotional", label: "Promo", icon: Megaphone },
  ];

  const fetchPosts = async () => {
    try {
      const area = user?.area || "unknown";
      const res = await axios.get(`${BASE_URL}/posts?area=${area}`);
      setPosts(res.data);
    } catch (err) { console.log("fetchPosts error:", err); }
  };

  const fetchLeaderboard = async (area) => {
    try {
      const res = await axios.get(`${BASE_URL}/leaderboard/${area || "unknown"}`);
      setLeaderboard(res.data);
    } catch (err) { console.log("fetchLeaderboard error:", err); }
  };

  const fetchBookmarks = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/bookmarks`, { headers: authHeaders() });
      setBookmarks(new Set(res.data.map((p) => p._id)));
    } catch (err) { console.log("fetchBookmarks error:", err); }
  };

  useEffect(() => {
    socketRef.current = io(BASE_URL, { transports: ["websocket"] });
    const area = user?.area?.toLowerCase().replace(/\s/g, "-") || "unknown";
    socketRef.current.emit("joinRoom", { area });
    if (user?.id) socketRef.current.emit("joinUserRoom", { userId: user.id });
    socketRef.current.on("newNotification", (notif) => setNotifications((prev) => [notif, ...prev]));
    socketRef.current.on("newPost", (post) => setPosts((prev) => [post, ...prev]));
    return () => socketRef.current.disconnect();
  }, []);

  useEffect(() => {
    if (!user?.area || !socketRef.current) return;
    socketRef.current.emit("joinRoom", { area: user.area.toLowerCase().replace(/\s/g, "-") });
  }, [user?.area]);

  useEffect(() => { fetchPosts(); fetchLeaderboard(user?.area); }, [user?.area]);
  useEffect(() => { if (user?.id) fetchBookmarks(); }, [user?.id]);
  useEffect(() => { axios.get(`${BASE_URL}/areas`).then((res) => setAreas(res.data)); }, []);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    if (!storedUser?.area || storedUser.area === "unknown") setShowLocationModal(true);
  }, []);

  useEffect(() => {
    posts.forEach((post) => {
      const isRecent = new Date() - new Date(post.createdAt) < 24 * 60 * 60 * 1000;
      if (post.type === "emergency" && post.alert && isRecent && !seenAlertsRef.current.has(post._id)) {
        setEmergencyPost(post);
        alertSound.play().catch(() => {});
        seenAlertsRef.current.add(post._id);
      }
    });
  }, [posts]);

  const getLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLatitude(pos.coords.latitude); setLongitude(pos.coords.longitude); },
      (err) => console.log("Geolocation error:", err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const getTimeLeft = (createdAt) => {
    const diff = 24 * 60 * 60 * 1000 - (new Date() - new Date(createdAt));
    if (diff <= 0) return "Expired";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff / (1000 * 60)) % 60);
    return `${hours}h ${mins}m`;
  };

  const filteredPosts = (posts || []).filter((post) => {
    if (!post) return false;
    if (showBookmarks && !bookmarks.has(post._id)) return false;
    const matchesType = type === "all" || post.type === type;
    const matchesSearch = search === "" || ((post.title || "") + (post.content || "") + (post.targetAddress || "")).toLowerCase().includes(search.toLowerCase());
    let matchesNearMe = true;
    if (nearMe) {
      const postLat = Number(post.targetLat || post.originLat);
      const postLng = Number(post.targetLng || post.originLng);
      if (!latitude || !longitude || !postLat || !postLng) return false;
      matchesNearMe = getDistance(Number(latitude), Number(longitude), postLat, postLng) <= 5;
    }
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
      formData.append("type", type === "all" ? "casual" : type);
      formData.append("area", user?.area || "unknown");
      formData.append("userId", user?.id);
      formData.append("userName", user?.name || "Unknown");
      formData.append("anonymous", String(anonymous));
      formData.append("alert", String(alertUsers));
      formData.append("severity", severity);
      if (image) formData.append("image", image);
      if (video) formData.append("video", video);
      await axios.post(`${BASE_URL}/posts`, formData, { headers: { ...authHeaders() } });
      setTitle(""); setContent(""); setLocation(""); setImage(null); setVideo(null);
      setImagePreview(null); setAnonymous(false); setAlertUsers(false);
      fetchPosts();
    } catch (err) { console.log("handlePost error:", err); }
  };

  const handleDelete = async (postId) => {
    try {
      await axios.delete(`${BASE_URL}/posts/${postId}`, { headers: authHeaders() });
      fetchPosts();
    } catch (err) { console.log("handleDelete error:", err); }
  };

  const handleEdit = async (postId) => {
    const newText = prompt("Edit your post content:");
    if (!newText) return;
    try {
      await axios.put(`${BASE_URL}/posts/${postId}`, { content: newText }, { headers: authHeaders() });
      fetchPosts();
    } catch (err) { console.log("handleEdit error:", err); }
  };

  const handleLike = async (postId) => {
    try {
      await axios.put(`${BASE_URL}/posts/${postId}/like`, { userId: user?.id }, { headers: authHeaders() });
      fetchPosts();
    } catch (err) { console.log("handleLike error:", err); }
  };

  const handleComment = async (postId) => {
    try {
      if (!commentText[postId]) return;
      await axios.post(`${BASE_URL}/posts/${postId}/comment`, { text: commentText[postId], userName: user?.name || "Anonymous", userId: user?.id }, { headers: authHeaders() });
      setCommentText({ ...commentText, [postId]: "" });
      fetchPosts();
    } catch (err) { console.log("handleComment error:", err); }
  };

  const handleTrust = async (postId, trustType) => {
    try {
      await axios.put(`${BASE_URL}/posts/${postId}/trust`, { userId: user?.id, type: trustType }, { headers: authHeaders() });
      fetchPosts();
    } catch (err) { console.log("handleTrust error:", err); }
  };

  const handleBookmark = async (postId) => {
    try {
      const res = await axios.put(`${BASE_URL}/posts/${postId}/bookmark`, {}, { headers: authHeaders() });
      setBookmarks(new Set(res.data.bookmarks.map((id) => id.toString())));
    } catch (err) { console.log("handleBookmark error:", err); }
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/");
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen bg-[#f0f2f8] flex flex-col">

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-4 px-5 py-3">
          <div className="flex items-center gap-2 shrink-0">
            <img src={logo} alt="logo" className="w-8 h-8 object-contain" />
            <span className="text-xl font-black tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              HOODCONNECT
            </span>
          </div>

          <div className="flex-1 max-w-lg mx-auto">
            <input
              className="w-full px-4 py-2 rounded-xl bg-gray-100 border border-gray-200 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white transition"
              placeholder="Search posts, locations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Bell */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  if (!showNotifications && user?.id) {
                    axios.put(`${BASE_URL}/notifications/${user.id}/read`, {}, { headers: authHeaders() });
                    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
                  }
                }}
                className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-600 transition"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 top-11 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <span className="font-semibold text-gray-800 text-sm">Notifications</span>
                    <button onClick={() => setShowNotifications(false)} className="text-gray-400 hover:text-gray-600">
                      <X size={14} />
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="p-5 text-sm text-gray-400 text-center">You're all caught up 🎉</p>
                  ) : (
                    notifications.slice(0, 10).map((n, i) => (
                      <div key={i} className={`px-4 py-3 border-b border-gray-50 text-sm ${!n.read ? "bg-blue-50/60" : ""}`}>
                        <p className="text-gray-700">
                          <span className="font-semibold text-gray-900">{n.senderName}</span>{" "}
                          {n.type === "like" && "liked your post"}
                          {n.type === "comment" && "commented on your post"}
                          {n.type === "trust" && "voted on your post"}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">📝 {n.postTitle}</p>
                        <p className="text-xs text-gray-300 mt-0.5">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 text-sm font-medium transition"
            >
              <LogOut size={15} />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* ── BODY ── */}
      <div className="flex flex-1">

        {/* ── LEFT SIDEBAR ── */}
        <aside className={`bg-white border-r border-gray-200 flex flex-col gap-1 py-4 px-2 shrink-0 transition-all duration-200 ${collapsed ? "w-14" : "w-48"}`}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center p-2 rounded-xl hover:bg-gray-100 text-gray-400 mb-1 transition"
          >
            <Menu size={17} />
          </button>

          <button
            onClick={() => { setNearMe(!nearMe); getLocation(); }}
            className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition ${nearMe ? "bg-purple-600 text-white" : "hover:bg-gray-100 text-gray-600"}`}
          >
            <MapPin size={16} className={nearMe ? "text-white" : "text-purple-500"} />
            {!collapsed && <span>Near Me</span>}
          </button>

          <button
            onClick={() => setShowBookmarks(!showBookmarks)}
            className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition ${showBookmarks ? "bg-purple-600 text-white" : "hover:bg-gray-100 text-gray-600"}`}
          >
            {showBookmarks
              ? <BookmarkCheck size={16} className="text-white" />
              : <Bookmark size={16} className="text-purple-500" />
            }
            {!collapsed && <span>Saved</span>}
          </button>

          <div className="my-1 mx-2 border-t border-gray-100" />

          {filters.map((f) => {
            const Icon = f.icon;
            const active = type === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setType(f.key)}
                className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition ${active ? "bg-purple-600 text-white" : "hover:bg-gray-100 text-gray-600"}`}
              >
                <Icon size={16} className={active ? "text-white" : "text-purple-500"} />
                {!collapsed && <span>{f.label}</span>}
              </button>
            );
          })}
        </aside>

        {/* ── CENTER FEED ── */}
        <main className="flex-1 py-5 px-4 overflow-y-auto" style={{ maxWidth: 640, margin: "0 auto" }}>

          <button
            onClick={() => setShowModal(true)}
            className="w-full mb-5 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold text-sm shadow-md hover:shadow-lg hover:from-blue-700 hover:to-purple-700 transition"
          >
            <Plus size={17} />
            Create Post
          </button>

          <div className="flex items-center gap-2 mb-4">
            <MapPin size={13} className="text-purple-400" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              {showBookmarks
                ? "Saved Posts"
                : user?.area?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Your Hood"}
            </span>
          </div>

          {filteredPosts.length === 0 && (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center text-gray-400 text-sm">
              {showBookmarks ? "No saved posts yet." : "No posts in this area yet — be the first! 🌟"}
            </div>
          )}

          {filteredPosts.map((post) => (
            <article key={post._id} className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5 overflow-hidden hover:shadow-md transition">

              {post.type === "emergency" && post.alert && (
                <div className="bg-gradient-to-r from-red-500 to-rose-600 text-white px-4 py-2 text-xs font-bold tracking-wide flex items-center gap-2">
                  <span className="animate-pulse">🚨</span> EMERGENCY ALERT
                </div>
              )}

              {/* Card header */}
              <div className="flex items-start justify-between px-4 pt-4 pb-2">
                <div className="flex items-start gap-3">
                  <div
                    className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white font-bold text-sm cursor-pointer shrink-0"
                    onClick={() => post.userId && navigate(`/profile/${post.userId}`)}
                  >
                    {(post.userName || "A")[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => post.userId && navigate(`/profile/${post.userId}`)}>
                      <span className="font-semibold text-sm text-gray-800 hover:text-purple-600 transition">
                        {post.userName || "Anonymous"}
                      </span>
                      {post.verified && (
                        <span className="text-[10px] bg-blue-100 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-bold">
                          ✓ Verified
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${TAG[post.type] || "bg-gray-100 text-gray-500"}`}>
                        {TYPE_ICON[post.type]} {post.type}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {new Date(post.createdAt).toLocaleDateString()} · {new Date(post.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                </div>

                <button onClick={() => handleBookmark(post._id)} className="p-1.5 rounded-lg hover:bg-purple-50 text-gray-400 hover:text-purple-600 transition">
                  {bookmarks.has(post._id) ? <BookmarkCheck size={17} className="text-purple-600" /> : <Bookmark size={17} />}
                </button>
              </div>

              {/* Location */}
              <div className="px-4 pb-2">
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <MapPin size={10} className="text-purple-400 shrink-0" />
                  <span className="truncate">{post.targetAddress || post.originAddress || "Unknown"}</span>
                  {latitude && (post.targetLat || post.originLat) && (
                    <span className="ml-auto shrink-0 text-gray-300">
                      {getDistance(Number(latitude), Number(longitude), Number(post.targetLat || post.originLat), Number(post.targetLng || post.originLng)).toFixed(1)} km
                    </span>
                  )}
                </p>
              </div>

              {/* Content */}
              <div className="px-4 pb-3">
                <h3 className="font-bold text-gray-900 text-base leading-snug">{post.title}</h3>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">{post.content}</p>
              </div>

              {post.image && (
                <img src={post.image} className="w-full max-h-72 object-cover" onError={(e) => (e.target.style.display = "none")} alt="post" />
              )}
              {post.video && <video src={post.video} controls className="w-full" />}

              {/* Trust bar */}
              {(post.trustUpvotes?.length > 0 || post.trustDownvotes?.length > 0) && (
                <div className="px-4 pt-2 pb-1">
                  <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                    <span>Community Trust</span>
                    <span className="text-gray-500 font-medium">
                      {post.trustUpvotes?.length || 0}/{(post.trustUpvotes?.length || 0) + (post.trustDownvotes?.length || 0)} verified
                    </span>
                  </div>
                  <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all"
                      style={{ width: `${((post.trustUpvotes?.length || 0) / Math.max(1, (post.trustUpvotes?.length || 0) + (post.trustDownvotes?.length || 0))) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 px-3 py-2 border-t border-gray-50 flex-wrap">
                <button onClick={() => handleTrust(post._id, "up")} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-green-50 hover:text-green-600 transition">
                  👍 {post.trustUpvotes?.length || 0}
                </button>
                <button onClick={() => handleTrust(post._id, "down")} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-500 transition">
                  👎 {post.trustDownvotes?.length || 0}
                </button>
                <button onClick={() => handleLike(post._id)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-pink-50 hover:text-pink-500 transition">
                  ❤️ {post.likes?.length || 0}
                </button>
                <button
                  onClick={() => setOpenComments((prev) => ({ ...prev, [post._id]: !prev[post._id] }))}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${openComments[post._id] ? "bg-blue-100 text-blue-600" : "text-gray-500 hover:bg-blue-50 hover:text-blue-500"}`}
                >
                  💬 {post.comments?.length || 0}
                </button>
                <div className="flex-1" />
                <span className="text-[11px] text-gray-300 px-1">⏳ {getTimeLeft(post.createdAt)}</span>
                {post.userId === user?.id && (
                  <>
                    <button onClick={() => handleEdit(post._id)} className="px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition">✏️</button>
                    <button onClick={() => handleDelete(post._id)} className="px-2 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-50 hover:text-red-600 transition">🗑️</button>
                  </>
                )}
              </div>

              {/* Comments */}
              {openComments[post._id] && (
                <div className="px-4 pb-4 pt-2 bg-gray-50 border-t border-gray-100">
                  {post.comments?.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {post.comments.map((c, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-300 to-purple-300 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5">
                            {(c.userName || "A")[0].toUpperCase()}
                          </div>
                          <div className="bg-white rounded-xl px-3 py-2 text-xs text-gray-700 border border-gray-100 flex-1">
                            <span className="font-semibold text-purple-600 cursor-pointer" onClick={() => c.userId && navigate(`/profile/${c.userId}`)}>
                              {c.userName}
                            </span>{" "}{c.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      className="flex-1 px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-300 transition"
                      placeholder="Write a comment..."
                      value={commentText[post._id] || ""}
                      onChange={(e) => setCommentText({ ...commentText, [post._id]: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && handleComment(post._id)}
                    />
                    <button onClick={() => handleComment(post._id)} className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 transition">
                      Post
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </main>

        {/* ── RIGHT SIDEBAR ── */}
        <aside className="w-60 shrink-0 py-5 px-3 space-y-4">

          {/* User Card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-col items-center text-center">
              <div
                className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-black cursor-pointer hover:scale-105 transition shadow"
                onClick={() => user?.id && navigate(`/profile/${user.id}`)}
              >
                {user?.name?.charAt(0).toUpperCase() || "U"}
              </div>

              <div className="mt-3 flex items-center gap-1.5">
                <span className="font-bold text-gray-800 text-sm">{user?.name || "Unknown"}</span>
                {user?.verified && (
                  <span className="text-[10px] bg-blue-100 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-bold">✓</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <MapPin size={10} />
                {user?.area?.replace(/-/g, " ") || "No area"}
              </p>

              <select
                className="mt-3 w-full px-2 py-1.5 rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-300 transition"
                value={user?.area || ""}
                onChange={(e) => {
                  const newArea = e.target.value;
                  const updatedUser = { ...user, area: newArea };
                  localStorage.setItem("user", JSON.stringify(updatedUser));
                  setUser(updatedUser);
                  if (socketRef.current) socketRef.current.emit("joinRoom", { area: newArea });
                }}
              >
                {areas.map((a) => (
                  <option key={a._id} value={a.name}>
                    {a.name.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>

              <button
                onClick={() => user?.id && navigate(`/profile/${user.id}`)}
                className="mt-3 w-full flex items-center justify-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium transition py-1.5 rounded-lg hover:bg-purple-50"
              >
                View Profile <ChevronRight size={12} />
              </button>
            </div>
          </div>

          {/* Leaderboard */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center">
                <Trophy size={13} className="text-amber-500" />
              </div>
              <span className="font-bold text-gray-800 text-sm">Hood Leaderboard</span>
            </div>

            {leaderboard.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">No activity yet</p>
            ) : (
              <div className="space-y-1">
                {leaderboard.map((entry, i) => (
                  <div
                    key={entry.userId}
                    onClick={() => navigate(`/profile/${entry.userId}`)}
                    className="flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-purple-50 cursor-pointer transition"
                  >
                    <span className="text-sm w-5 text-center shrink-0">
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : <span className="text-xs text-gray-400 font-bold">#{i + 1}</span>}
                    </span>
                    <span className="flex-1 text-xs font-medium text-gray-700 truncate">
                      {entry.name}
                      {entry.verified && <span className="ml-1 text-blue-400 text-[10px]">✓</span>}
                    </span>
                    <span className="text-[11px] font-semibold text-purple-500 bg-purple-50 px-1.5 py-0.5 rounded-full shrink-0">
                      {entry.score}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ── CREATE POST MODAL ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-600 to-purple-600">
              <h2 className="font-bold text-white text-base">Create Post</h2>
              <button onClick={() => setShowModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 text-white transition">
                <X size={14} />
              </button>
            </div>

            <div className="px-6 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <input
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white transition"
                placeholder="Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <textarea
                rows={3}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white transition resize-none"
                placeholder="What's happening in your hood?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <input
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white transition"
                placeholder="Location (optional)"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
              <button
                onClick={getLocation}
                className="w-full py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition"
              >
                📍 Use My Current Location
              </button>

              <div className="grid grid-cols-2 gap-2">
                <select
                  className="px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-400 transition"
                  value={type === "all" ? "casual" : type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="casual">💬 Casual</option>
                  <option value="emergency">🚨 Emergency</option>
                  <option value="event">📅 Event</option>
                  <option value="promotional">📢 Promotional</option>
                </select>
                <select
                  className="px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-400 transition"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                >
                  <option value="low">🟢 Low</option>
                  <option value="medium">🟡 Medium</option>
                  <option value="high">🔴 High</option>
                </select>
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" className="rounded accent-purple-600" checked={alertUsers} onChange={(e) => setAlertUsers(e.target.checked)} />
                  🔔 Alert users
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" className="rounded accent-purple-600" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
                  👤 Anonymous
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 cursor-pointer hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition">
                  📸 Image
                  <input type="file" accept="image/*" hidden onChange={(e) => { const file = e.target.files[0]; setImage(file); setImagePreview(URL.createObjectURL(file)); }} />
                </label>
                <label className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-gray-300 text-sm text-gray-500 cursor-pointer hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition">
                  🎥 Video
                  <input type="file" accept="video/*" hidden onChange={(e) => setVideo(e.target.files[0])} />
                </label>
              </div>

              {imagePreview && (
                <img src={imagePreview} className="w-full rounded-xl object-cover max-h-48" alt="preview" />
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => { handlePost(); setShowModal(false); }}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-sm shadow hover:shadow-md hover:from-blue-700 hover:to-purple-700 transition"
              >
                🚀 Post to Hood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EMERGENCY POPUP ── */}
      {emergencyPost && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-red-500 to-rose-700 text-white p-8 rounded-3xl w-full max-w-sm text-center shadow-2xl">
            <div className="text-5xl mb-3 animate-bounce">🚨</div>
            <h2 className="text-xl font-black mb-2">EMERGENCY ALERT</h2>
            <h3 className="text-base font-semibold opacity-90">{emergencyPost.title}</h3>
            <p className="mt-2 text-sm opacity-80">{emergencyPost.content}</p>
            <p className="mt-3 text-xs opacity-70">📍 {emergencyPost.targetAddress || emergencyPost.originAddress}</p>
            <button
              onClick={() => setEmergencyPost(null)}
              className="mt-6 bg-white text-red-600 px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-red-50 transition"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── AREA MODAL ── */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-7 w-full max-w-xs text-center shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto mb-4">
              <MapPin size={24} className="text-purple-600" />
            </div>
            <h2 className="text-lg font-black text-gray-800 mb-1">Where do you live?</h2>
            <p className="text-xs text-gray-400 mb-4">We'll show posts from your neighbourhood</p>
            <input
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 transition mb-3"
              placeholder="e.g. Andheri, Borivali, Majiwada"
              value={tempArea}
              onChange={(e) => setTempArea(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && tempArea) {
                  const formatted = tempArea.toLowerCase().replace(/\s/g, "-");
                  axios.post(`${BASE_URL}/areas`, { name: formatted }, { headers: authHeaders() });
                  const updatedUser = { ...user, area: formatted };
                  localStorage.setItem("user", JSON.stringify(updatedUser));
                  setUser(updatedUser);
                  if (socketRef.current) socketRef.current.emit("joinRoom", { area: formatted });
                  setShowLocationModal(false);
                }
              }}
            />
            <button
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-sm hover:from-blue-700 hover:to-purple-700 transition"
              onClick={() => {
                if (!tempArea) return;
                const formatted = tempArea.toLowerCase().replace(/\s/g, "-");
                axios.post(`${BASE_URL}/areas`, { name: formatted }, { headers: authHeaders() });
                const updatedUser = { ...user, area: formatted };
                localStorage.setItem("user", JSON.stringify(updatedUser));
                setUser(updatedUser);
                if (socketRef.current) socketRef.current.emit("joinRoom", { area: formatted });
                setShowLocationModal(false);
              }}
            >
              Let's Go →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
