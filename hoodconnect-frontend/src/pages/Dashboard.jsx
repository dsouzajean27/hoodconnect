import { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  Globe, AlertTriangle, Calendar, User, Megaphone,
  Menu, Bookmark, BookmarkCheck, Trophy,
  MapPin, Bell, LogOut, Plus, ChevronRight, X,
  Camera, Image, Video, Navigation,
} from "lucide-react";
import { io } from "socket.io-client";
import logo from "../assets/logo.png";

// ── Emergency sound (Web Audio API — no external URL needed) ─────────────────
// Generates a siren-like tone so it always works, even offline
function playEmergencySound() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.connect(ctx.destination);

    // Two alternating tones like a siren
    [0, 0.6, 1.2, 1.8].forEach((t, i) => {
      const osc  = ctx.createOscillator();
      osc.type   = "sine";
      osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 660, ctx.currentTime + t);
      osc.connect(gain);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.5);
    });

    setTimeout(() => ctx.close(), 3000);
  } catch (e) {
    console.log("Audio error:", e);
  }
}

const BASE_URL = "https://hoodconnect-backend.onrender.com";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const TAG = {
  emergency:   "bg-red-100 text-red-600 border border-red-200",
  event:       "bg-amber-100 text-amber-700 border border-amber-200",
  casual:      "bg-blue-100 text-blue-600 border border-blue-200",
  promotional: "bg-emerald-100 text-emerald-700 border border-emerald-200",
};
const TYPE_ICON = { emergency:"🚨", event:"📅", casual:"💬", promotional:"📢" };

// ── Google Maps URL builder ───────────────────────────────────────────────────
function mapsUrl(lat, lng, label) {
  if (lat && lng) return `https://www.google.com/maps?q=${lat},${lng}`;
  if (label)      return `https://www.google.com/maps/search/${encodeURIComponent(label)}`;
  return null;
}

