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
} from "lucide-react";
import { io } from "socket.io-client";

// ── Alert sound ───────────────────────────────────────────────────────────────
const alertSound = new Audio(
  "https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3"
);

const BASE_URL = "https://hoodconnect-backend.onrender.com";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
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
  const [commentText, setCommentText] = useState({});

  // Bookmarks: set of post IDs the current user has bookmarked
  const [bookmarks, setBookmarks] = useState(new Set());

  // Leaderboard for current area
  const [leaderboard, setLeaderboard] = useState([]);

  // Show bookmarked posts only toggle
  const [showBookmarks, setShowBookmarks] = useState(false);

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

  // ── Fetch posts for current area ──────────────────────────────────────────
  const fetchPosts = async () => {
    try {
      const area = user?.area || "unknown";
      const res = await axios.get(`${BASE_URL}/posts?area=${area}`);
      setPosts(res.data);
    } catch (err) {
      console.log("fetchPosts error:", err);
    }
  };

  // ── Fetch leaderboard for current area ───────────────────────────────────
  const fetchLeaderboard = async (area) => {
    try {
      const res = await axios.get(`${BASE_URL}/leaderboard/${area || "unknown"}`);
      setLeaderboard(res.data);
    } catch (err) {
      console.log("fetchLeaderboard error:", err);
    }
  };

  // ── Fetch bookmarks ───────────────────────────────────────────────────────
  const fetchBookmarks = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/bookmarks`, {
        headers: authHeaders(),
      });
      setBookmarks(new Set(res.data.map((p) => p._id)));
    } catch (err) {
      console.log("fetchBookmarks error:", err);
    }
  };

  // ── Socket setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    socketRef.current = io(BASE_URL, { transports: ["websocket"] });

    const area = user?.area?.toLowerCase().replace(/\s/g, "-") || "unknown";
    socketRef.current.emit("joinRoom", { area });

    if (user?.id) {
      socketRef.current.emit("joinUserRoom", { userId: user.id });
    }

    socketRef.current.on("newNotification", (notif) => {
      setNotifications((prev) => [notif, ...prev]);
    });

    socketRef.current.on("newPost", (post) => {
      setPosts((prev) => [post, ...prev]);
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  // Re-join room when area changes
  useEffect(() => {
    if (!user?.area || !socketRef.current) return;
    const area = user.area.toLowerCase().replace(/\s/g, "-");
    socketRef.current.emit("joinRoom", { area });
  }, [user?.area]);

  // ── Fetch on mount + area change ──────────────────────────────────────────
  useEffect(() => {
    fetchPosts();
    fetchLeaderboard(user?.area);
  }, [user?.area]);

  // ── Fetch bookmarks on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (user?.id) fetchBookmarks();
  }, [user?.id]);

  // ── Fetch areas ───────────────────────────────────────────────────────────
  useEffect(() => {
    axios.get(`${BASE_URL}/areas`).then((res) => setAreas(res.data));
  }, []);

  // ── Show location modal if no area ────────────────────────────────────────
  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    if (!storedUser?.area || storedUser.area === "unknown") {
      setShowLocationModal(true);
    }
  }, []);

  // ── Emergency alert popup ─────────────────────────────────────────────────
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
        alertSound.play().catch(() => {});
        seenAlertsRef.current.add(post._id);
      }
    });
  }, [posts]);

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
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;
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

    // Bookmarks filter
    if (showBookmarks && !bookmarks.has(post._id)) return false;

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
      matchesNearMe =
        getDistance(
          Number(latitude),
          Number(longitude),
          postLat,
          postLng
        ) <= 5;
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
        {
          text: commentText[postId],
          userName: user?.name || "Anonymous",
          userId: user?.id,
        },
        { headers: authHeaders() }
      );
      setCommentText({ ...commentText, [postId]: "" });
      fetchPosts();
    } catch (err) {
      console.log("handleComment error:", err);
    }
  };

  const handleTrust = async (postId, trustType) => {
    try {
      await axios.put(
        `${BASE_URL}/posts/${postId}/trust`,
        { userId: user?.id, type: trustType },
        { headers: authHeaders() }
      );
      fetchPosts();
    } catch (err) {
      console.log("handleTrust error:", err);
    }
  };

  // ── Bookmark toggle ───────────────────────────────────────────────────────
  const handleBookmark = async (postId) => {
    try {
      const res = await axios.put(
        `${BASE_URL}/posts/${postId}/bookmark`,
        {},
        { headers: authHeaders() }
      );
      setBookmarks(new Set(res.data.bookmarks.map((id) => id.toString())));
    } catch (err) {
      console.log("handleBookmark error:", err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/");
  };

  // ── Tier helper ───────────────────────────────────────────────────────────
  function getTierEmoji(score) {
    if (score >= 150) return "💎";
    if (score >= 50) return "🥇";
    if (score >= 10) return "🥈";
    return "🥉";
  }

//----Colour-------------------------------------------------------------------
  function getCategoryColor(type, active = false) {
  const colors = {
    emergency: active
      ? "bg-red-100 text-red-600"
      : "text-red-500",
    event: active
      ? "bg-yellow-100 text-yellow-600"
      : "text-yellow-500",
    casual: active
      ? "bg-blue-100 text-blue-600"
      : "text-blue-500",
    promotional: active
      ? "bg-green-100 text-green-600"
      : "text-green-500",
    all: active
      ? "bg-purple-100 text-purple-600"
      : "text-purple-500",
  };

  return colors[type] || "";
}

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#eef2ff] to-[#ede9fe] flex flex-col text-gray-800">

      {/* HEADER */}
      <div className="flex justify-between items-center p-6 bg-white border-gray-200">
        <h1 className="text-3xl font-extrabold tracking-widest">HOODCONNECT</h1>

        <input
            className="w-full p-3 mb-4 rounded-xl border border-gray-200 bg-white"
            placeholder="Search posts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

        <div className="flex items-center gap-4">
          {/* BELL */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifications(!showNotifications);
                if (!showNotifications && user?.id) {
                  axios.put(
                    `${BASE_URL}/notifications/${user.id}/read`,
                    {},
                    { headers: authHeaders() }
                  );
                  setNotifications((prev) =>
                    prev.map((n) => ({ ...n, read: true }))
                  );
                }
              }}
              className="relative text-2xl"
            >
              🔔
              {notifications.filter((n) => !n.read).length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {notifications.filter((n) => !n.read).length}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 top-10 w-80 bg-white text-black rounded-2xl shadow-2xl z-50 overflow-hidden">
                <div className="p-3 border-b font-bold text-gray-700">
                  Notifications
                </div>
                {notifications.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500 text-center">
                    No notifications yet
                  </p>
                ) : (
                  notifications.slice(0, 10).map((n, i) => (
                    <div
                      key={i}
                      className={`p-3 border-b text-sm ${
                        !n.read ? "bg-blue-50" : ""
                      }`}
                    >
                      <p>
                        <b>{n.senderName}</b>{" "}
                        {n.type === "like" && "liked your post"}
                        {n.type === "comment" && "commented on your post"}
                        {n.type === "trust" && "voted on your post"}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        📝 {n.postTitle}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(n.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="bg-red-500 px-4 py-2 rounded-lg"
          >
            Logout
          </button>
        </div>
      </div>

      {/* BODY */}
      <div className="flex flex-1 gap-6 px-6">

        {/* LEFT SIDEBAR */}
        <div
          className={`bg-white border border-gray-200 shadow-sm p-4 rounded-2xl h-fit sticky top-6 ${
            collapsed ? "w-20" : "w-64"
          }`}
        >
          <button onClick={() => setCollapsed(!collapsed)} className="mb-4">
            <Menu />
          </button>

          <button
            onClick={() => {
              setNearMe(!nearMe);
              getLocation();
            }}
            className={`w-full p-2 mb-2 rounded-lg hover:bg-gray-100 flex items-center gap-2 ${
              nearMe ? "bg-white/20" : ""
            }`}
          >
            📍 {!collapsed && "Near Me"}
          </button>

          {/* Bookmarks toggle */}
          <button
            onClick={() => setShowBookmarks(!showBookmarks)}
            className={`w-full p-2 mb-2 rounded-lg hover:bg-gray-100 flex items-center gap-2 ${
              showBookmarks ? "bg-white/20" : ""
            }`}
          >
            {showBookmarks ? (
              <BookmarkCheck size={18} />
            ) : (
              <Bookmark size={18} />
            )}
            {!collapsed && <span>Saved Posts</span>}
          </button>

          {filters.map((f) => {
            const Icon = f.icon;
            return (
              <button
                key={f.key}
                onClick={() => setType(f.key)}
                className={`flex items-center gap-3 w-full p-2 rounded-lg transition ${
                  type === f.key
                    ? getCategoryColor(f.key, true)
                    : "hover:bg-gray-100"
                }`}
              >
                <Icon size={18} className={getCategoryColor(f.key)} />
                {!collapsed && <span>{f.label}</span>}
              </button>
            );
          })}
        </div>

        {/* CENTER */}
        <div className="flex-1 max-w-2xl mx-auto p-6 relative z-10">
          <button
            onClick={() => setShowModal(true)}
            className="w-full mb-6 bg-purple-600 hover:bg-purple-700 text-white p-3 rounded-xl"
          >
            ➕ Create Post
          </button>

          {/* AREA HEADING */}
          <div className="mb-4 text-sm text-black/60 font-semibold uppercase tracking-widest">
            {showBookmarks
              ? "📌 Saved Posts"
              : `📍 ${
                  user?.area
                    ?.replace(/-/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase()) || "Your Hood"
                }`}
          </div>

          {/* POST CARDS */}
          {filteredPosts.length === 0 && (
            <div className="text-center text-white/40 py-16">
              {showBookmarks
                ? "No saved posts yet. Bookmark posts to see them here."
                : "No posts in this area yet. Be the first!"}
            </div>
          )}

          {filteredPosts.map((post) => (
            <div
              key={post._id}
              className="bg-white text-black rounded-2xl mb-6 overflow-hidden shadow-sm hover:shadow-md transition"
            >
              {/* POST HEADER */}
              <div className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p
                      className="font-semibold text-sm text-gray-700 cursor-pointer hover:text-purple-600 flex items-center gap-1"
                      onClick={() =>
                        post.userId && navigate(`/profile/${post.userId}`)
                      }
                    >
                      👤 {post.userName || "Anonymous"}
                      {/* Verified badge - shown if author is verified */}
                      {post.verified && (
                        <span
                          title="Verified community member"
                          className="ml-1 text-gray-500 text-xs bg-blue-100 px-1.5 py-0.5 rounded-full font-bold"
                        >
                          ✓ Verified
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(post.createdAt).toLocaleDateString()} •{" "}
                      {new Date(post.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  {/* Bookmark button */}
                  <button
                    onClick={() => handleBookmark(post._id)}
                    className="text-gray-400 hover:text-purple-600 transition"
                    title={
                      bookmarks.has(post._id)
                        ? "Remove bookmark"
                        : "Save post"
                    }
                  >
                    {bookmarks.has(post._id) ? (
                      <BookmarkCheck size={20} className="text-purple-600" />
                    ) : (
                      <Bookmark size={20} />
                    )}
                  </button>
                </div>

                <p className="font-semibold mt-1">
                  📍 {post.targetAddress || "Not specified"}
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
                <span
                  className={`inline-block text-xs px-2 py-1 rounded-full font-semibold ${
                    post.type === "emergency"
                      ? "bg-red-100 text-red-600"
                      : post.type === "event"
                      ? "bg-yellow-100 text-yellow-600"
                      : post.type === "promotional"
                      ? "bg-green-100 text-green-600"
                      : "bg-blue-100 text-blue-600"
                  }`}
                >
                  {post.type}
                </span>
                <p className="text-xs text-gray-500">
                  ⏳ {getTimeLeft(post.createdAt)}
                </p>
              </div>

              {post.type === "emergency" && post.alert && (
                <div className="bg-red-500 text-white p-2 text-center font-bold">
                  🚨 EMERGENCY ALERT
                </div>
              )}

              <h3 className="px-4 font-bold text-purple-600">{post.title}</h3>
              <p className="px-4 pb-2">{post.content}</p>

              {post.image && (
                <img
                  src={post.image}
                  className="w-full"
                  onError={(e) => (e.target.style.display = "none")}
                  alt="post"
                />
              )}
              {post.video && (
                <video src={post.video} controls className="w-full" />
              )}

              {/* TRUST BAR — visual breakdown */}
              {(post.trustUpvotes?.length > 0 ||
                post.trustDownvotes?.length > 0) && (
                <div className="px-4 pt-2">
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                    <span>Community Trust</span>
                    <span className="ml-auto">
                      {post.trustUpvotes?.length || 0} /{" "}
                      {(post.trustUpvotes?.length || 0) +
                        (post.trustDownvotes?.length || 0)}{" "}
                      verified
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{
                        width: `${
                          ((post.trustUpvotes?.length || 0) /
                            Math.max(
                              1,
                              (post.trustUpvotes?.length || 0) +
                                (post.trustDownvotes?.length || 0)
                            )) *
                          100
                        }%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* ACTIONS */}
              <div className="flex justify-between px-4 py-3 text-sm">
                <div className="flex gap-4 flex-wrap">
                  <button
                    onClick={() => handleTrust(post._id, "up")}
                    className="hover:scale-110 transition"
                  >
                    👍 {post.trustUpvotes?.length || 0}
                  </button>
                  <button
                    onClick={() => handleTrust(post._id, "down")}
                    className="hover:scale-110 transition"
                  >
                    ❌ {post.trustDownvotes?.length || 0}
                  </button>
                  <button
                    onClick={() => handleLike(post._id)}
                    className="hover:scale-110 transition"
                  >
                    ❤️ {post.likes?.length || 0}
                  </button>
                  <button>💬 {post.comments?.length || 0}</button>
                  {/* Only show edit/delete for own posts */}
                  {post.userId === user?.id && (
                    <>
                      <button onClick={() => handleEdit(post._id)}>
                        ✏️ Edit
                      </button>
                      <button onClick={() => handleDelete(post._id)}>
                        🗑️ Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* COMMENTS */}
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
                <div className="mt-3">
                  {post.comments?.map((c, i) => (
                    <p key={i} className="text-sm text-gray-700">
                      <b
                        className="cursor-pointer hover:text-purple-600"
                        onClick={() =>
                          c.userId && navigate(`/profile/${c.userId}`)
                        }
                      >
                        {c.userName}:
                      </b>{" "}
                      {c.text}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* RIGHT SIDEBAR */}
        <div className="w-72 space-y-4 sticky top-6 h-fit">

          {/* USER CARD */}
          <div className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl">
            <div className="text-center">
              <div
                className="w-16 h-16 mx-auto bg-purple-500 rounded-full flex items-center justify-center text-xl cursor-pointer hover:bg-purple-400 transition"
                onClick={() => user?.id && navigate(`/profile/${user.id}`)}
              >
                {user?.name?.charAt(0) || "U"}
              </div>
              <h2 className="mt-3 flex items-center justify-center gap-1">
                {user?.name || "Unknown User"}
                {user?.verified && (
                  <span
                    title="Verified community member"
                    className="text-gray-400 text-sm bg-blue-900/50 px-1.5 py-0.5 rounded-full"
                  >
                    ✓
                  </span>
                )}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
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
                    {a.name
                      .replace(/-/g, " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* LEADERBOARD CARD */}
          <div className="bg-white border border-gray-200 shadow-sm p-5 rounded-2xl">
            <h3 className="font-bold flex items-center gap-2 mb-3">
              <Trophy size={16} className="text-yellow-400" />
              Hood Leaderboard
            </h3>
            {leaderboard.length === 0 ? (
              <p className="text-sm text-white/40 text-center">No data yet</p>
            ) : (
              leaderboard.map((entry, i) => (
                <div
                  key={entry.userId}
                  className="flex items-center gap-2 py-2 border-b border-white/10 last:border-0 cursor-pointer hover:bg-white/5 rounded px-1"
                  onClick={() => navigate(`/profile/${entry.userId}`)}
                >
                  <span className="text-lg">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                  </span>
                  <span className="flex-1 text-sm truncate">
                    {entry.name}
                    {entry.verified && (
                      <span className="ml-1 text-gray-400 text-xs">✓</span>
                    )}
                  </span>
                  <span className="text-xs text-white/60">
                    {entry.score} pts
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* CREATE POST MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50">
          <div className="bg-white text-black p-6 rounded-2xl w-[420px] shadow-2xl relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-3 right-4 text-white/60 text-xl"
            >
              ✖
            </button>

            <h2 className="text-xl font-bold mb-4 text-center">
              ✨ Create New Post
            </h2>

            <input
              className="w-full p-3 mb-3 rounded-xl bg-white border border-gray-200 shadow-sm border border-white/20"
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              className="w-full p-3 mb-3 rounded-xl bg-white border border-gray-200 shadow-sm border border-white/20"
              placeholder="Content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <input
              className="w-full p-3 mb-3 rounded-xl bg-white border border-gray-200 shadow-sm border border-white/20"
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
              className="w-full p-2 mb-3 rounded-xl bg-white border border-gray-200 shadow-sm border border-white/20"
              value={type === "all" ? "casual" : type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="casual">Casual</option>
              <option value="emergency">Emergency</option>
              <option value="event">Event</option>
              <option value="promotional">Promotional</option>
            </select>

            <select
              className="w-full p-2 mb-3 rounded-xl bg-white border border-gray-200 shadow-sm border border-white/20"
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
              <label className="flex-1 bg-white border border-gray-200 shadow-sm border border-white/20 p-2 rounded-xl text-center cursor-pointer hover:bg-white/20">
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
              <label className="flex-1 bg-white border border-gray-200 shadow-sm border border-white/20 p-2 rounded-xl text-center cursor-pointer hover:bg-white/20">
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
              <img
                src={imagePreview}
                className="w-full rounded-xl mt-3"
                alt="preview"
              />
            )}

            <button
              onClick={() => {
                handlePost();
                setShowModal(false);
              }}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white p-3 rounded-xl mt-3"
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

                axios.post(
                  `${BASE_URL}/areas`,
                  { name: formatted },
                  { headers: authHeaders() }
                );

                const updatedUser = { ...user, area: formatted };
                localStorage.setItem("user", JSON.stringify(updatedUser));
                setUser(updatedUser);
                if (socketRef.current)
                  socketRef.current.emit("joinRoom", { area: formatted });
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