export default function Dashboard() {
  const [posts, setPosts]         = useState([]);
  const [title, setTitle]         = useState("");
  const [content, setContent]     = useState("");
  const [location, setLocation]   = useState("");
  const [type, setType]           = useState("all");
  const [search, setSearch]       = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const [image, setImage]             = useState(null);
  const [video, setVideo]             = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const [latitude, setLatitude]   = useState("");
  const [longitude, setLongitude] = useState("");

  const [showLocationModal, setShowLocationModal] = useState(false);
  const [tempArea, setTempArea] = useState("");
  const [areas, setAreas]       = useState([]);

  const [notifications, setNotifications]         = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  const [nearMe, setNearMe]         = useState(false);
  const [showModal, setShowModal]   = useState(false);
  const [anonymous, setAnonymous]   = useState(false);
  const [alertUsers, setAlertUsers] = useState(false);
  const [severity, setSeverity]     = useState("low");

  const [emergencyPost, setEmergencyPost]   = useState(null);
  const [commentText, setCommentText]       = useState({});
  const [openComments, setOpenComments]     = useState({});

  const [bookmarks, setBookmarks]       = useState(new Set());
  const [leaderboard, setLeaderboard]   = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);

  // ── Camera modal state ────────────────────────────────────────────────────
  const [showCamera, setShowCamera]           = useState(false);
  const [cameraStream, setCameraStream]       = useState(null);
  const [capturedPhoto, setCapturedPhoto]     = useState(null);  // blob URL
  const [capturedBlob, setCapturedBlob]       = useState(null);  // actual blob
  const [cameraFacing, setCameraFacing]       = useState("environment"); // rear default
  const [cameraGPS, setCameraGPS]             = useState(null);  // { lat, lng, address }
  const [cameraMode, setCameraMode]           = useState("photo"); // "photo" | "video"
  const [isRecording, setIsRecording]         = useState(false);
  const [recordedChunks, setRecordedChunks]   = useState([]);

  // Geotagged data to attach to post
  const [geotagged, setGeotagged]             = useState(false);
  const [captureAddress, setCaptureAddress]   = useState(null);
  const [captureLat, setCaptureLat]           = useState(null);
  const [captureLng, setCaptureLng]           = useState(null);

  const videoRef       = useRef(null);
  const mediaRecRef    = useRef(null);
  const seenAlertsRef  = useRef(new Set());
  const socketRef      = useRef(null);

  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user")); }
    catch { return null; }
  });

  const navigate = useNavigate();

  const filters = [
    { key: "all",         label: "All",       icon: Globe },
    { key: "emergency",   label: "Emergency", icon: AlertTriangle },
    { key: "event",       label: "Event",     icon: Calendar },
    { key: "casual",      label: "Casual",    icon: User },
    { key: "promotional", label: "Promo",     icon: Megaphone },
  ];

  // ── Data fetchers ─────────────────────────────────────────────────────────
  const fetchPosts = async () => {
    try {
      const area = user?.area || "unknown";
      const res  = await axios.get(`${BASE_URL}/posts?area=${area}`);
      setPosts(res.data);
    } catch (err) { console.log("fetchPosts:", err); }
  };

  const fetchLeaderboard = async (area) => {
    try {
      const res = await axios.get(`${BASE_URL}/leaderboard/${area || "unknown"}`);
      setLeaderboard(res.data);
    } catch (err) { console.log("fetchLeaderboard:", err); }
  };

  const fetchBookmarks = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/bookmarks`, { headers: authHeaders() });
      setBookmarks(new Set(res.data.map((p) => p._id)));
    } catch (err) { console.log("fetchBookmarks:", err); }
  };

  // ── Socket ────────────────────────────────────────────────────────────────
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

  // ── Emergency alert ───────────────────────────────────────────────────────
  useEffect(() => {
    posts.forEach((post) => {
      const isRecent = new Date() - new Date(post.createdAt) < 24 * 60 * 60 * 1000;
      if (post.type === "emergency" && post.alert && isRecent && !seenAlertsRef.current.has(post._id)) {
        setEmergencyPost(post);
        playEmergencySound();   // ← Web Audio siren
        seenAlertsRef.current.add(post._id);
      }
    });
  }, [posts]);

  // ── Geolocation ───────────────────────────────────────────────────────────
  const getLocation = () => {
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLatitude(pos.coords.latitude); setLongitude(pos.coords.longitude); },
      (err)  => console.log("Geolocation error:", err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371, dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const getTimeLeft = (createdAt) => {
    const diff = 24*60*60*1000 - (new Date() - new Date(createdAt));
    if (diff <= 0) return "Expired";
    return `${Math.floor(diff/(1000*60*60))}h ${Math.floor((diff/(1000*60))%60)}m`;
  };

  // ── Filtered posts ────────────────────────────────────────────────────────
  const filteredPosts = (posts || []).filter((post) => {
    if (!post) return false;
    if (showBookmarks && !bookmarks.has(post._id)) return false;
    const matchesType   = type === "all" || post.type === type;
    const matchesSearch = search === "" || ((post.title||"")+(post.content||"")+(post.targetAddress||"")).toLowerCase().includes(search.toLowerCase());
    let matchesNearMe   = true;
    if (nearMe) {
      const postLat = Number(post.targetLat || post.originLat);
      const postLng = Number(post.targetLng || post.originLng);
      if (!latitude || !longitude || !postLat || !postLng) return false;
      matchesNearMe = getDistance(Number(latitude), Number(longitude), postLat, postLng) <= 5;
    }
    return matchesType && matchesSearch && matchesNearMe;
  });

  // ══════════════════════════════════════════════════════════════════════════
  // CAMERA MODAL LOGIC
  // ══════════════════════════════════════════════════════════════════════════

  const startCamera = useCallback(async (facing = cameraFacing) => {
    // Stop any existing stream first
    if (cameraStream) { cameraStream.getTracks().forEach((t) => t.stop()); }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: cameraMode === "video",
      });
      setCameraStream(stream);
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }

      // Grab GPS at camera open time
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setCameraGPS({ lat, lng });
        setCaptureLat(lat);
        setCaptureLng(lng);
        try {
          const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const data = await res.json();
          const addr = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
          setCaptureAddress(addr);
        } catch { setCaptureAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`); }
      }, () => {}, { enableHighAccuracy: true });

    } catch (err) {
      alert("Camera access denied or not available: " + err.message);
    }
  }, [cameraFacing, cameraMode, cameraStream]);

  const stopCamera = useCallback(() => {
    if (cameraStream) { cameraStream.getTracks().forEach((t) => t.stop()); setCameraStream(null); }
    if (videoRef.current) { videoRef.current.srcObject = null; }
  }, [cameraStream]);

  const openCameraModal = () => {
    setCapturedPhoto(null); setCapturedBlob(null);
    setShowCamera(true);
    setTimeout(() => startCamera(cameraFacing), 100);
  };

  const closeCameraModal = () => {
    stopCamera();
    setShowCamera(false);
    setCapturedPhoto(null); setCapturedBlob(null);
  };

  const flipCamera = () => {
    const next = cameraFacing === "environment" ? "user" : "environment";
    setCameraFacing(next);
    startCamera(next);
  };

  // ── Capture photo ─────────────────────────────────────────────────────────
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width  = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");

    // Draw frame
    ctx.drawImage(videoRef.current, 0, 0);

    // Stamp geotag overlay if GPS available
    if (cameraGPS) {
      const stamp = `📍 ${captureAddress || `${cameraGPS.lat.toFixed(5)}, ${cameraGPS.lng.toFixed(5)}`}  •  ${new Date().toLocaleString()}`;
      ctx.font         = "bold 18px monospace";
      ctx.fillStyle    = "rgba(0,0,0,0.55)";
      const tw = ctx.measureText(stamp).width;
      ctx.fillRect(10, canvas.height - 42, tw + 20, 32);
      ctx.fillStyle    = "#ffffff";
      ctx.fillText(stamp, 20, canvas.height - 18);
    }

    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      setCapturedPhoto(url);
      setCapturedBlob(blob);
      setGeotagged(true);
      stopCamera();
    }, "image/jpeg", 0.92);
  };

  // ── Record video ──────────────────────────────────────────────────────────
  const startRecording = () => {
    if (!cameraStream) return;
    const chunks = [];
    const mr     = new MediaRecorder(cameraStream, { mimeType: "video/webm" });
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url  = URL.createObjectURL(blob);
      setCapturedPhoto(url);   // reuse for preview
      setCapturedBlob(blob);
      setGeotagged(true);
      stopCamera();
    };
    mr.start();
    mediaRecRef.current = mr;
    setIsRecording(true);
  };

  const stopRecording = () => {
    mediaRecRef.current?.stop();
    setIsRecording(false);
  };

  // ── Use captured media in post ────────────────────────────────────────────
  const useCapturedMedia = () => {
    if (!capturedBlob) return;
    const ext  = cameraMode === "video" ? "webm" : "jpg";
    const file = new File([capturedBlob], `capture.${ext}`, { type: capturedBlob.type });
    if (cameraMode === "video") {
      setVideo(file);
    } else {
      setImage(file);
      setImagePreview(capturedPhoto);
    }
    setShowCamera(false);
    setShowModal(true);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // POST HANDLERS
  // ══════════════════════════════════════════════════════════════════════════

  const handlePost = async () => {
    try {
      const formData = new FormData();
      formData.append("title",     title);
      formData.append("content",   content);
      formData.append("location",  location || "Unknown");
      formData.append("latitude",  latitude || "");
      formData.append("longitude", longitude || "");
      formData.append("type",      type === "all" ? "casual" : type);
      formData.append("area",      user?.area || "unknown");
      formData.append("userId",    user?.id);
      formData.append("userName",  user?.name || "Unknown");
      formData.append("anonymous", String(anonymous));
      formData.append("alert",     String(alertUsers));
      formData.append("severity",  severity);
      // Geotagged camera data
      formData.append("geotagged",      String(geotagged));
      if (captureLat)     formData.append("captureLat",     captureLat);
      if (captureLng)     formData.append("captureLng",     captureLng);
      if (captureAddress) formData.append("captureAddress", captureAddress);

      if (image) formData.append("image", image);
      if (video) formData.append("video", video);

      await axios.post(`${BASE_URL}/posts`, formData, { headers: { ...authHeaders() } });
      setTitle(""); setContent(""); setLocation(""); setImage(null); setVideo(null);
      setImagePreview(null); setAnonymous(false); setAlertUsers(false);
      setGeotagged(false); setCaptureLat(null); setCaptureLng(null); setCaptureAddress(null);
      fetchPosts();
    } catch (err) { console.log("handlePost:", err); }
  };

  const handleDelete   = async (postId) => {
    try { await axios.delete(`${BASE_URL}/posts/${postId}`, { headers: authHeaders() }); fetchPosts(); }
    catch (err) { console.log("handleDelete:", err); }
  };

  const handleEdit     = async (postId) => {
    const newText = prompt("Edit your post content:");
    if (!newText) return;
    try { await axios.put(`${BASE_URL}/posts/${postId}`, { content: newText }, { headers: authHeaders() }); fetchPosts(); }
    catch (err) { console.log("handleEdit:", err); }
  };

  const handleLike     = async (postId) => {
    try { await axios.put(`${BASE_URL}/posts/${postId}/like`, { userId: user?.id }, { headers: authHeaders() }); fetchPosts(); }
    catch (err) { console.log("handleLike:", err); }
  };

  const handleComment  = async (postId) => {
    try {
      if (!commentText[postId]) return;
      await axios.post(`${BASE_URL}/posts/${postId}/comment`, { text: commentText[postId], userName: user?.name || "Anonymous", userId: user?.id }, { headers: authHeaders() });
      setCommentText({ ...commentText, [postId]: "" }); fetchPosts();
    } catch (err) { console.log("handleComment:", err); }
  };

  const handleTrust    = async (postId, trustType) => {
    try { await axios.put(`${BASE_URL}/posts/${postId}/trust`, { userId: user?.id, type: trustType }, { headers: authHeaders() }); fetchPosts(); }
    catch (err) { console.log("handleTrust:", err); }
  };

  const handleBookmark = async (postId) => {
    try {
      const res = await axios.put(`${BASE_URL}/posts/${postId}/bookmark`, {}, { headers: authHeaders() });
      setBookmarks(new Set(res.data.bookmarks.map((id) => id.toString())));
    } catch (err) { console.log("handleBookmark:", err); }
  };

  const handleLogout   = () => { localStorage.removeItem("user"); localStorage.removeItem("token"); navigate("/"); };

  const unreadCount = notifications.filter((n) => !n.read).length;

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
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
                    <button onClick={() => setShowNotifications(false)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="p-5 text-sm text-gray-400 text-center">You're all caught up 🎉</p>
                  ) : notifications.slice(0, 10).map((n, i) => (
                    <div key={i} className={`px-4 py-3 border-b border-gray-50 text-sm ${!n.read ? "bg-blue-50/60" : ""}`}>
                      <p className="text-gray-700">
                        <span className="font-semibold text-gray-900">{n.senderName}</span>{" "}
                        {n.type === "like" && "liked your post"}
                        {n.type === "comment" && "commented on your post"}
                        {n.type === "trust" && "voted on your post"}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">📝 {n.postTitle}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 text-sm font-medium transition">
              <LogOut size={15} /> Logout
            </button>
          </div>
        </div>
      </header>

      {/* ── BODY ── */}
      <div className="flex flex-1">

        {/* ── LEFT SIDEBAR ── */}
        <aside className={`bg-white border-r border-gray-200 flex flex-col gap-1 py-4 px-2 shrink-0 transition-all duration-200 ${collapsed ? "w-14" : "w-48"}`}>
          <button onClick={() => setCollapsed(!collapsed)} className="w-full flex items-center justify-center p-2 rounded-xl hover:bg-gray-100 text-gray-400 mb-1 transition">
            <Menu size={17} />
          </button>
          {[
            { action: () => { setNearMe(!nearMe); getLocation(); }, active: nearMe, icon: <MapPin size={16} className={nearMe ? "text-white" : "text-purple-500"} />, label: "Near Me" },
            { action: () => setShowBookmarks(!showBookmarks), active: showBookmarks, icon: showBookmarks ? <BookmarkCheck size={16} className="text-white" /> : <Bookmark size={16} className="text-purple-500" />, label: "Saved" },
          ].map((item, i) => (
            <button key={i} onClick={item.action}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition ${item.active ? "bg-purple-600 text-white" : "hover:bg-gray-100 text-gray-600"}`}>
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
          <div className="my-1 mx-2 border-t border-gray-100" />
          {filters.map((f) => {
            const Icon = f.icon, active = type === f.key;
            return (
              <button key={f.key} onClick={() => setType(f.key)}
                className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition ${active ? "bg-purple-600 text-white" : "hover:bg-gray-100 text-gray-600"}`}>
                <Icon size={16} className={active ? "text-white" : "text-purple-500"} />
                {!collapsed && <span>{f.label}</span>}
              </button>
            );
          })}
        </aside>

        {/* ── CENTER FEED ── */}
        <main className="flex-1 py-5 px-4 overflow-y-auto" style={{ maxWidth: 640, margin: "0 auto" }}>

          {/* Action buttons row */}
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => setShowModal(true)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold text-sm shadow-md hover:shadow-lg hover:from-blue-700 hover:to-purple-700 transition"
            >
              <Plus size={17} /> Create Post
            </button>
            {/* Camera quick-launch */}
            <button
              onClick={openCameraModal}
              title="Geotagged camera"
              className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md text-purple-600 font-semibold text-sm transition"
            >
              <Camera size={17} /> <span className="hidden sm:inline">Camera</span>
            </button>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <MapPin size={13} className="text-purple-400" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              {showBookmarks ? "Saved Posts" : user?.area?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Your Hood"}
            </span>
          </div>

          {filteredPosts.length === 0 && (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center text-gray-400 text-sm">
              {showBookmarks ? "No saved posts yet." : "No posts in this area yet — be the first! 🌟"}
            </div>
          )}

          {/* ── POST CARDS ── */}
          {filteredPosts.map((post) => (
            <article key={post._id} className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5 overflow-hidden hover:shadow-md transition">

              {post.type === "emergency" && post.alert && (
                <div className="bg-gradient-to-r from-red-500 to-rose-600 text-white px-4 py-2 text-xs font-bold tracking-wide flex items-center gap-2">
                  <span className="animate-pulse">🚨</span> EMERGENCY ALERT
                </div>
              )}

              {/* Header */}
              <div className="flex items-start justify-between px-4 pt-4 pb-2">
                <div className="flex items-start gap-3">
                  <div
                    className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white font-bold text-sm cursor-pointer shrink-0"
                    onClick={() => post.userId && navigate(`/profile/${post.userId}`)}
                  >
                    {(post.userName || "A")[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap cursor-pointer" onClick={() => post.userId && navigate(`/profile/${post.userId}`)}>
                      <span className="font-semibold text-sm text-gray-800 hover:text-purple-600 transition">{post.userName || "Anonymous"}</span>
                      {post.verified && (
                        <span className="text-[10px] bg-blue-100 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-bold">✓ Verified</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${TAG[post.type] || "bg-gray-100 text-gray-500"}`}>
                        {TYPE_ICON[post.type]} {post.type}
                      </span>
                      {/* Geotagged badge */}
                      {post.geotagged && (
                        <span className="text-[10px] bg-green-100 text-green-600 border border-green-200 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5">
                          <Navigation size={9} /> Geotagged
                        </span>
                      )}
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

              {/* Location → Google Maps link */}
              <div className="px-4 pb-2">
                {mapsUrl(post.targetLat || post.originLat, post.targetLng || post.originLng, post.targetAddress) ? (
                  <a
                    href={mapsUrl(post.targetLat || post.originLat, post.targetLng || post.originLng, post.targetAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:text-blue-700 underline flex items-center gap-1 transition"
                  >
                    <MapPin size={10} className="text-purple-400 shrink-0" />
                    <span className="truncate">{post.targetAddress || post.originAddress || "View on Maps"}</span>
                    {latitude && (post.targetLat || post.originLat) && (
                      <span className="ml-auto shrink-0 text-gray-400 no-underline">
                        {getDistance(Number(latitude), Number(longitude), Number(post.targetLat||post.originLat), Number(post.targetLng||post.originLng)).toFixed(1)} km
                      </span>
                    )}
                  </a>
                ) : (
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <MapPin size={10} className="text-purple-400 shrink-0" />
                    <span className="truncate">{post.targetAddress || post.originAddress || "Unknown"}</span>
                  </p>
                )}

                {/* Capture location link for geotagged posts */}
                {post.geotagged && post.captureLat && (
                  <a
                    href={`https://www.google.com/maps?q=${post.captureLat},${post.captureLng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-green-600 hover:text-green-800 flex items-center gap-1 mt-0.5"
                  >
                    <Navigation size={9} /> Photo taken here · {post.captureAddress || `${post.captureLat?.toFixed(4)}, ${post.captureLng?.toFixed(4)}`}
                  </a>
                )}
              </div>

              {/* Content */}
              <div className="px-4 pb-3">
                <h3 className="font-bold text-gray-900 text-base leading-snug">{post.title}</h3>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">{post.content}</p>
              </div>

              {/* Media */}
              {post.image && <img src={post.image} className="w-full max-h-72 object-cover" onError={(e) => (e.target.style.display="none")} alt="post" />}
              {post.video && <video src={post.video} controls className="w-full" />}

              {/* Trust bar */}
              {(post.trustUpvotes?.length > 0 || post.trustDownvotes?.length > 0) && (
                <div className="px-4 pt-2 pb-1">
                  <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                    <span>Community Trust</span>
                    <span className="text-gray-500 font-medium">
                      {post.trustUpvotes?.length||0}/{(post.trustUpvotes?.length||0)+(post.trustDownvotes?.length||0)} verified
                    </span>
                  </div>
                  <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all"
                      style={{ width:`${((post.trustUpvotes?.length||0)/Math.max(1,(post.trustUpvotes?.length||0)+(post.trustDownvotes?.length||0)))*100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 px-3 py-2 border-t border-gray-50 flex-wrap">
                <button onClick={() => handleTrust(post._id,"up")}    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-green-50 hover:text-green-600 transition">👍 {post.trustUpvotes?.length||0}</button>
                <button onClick={() => handleTrust(post._id,"down")}  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-500 transition">👎 {post.trustDownvotes?.length||0}</button>
                <button onClick={() => handleLike(post._id)}          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-pink-50 hover:text-pink-500 transition">❤️ {post.likes?.length||0}</button>
                <button onClick={() => setOpenComments((p) => ({...p,[post._id]:!p[post._id]}))}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${openComments[post._id]?"bg-blue-100 text-blue-600":"text-gray-500 hover:bg-blue-50 hover:text-blue-500"}`}>
                  💬 {post.comments?.length||0}
                </button>
                <div className="flex-1" />
                <span className="text-[11px] text-gray-300 px-1">⏳ {getTimeLeft(post.createdAt)}</span>
                {post.userId === user?.id && (
                  <>
                    <button onClick={() => handleEdit(post._id)}   className="px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition">✏️</button>
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
                            {(c.userName||"A")[0].toUpperCase()}
                          </div>
                          <div className="bg-white rounded-xl px-3 py-2 text-xs text-gray-700 border border-gray-100 flex-1">
                            <span className="font-semibold text-purple-600 cursor-pointer" onClick={() => c.userId && navigate(`/profile/${c.userId}`)}>{c.userName}</span>{" "}{c.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      className="flex-1 px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-300 transition"
                      placeholder="Write a comment..."
                      value={commentText[post._id]||""}
                      onChange={(e) => setCommentText({...commentText,[post._id]:e.target.value})}
                      onKeyDown={(e) => e.key==="Enter" && handleComment(post._id)}
                    />
                    <button onClick={() => handleComment(post._id)} className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 transition">Post</button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </main>

        {/* ── RIGHT SIDEBAR ── */}
        <aside className="w-60 shrink-0 py-5 px-3 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-black cursor-pointer hover:scale-105 transition shadow"
                onClick={() => user?.id && navigate(`/profile/${user.id}`)}>
                {user?.name?.charAt(0).toUpperCase() || "U"}
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <span className="font-bold text-gray-800 text-sm">{user?.name||"Unknown"}</span>
                {user?.verified && <span className="text-[10px] bg-blue-100 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-bold">✓</span>}
              </div>
              {/* Aadhaar status badge */}
              {user?.aadhaarStatus === "pending" && (
                <span className="mt-1 text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">🕐 ID Review Pending</span>
              )}
              {user?.aadhaarStatus === "verified" && (
                <span className="mt-1 text-[10px] bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-semibold">🛡️ ID Verified</span>
              )}
              {user?.aadhaarStatus === "rejected" && (
                <span className="mt-1 text-[10px] bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-semibold">❌ ID Rejected</span>
              )}
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><MapPin size={10}/>{user?.area?.replace(/-/g," ")||"No area"}</p>
              <select className="mt-3 w-full px-2 py-1.5 rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-300 transition"
                value={user?.area||""}
                onChange={(e) => {
                  const newArea = e.target.value;
                  const updatedUser = {...user, area: newArea};
                  localStorage.setItem("user", JSON.stringify(updatedUser));
                  setUser(updatedUser);
                  if (socketRef.current) socketRef.current.emit("joinRoom", { area: newArea });
                }}>
                {areas.map((a) => <option key={a._id} value={a.name}>{a.name.replace(/-/g," ").replace(/\b\w/g,(c)=>c.toUpperCase())}</option>)}
              </select>
              <button onClick={() => user?.id && navigate(`/profile/${user.id}`)}
                className="mt-3 w-full flex items-center justify-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium transition py-1.5 rounded-lg hover:bg-purple-50">
                View Profile <ChevronRight size={12}/>
              </button>
            </div>
          </div>

          {/* Leaderboard */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center"><Trophy size={13} className="text-amber-500"/></div>
              <span className="font-bold text-gray-800 text-sm">Hood Leaderboard</span>
            </div>
            {leaderboard.length === 0 ? <p className="text-xs text-gray-400 text-center py-3">No activity yet</p> : (
              <div className="space-y-1">
                {leaderboard.map((entry, i) => (
                  <div key={entry.userId} onClick={() => navigate(`/profile/${entry.userId}`)}
                    className="flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-purple-50 cursor-pointer transition">
                    <span className="text-sm w-5 text-center shrink-0">{i===0?"🥇":i===1?"🥈":i===2?"🥉":<span className="text-xs text-gray-400 font-bold">#{i+1}</span>}</span>
                    <span className="flex-1 text-xs font-medium text-gray-700 truncate">{entry.name}{entry.verified&&<span className="ml-1 text-blue-400 text-[10px]">✓</span>}</span>
                    <span className="text-[11px] font-semibold text-purple-500 bg-purple-50 px-1.5 py-0.5 rounded-full shrink-0">{entry.score}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          CAMERA MODAL
      ══════════════════════════════════════════════════════════════════ */}
      {showCamera && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          {/* Camera toolbar */}
          <div className="flex items-center justify-between px-4 py-3 bg-black/80">
            <button onClick={closeCameraModal} className="text-white p-2 rounded-xl hover:bg-white/10 transition"><X size={20}/></button>
            <div className="flex items-center gap-2">
              {/* Mode toggle */}
              <div className="flex bg-white/10 rounded-xl p-0.5">
                {["photo","video"].map((m) => (
                  <button key={m} onClick={() => { setCameraMode(m); if(cameraStream) startCamera(cameraFacing); }}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition ${cameraMode===m?"bg-white text-black":"text-white"}`}>
                    {m==="photo"?<><Image size={14} className="inline mr-1"/>Photo</>:<><Video size={14} className="inline mr-1"/>Video</>}
                  </button>
                ))}
              </div>
            </div>
            {/* Flip camera */}
            <button onClick={flipCamera} className="text-white p-2 rounded-xl hover:bg-white/10 transition" title="Flip camera">
              🔄
            </button>
          </div>

          {/* Video preview or captured photo */}
          <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
            {capturedPhoto ? (
              cameraMode === "video"
                ? <video src={capturedPhoto} controls className="max-h-full max-w-full" />
                : <img src={capturedPhoto} className="max-h-full max-w-full object-contain" alt="captured" />
            ) : (
              <video ref={videoRef} className="max-h-full max-w-full object-contain" playsInline muted />
            )}

            {/* GPS overlay */}
            {cameraGPS && !capturedPhoto && (
              <div className="absolute bottom-4 left-4 right-4 bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-2 rounded-xl flex items-center gap-2">
                <Navigation size={12} className="text-green-400 shrink-0" />
                <span className="truncate">{captureAddress || `${cameraGPS.lat.toFixed(5)}, ${cameraGPS.lng.toFixed(5)}`}</span>
              </div>
            )}

            {/* Recording indicator */}
            {isRecording && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-red-600 text-white text-xs px-3 py-1.5 rounded-full">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" /> Recording...
              </div>
            )}
          </div>

          {/* Bottom controls */}
          <div className="bg-black/80 px-6 py-5 flex items-center justify-center gap-8">
            {capturedPhoto ? (
              <>
                <button onClick={() => { setCapturedPhoto(null); setCapturedBlob(null); startCamera(cameraFacing); }}
                  className="px-5 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition">
                  Retake
                </button>
                <button onClick={useCapturedMedia}
                  className="px-6 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 transition shadow-lg">
                  Use {cameraMode === "video" ? "Video" : "Photo"} →
                </button>
              </>
            ) : (
              cameraMode === "photo" ? (
                /* Shutter button */
                <button onClick={capturePhoto}
                  className="w-16 h-16 rounded-full bg-white border-4 border-purple-500 hover:scale-95 transition shadow-lg flex items-center justify-center">
                  <Camera size={24} className="text-purple-600" />
                </button>
              ) : (
                /* Record button */
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`w-16 h-16 rounded-full border-4 transition shadow-lg flex items-center justify-center ${isRecording?"bg-red-500 border-red-300 animate-pulse":"bg-white border-red-500"}`}>
                  <div className={`${isRecording?"w-5 h-5 bg-white rounded-sm":"w-4 h-4 bg-red-500 rounded-full"}`} />
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* ── CREATE POST MODAL ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-600 to-purple-600">
              <h2 className="font-bold text-white text-base">Create Post</h2>
              <button onClick={() => setShowModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 text-white transition"><X size={14}/></button>
            </div>
            <div className="px-6 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <input className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white transition"
                placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <textarea rows={3} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white transition resize-none"
                placeholder="What's happening in your hood?" value={content} onChange={(e) => setContent(e.target.value)} />
              <input className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white transition"
                placeholder="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
              <button onClick={getLocation} className="w-full py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition">
                📍 Use My Current Location
              </button>

              {/* Geotagged indicator */}
              {geotagged && captureAddress && (
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs text-green-700">
                  <Navigation size={12} /> <span className="truncate">Geotagged: {captureAddress}</span>
                  <button onClick={() => { setGeotagged(false); setCaptureAddress(null); }} className="ml-auto text-green-500 hover:text-green-800"><X size={12}/></button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <select className="px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-400 transition"
                  value={type==="all"?"casual":type} onChange={(e) => setType(e.target.value)}>
                  <option value="casual">💬 Casual</option>
                  <option value="emergency">🚨 Emergency</option>
                  <option value="event">📅 Event</option>
                  <option value="promotional">📢 Promotional</option>
                </select>
                <select className="px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-400 transition"
                  value={severity} onChange={(e) => setSeverity(e.target.value)}>
                  <option value="low">🟢 Low</option>
                  <option value="medium">🟡 Medium</option>
                  <option value="high">🔴 High</option>
                </select>
              </div>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" className="rounded accent-purple-600" checked={alertUsers} onChange={(e) => setAlertUsers(e.target.checked)} /> 🔔 Alert users
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" className="rounded accent-purple-600" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> 👤 Anonymous
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {/* Camera button inside modal */}
                <button onClick={() => { setShowModal(false); openCameraModal(); }}
                  className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl border border-dashed border-purple-300 text-xs text-purple-600 bg-purple-50 hover:bg-purple-100 transition font-medium">
                  <Camera size={18}/> Camera
                </button>
                <label className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl border border-dashed border-gray-300 text-xs text-gray-500 cursor-pointer hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition">
                  <Image size={18}/> Image
                  <input type="file" accept="image/*" hidden onChange={(e) => { const f=e.target.files[0]; setImage(f); setImagePreview(URL.createObjectURL(f)); setGeotagged(false); }} />
                </label>
                <label className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl border border-dashed border-gray-300 text-xs text-gray-500 cursor-pointer hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition">
                  <Video size={18}/> Video
                  <input type="file" accept="video/*" hidden onChange={(e) => { setVideo(e.target.files[0]); setGeotagged(false); }} />
                </label>
              </div>
              {imagePreview && <img src={imagePreview} className="w-full rounded-xl object-cover max-h-48" alt="preview" />}
            </div>
            <div className="px-6 py-4 border-t border-gray-100">
              <button onClick={() => { handlePost(); setShowModal(false); }}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-sm shadow hover:shadow-md hover:from-blue-700 hover:to-purple-700 transition">
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
            {/* Maps link on emergency popup too */}
            {(emergencyPost.targetLat || emergencyPost.originLat) && (
              <a href={mapsUrl(emergencyPost.targetLat||emergencyPost.originLat, emergencyPost.targetLng||emergencyPost.originLng)} target="_blank" rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-1.5 rounded-xl transition">
                <MapPin size={11}/> View on Google Maps
              </a>
            )}
            <button onClick={() => setEmergencyPost(null)} className="mt-4 block w-full bg-white text-red-600 px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-red-50 transition">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── AREA MODAL ── */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-7 w-full max-w-xs text-center shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto mb-4"><MapPin size={24} className="text-purple-600"/></div>
            <h2 className="text-lg font-black text-gray-800 mb-1">Where do you live?</h2>
            <p className="text-xs text-gray-400 mb-4">We'll show posts from your neighbourhood</p>
            <input className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 transition mb-3"
              placeholder="e.g. Andheri, Borivali, Majiwada" value={tempArea} onChange={(e) => setTempArea(e.target.value)} />
            <button className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-sm hover:from-blue-700 hover:to-purple-700 transition"
              onClick={() => {
                if (!tempArea) return;
                const formatted = tempArea.toLowerCase().replace(/\s/g,"-");
                axios.post(`${BASE_URL}/areas`,{name:formatted},{headers:authHeaders()});
                const updatedUser = {...user,area:formatted};
                localStorage.setItem("user",JSON.stringify(updatedUser));
                setUser(updatedUser);
                if (socketRef.current) socketRef.current.emit("joinRoom",{area:formatted});
                setShowLocationModal(false);
              }}>
              Let's Go →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
