import { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  Globe, AlertTriangle, Calendar, User, Megaphone,
  Menu, Bookmark, BookmarkCheck, Trophy,
  MapPin, Bell, LogOut, Plus, ChevronRight, X,
  Camera, Image, Video, Navigation, ZoomIn,
  Home, Search, Flag, MessageCircle, Heart, Reply,
  BarChart2, Radar,
} from "lucide-react";
import { io } from "socket.io-client";
import logo from "../assets/logo.png";

// ── Emergency sound ───────────────────────────────────────────────────────────
function playEmergencySound() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.connect(ctx.destination);
    [0, 0.6, 1.2, 1.8].forEach((t, i) => {
      const osc = ctx.createOscillator();
      osc.type  = "sine";
      osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 660, ctx.currentTime + t);
      osc.connect(gain);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.5);
    });
    setTimeout(() => ctx.close(), 3000);
  } catch (e) { console.log("Audio error:", e); }
}

const BASE_URL = "https://hoodconnect-backend.onrender.com";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Push notification helpers (NEW) ──────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = window.atob(base64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0)));
}
function arrayBufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

const BADGE_META = {
  verified_citizen:   { emoji: "🛡️", label: "Verified Citizen",    color: "bg-blue-100 text-blue-700 border-blue-200" },
  first_responder:    { emoji: "🚨", label: "First Responder",     color: "bg-red-100 text-red-700 border-red-200" },
  active_contributor: { emoji: "💬", label: "Active Contributor",  color: "bg-purple-100 text-purple-700 border-purple-200" },
  top_of_area:        { emoji: "🏆", label: "Top of Area",         color: "bg-amber-100 text-amber-700 border-amber-200" },
  truth_seeker:       { emoji: "🔍", label: "Truth Seeker",        color: "bg-teal-100 text-teal-700 border-teal-200" },
  old_timer:          { emoji: "📅", label: "Old Timer",           color: "bg-gray-100 text-gray-700 border-gray-200" },
  newcomer:           { emoji: "✨", label: "Newcomer",            color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};

const TAG = {
  emergency:   "bg-red-100 text-red-600 border border-red-200",
  event:       "bg-amber-100 text-amber-700 border border-amber-200",
  casual:      "bg-blue-100 text-blue-600 border border-blue-200",
  promotional: "bg-emerald-100 text-emerald-700 border border-emerald-200",
};
const TYPE_ICON = { emergency:"🚨", event:"📅", casual:"💬", promotional:"📢" };

function mapsUrl(lat, lng, label) {
  if (lat && lng) return `https://www.google.com/maps?q=${lat},${lng}`;
  if (label)      return `https://www.google.com/maps/search/${encodeURIComponent(label)}`;
  return null;
}

function renderWithMentions(text) {
  return (text || "").split(/(@\w+)/g).map((part, i) =>
    part.startsWith("@")
      ? <span key={i} className="text-purple-600 font-semibold">{part}</span>
      : part
  );
}

export default function Dashboard() {
  const [posts, setPosts]         = useState([]);
  const [title, setTitle]         = useState("");
  const [content, setContent]     = useState("");
  const [location, setLocation]   = useState("");
  const [type, setType]           = useState("all");
  const [search, setSearch]       = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const [image, setImage]               = useState(null);
  const [video, setVideo]               = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const [latitude, setLatitude]   = useState("");
  const [longitude, setLongitude] = useState("");

  const [showLocationModal, setShowLocationModal] = useState(false);
  const [tempArea, setTempArea] = useState("");
  const [areas, setAreas]       = useState([]);

  const [notifications, setNotifications]         = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [dmUnread, setDmUnread]                   = useState(0);

  const [nearMe, setNearMe]         = useState(false);
  const [showModal, setShowModal]   = useState(false);
  const [anonymous, setAnonymous]   = useState(false);
  const [alertUsers, setAlertUsers] = useState(false);
  const [severity, setSeverity]     = useState("low");

  const [emergencyPost, setEmergencyPost]     = useState(null);
  const [emergencyBanner, setEmergencyBanner] = useState(null);

  const [commentText, setCommentText]   = useState({});
  const [openComments, setOpenComments] = useState({});
  const [replyTarget, setReplyTarget]   = useState(null);
  const [replyText, setReplyText]       = useState({});

  const [lightbox, setLightbox] = useState(null);

  const [bookmarks, setBookmarks]         = useState(new Set());
  const [leaderboard, setLeaderboard]     = useState([]);
  const [showBookmarks, setShowBookmarks] = useState(false);

  // ── Poll state ────────────────────────────────────────────────────────────
  const [isPoll, setIsPoll]           = useState(false);
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollEndsAt, setPollEndsAt]   = useState("");

  // ── Area Discovery state ──────────────────────────────────────────────────
  const [showAreaDiscovery, setShowAreaDiscovery] = useState(false);
  const [nearbyAreas, setNearbyAreas]             = useState([]);
  const [areaDetecting, setAreaDetecting]         = useState(false);

  // Camera state
  const [showCamera, setShowCamera]         = useState(false);
  const [cameraStream, setCameraStream]     = useState(null);
  const [capturedPhoto, setCapturedPhoto]   = useState(null);
  const [capturedBlob, setCapturedBlob]     = useState(null);
  const [cameraFacing, setCameraFacing]     = useState("environment");
  const [cameraGPS, setCameraGPS]           = useState(null);
  const [cameraMode, setCameraMode]         = useState("photo");
  const [isRecording, setIsRecording]       = useState(false);
  const [geotagged, setGeotagged]           = useState(false);
  const [captureAddress, setCaptureAddress] = useState(null);
  const [captureLat, setCaptureLat]         = useState(null);
  const [captureLng, setCaptureLng]         = useState(null);

  const videoRef      = useRef(null);
  const mediaRecRef   = useRef(null);
  const seenAlertsRef = useRef(new Set());
  const socketRef     = useRef(null);

  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user")); } catch { return null; }
  });

  const navigate = useNavigate();

  const filters = [
    { key: "all",         label: "All",       icon: Globe },
    { key: "emergency",   label: "Emergency", icon: AlertTriangle },
    { key: "event",       label: "Event",     icon: Calendar },
    { key: "casual",      label: "Casual",    icon: User },
    { key: "promotional", label: "Promo",     icon: Megaphone },
  ];

  // ── NEW: Push notification subscription (runs once after login) ───────────
  useEffect(() => {
    if (!user?.id || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const setupPush = async () => {
      try {
        // Register the service worker
        const reg  = await navigator.serviceWorker.register("/sw.js");
        // Ask for permission (browser will only prompt once)
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return;
        // Fetch the VAPID public key from our server
        const keyRes  = await axios.get(`${BASE_URL}/push/vapid-key`);
        const vapidKey = keyRes.data.publicKey;
        if (!vapidKey) return; // push not configured server-side — skip
        // Create/fetch subscription
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
        // Save to server so server can push to this user's area
        await axios.post(`${BASE_URL}/push/subscribe`, {
          endpoint: sub.endpoint,
          keys: {
            p256dh: arrayBufferToBase64(sub.getKey("p256dh")),
            auth:   arrayBufferToBase64(sub.getKey("auth")),
          },
        }, { headers: authHeaders() });
      } catch (err) { console.log("Push setup (non-fatal):", err.message); }
    };
    setupPush();
  }, [user?.id]); // only re-run if the logged-in user changes

  // ── Data fetchers ─────────────────────────────────────────────────────────
  const fetchPosts = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/posts?area=${user?.area || "unknown"}`);
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
      setBookmarks(new Set(res.data.map(p => p._id)));
    } catch (err) { console.log("fetchBookmarks:", err); }
  };

  const fetchNotifications = async () => {
    if (!user?.id) return;
    try {
      const res = await axios.get(`${BASE_URL}/notifications/${user.id}`, { headers: authHeaders() });
      setNotifications(res.data);
    } catch (err) { console.log("fetchNotifications:", err); }
  };

  // ── Area Discovery: detect nearby areas via GPS ───────────────────────────
  const detectNearbyAreas = () => {
    setAreaDetecting(true);
    setShowAreaDiscovery(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setLatitude(lat); setLongitude(lng);
        try {
          const res = await axios.get(`${BASE_URL}/areas/nearby?lat=${lat}&lng=${lng}&radius=25`);
          setNearbyAreas(res.data);
        } catch (err) {
          console.log("detectNearbyAreas:", err);
          setNearbyAreas([]);
        }
        setAreaDetecting(false);
      },
      (err) => {
        console.log("GPS error:", err);
        setAreaDetecting(false);
        alert("Location access denied. Please enable GPS to detect nearby areas.");
        setShowAreaDiscovery(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const switchToArea = (areaName) => {
    const updatedUser = { ...user, area: areaName };
    localStorage.setItem("user", JSON.stringify(updatedUser));
    setUser(updatedUser);
    if (socketRef.current) socketRef.current.emit("joinRoom", { area: areaName });
    setShowAreaDiscovery(false);
    setNearbyAreas([]);
  };

  // ── Socket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    socketRef.current = io(BASE_URL, { transports: ["websocket"] });
    const area = user?.area?.toLowerCase().replace(/\s/g, "-") || "unknown";
    socketRef.current.emit("joinRoom", { area });
    if (user?.id) socketRef.current.emit("joinUserRoom", { userId: user.id });

    socketRef.current.on("newNotification", (notif) => {
      setNotifications(prev => prev.some(n => n._id === notif._id) ? prev : [notif, ...prev]);
    });
    socketRef.current.on("newPost", (post) => setPosts(prev => [post, ...prev]));
    socketRef.current.on("emergencyBroadcast", (data) => {
      setEmergencyBanner(data);
      playEmergencySound();
      setTimeout(() => setEmergencyBanner(null), 15000);
    });
    socketRef.current.on("newDM", () => setDmUnread(prev => prev + 1));

    return () => socketRef.current.disconnect();
  }, []);

  useEffect(() => {
    if (!user?.area || !socketRef.current) return;
    socketRef.current.emit("joinRoom", { area: user.area.toLowerCase().replace(/\s/g, "-") });
  }, [user?.area]);

  useEffect(() => { fetchPosts(); fetchLeaderboard(user?.area); }, [user?.area]);
  useEffect(() => { if (user?.id) { fetchBookmarks(); fetchNotifications(); } }, [user?.id]);
  useEffect(() => { axios.get(`${BASE_URL}/areas`).then(res => setAreas(res.data)); }, []);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    if (!storedUser?.area || storedUser.area === "unknown") setShowLocationModal(true);
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") setLightbox(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    posts.forEach(post => {
      const isRecent = new Date() - new Date(post.createdAt) < 24*60*60*1000;
      if (post.type === "emergency" && post.alert && isRecent && !seenAlertsRef.current.has(post._id)) {
        setEmergencyPost(post);
        playEmergencySound();
        seenAlertsRef.current.add(post._id);
      }
    });
  }, [posts]);

  // ── Geolocation ───────────────────────────────────────────────────────────
  const getLocation = () => {
    navigator.geolocation.getCurrentPosition(
      pos => { setLatitude(pos.coords.latitude); setLongitude(pos.coords.longitude); },
      err => console.log("Geo error:", err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const toRad = v => (v * Math.PI) / 180;
    const R = 6371, dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  const getTimeLeft = createdAt => {
    const diff = 24*60*60*1000 - (new Date() - new Date(createdAt));
    if (diff <= 0) return "Expired";
    return `${Math.floor(diff/(1000*60*60))}h ${Math.floor((diff/(1000*60))%60)}m`;
  };

  // ── Filtered posts ────────────────────────────────────────────────────────
  const filteredPosts = (posts || []).filter(post => {
    if (!post) return false;
    if (showBookmarks && !bookmarks.has(post._id)) return false;
    const matchesType   = type === "all" || post.type === type;
    const matchesSearch = search === "" || ((post.title||"")+(post.content||"")+(post.targetAddress||"")).toLowerCase().includes(search.toLowerCase());
    let matchesNearMe   = true;
    if (nearMe) {
      const pLat = Number(post.targetLat || post.originLat);
      const pLng = Number(post.targetLng || post.originLng);
      if (!latitude || !longitude || !pLat || !pLng) return false;
      matchesNearMe = getDistance(Number(latitude), Number(longitude), pLat, pLng) <= 5;
    }
    return matchesType && matchesSearch && matchesNearMe;
  });

  // ── Camera ────────────────────────────────────────────────────────────────
  const startCamera = useCallback(async (facing = cameraFacing) => {
    if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: cameraMode === "video",
      });
      setCameraStream(stream);
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      navigator.geolocation.getCurrentPosition(async pos => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        setCameraGPS({ lat, lng }); setCaptureLat(lat); setCaptureLng(lng);
        try {
          const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const data = await res.json();
          setCaptureAddress(data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        } catch { setCaptureAddress(`${lat.toFixed(4)}, ${lng.toFixed(4)}`); }
      }, () => {}, { enableHighAccuracy: true });
    } catch (err) { alert("Camera access denied: " + err.message); }
  }, [cameraFacing, cameraMode, cameraStream]);

  const stopCamera = useCallback(() => {
    if (cameraStream) { cameraStream.getTracks().forEach(t => t.stop()); setCameraStream(null); }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [cameraStream]);

  const openCameraModal = () => { setCapturedPhoto(null); setCapturedBlob(null); setShowCamera(true); setTimeout(() => startCamera(cameraFacing), 100); };
  const closeCameraModal = () => { stopCamera(); setShowCamera(false); setCapturedPhoto(null); setCapturedBlob(null); };
  const flipCamera = () => { const next = cameraFacing === "environment" ? "user" : "environment"; setCameraFacing(next); startCamera(next); };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth; canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0);
    if (cameraGPS) {
      const stamp = `📍 ${captureAddress || `${cameraGPS.lat.toFixed(5)}, ${cameraGPS.lng.toFixed(5)}`}  •  ${new Date().toLocaleString()}`;
      ctx.font = "bold 18px monospace"; ctx.fillStyle = "rgba(0,0,0,0.55)";
      const tw = ctx.measureText(stamp).width;
      ctx.fillRect(10, canvas.height-42, tw+20, 32); ctx.fillStyle = "#ffffff"; ctx.fillText(stamp, 20, canvas.height-18);
    }
    canvas.toBlob(blob => { const url = URL.createObjectURL(blob); setCapturedPhoto(url); setCapturedBlob(blob); setGeotagged(true); stopCamera(); }, "image/jpeg", 0.92);
  };

  const startRecording = () => {
    if (!cameraStream) return;
    const chunks = [], mr = new MediaRecorder(cameraStream, { mimeType: "video/webm" });
    mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    mr.onstop = () => { const blob = new Blob(chunks, { type: "video/webm" }); setCapturedPhoto(URL.createObjectURL(blob)); setCapturedBlob(blob); setGeotagged(true); stopCamera(); };
    mr.start(); mediaRecRef.current = mr; setIsRecording(true);
  };
  const stopRecording = () => { mediaRecRef.current?.stop(); setIsRecording(false); };
  const useCapturedMedia = () => {
    if (!capturedBlob) return;
    const ext  = cameraMode === "video" ? "webm" : "jpg";
    const file = new File([capturedBlob], `capture.${ext}`, { type: capturedBlob.type });
    if (cameraMode === "video") { setVideo(file); } else { setImage(file); setImagePreview(capturedPhoto); }
    setShowCamera(false); setShowModal(true);
  };

  // ── Post handlers ─────────────────────────────────────────────────────────
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
      formData.append("geotagged", String(geotagged));
      if (captureLat)     formData.append("captureLat",     captureLat);
      if (captureLng)     formData.append("captureLng",     captureLng);
      if (captureAddress) formData.append("captureAddress", captureAddress);
      formData.append("isPoll", String(isPoll));
      if (isPoll) {
        const validOpts = pollOptions.filter(o => o.trim());
        formData.append("pollOptions", JSON.stringify(validOpts));
        if (pollEndsAt) formData.append("pollEndsAt", pollEndsAt);
      }
      if (image) formData.append("image", image);
      if (video) formData.append("video", video);

      await axios.post(`${BASE_URL}/posts`, formData, { headers: { ...authHeaders() } });

      setTitle(""); setContent(""); setLocation(""); setImage(null); setVideo(null);
      setImagePreview(null); setAnonymous(false); setAlertUsers(false);
      setGeotagged(false); setCaptureLat(null); setCaptureLng(null); setCaptureAddress(null);
      setIsPoll(false); setPollOptions(["", ""]); setPollEndsAt("");
      fetchPosts();
    } catch (err) { console.log("handlePost:", err); }
  };

  const handleDelete   = async id => { try { await axios.delete(`${BASE_URL}/posts/${id}`, { headers: authHeaders() }); fetchPosts(); } catch {} };
  const handleEdit     = async id => { const t = prompt("Edit content:"); if (!t) return; try { await axios.put(`${BASE_URL}/posts/${id}`, { content: t }, { headers: authHeaders() }); fetchPosts(); } catch {} };
  const handleLike     = async id => { try { await axios.put(`${BASE_URL}/posts/${id}/like`, { userId: user?.id }, { headers: authHeaders() }); fetchPosts(); } catch {} };
  const handleTrust    = async (id, t) => { try { await axios.put(`${BASE_URL}/posts/${id}/trust`, { userId: user?.id, type: t }, { headers: authHeaders() }); fetchPosts(); } catch {} };
  const handleBookmark = async id => { try { const res = await axios.put(`${BASE_URL}/posts/${id}/bookmark`, {}, { headers: authHeaders() }); setBookmarks(new Set(res.data.bookmarks.map(i => i.toString()))); } catch {} };
  const handleReport   = async id => { if (!window.confirm("Report this post?")) return; try { await axios.post(`${BASE_URL}/posts/${id}/report`, { userId: user?.id }, { headers: authHeaders() }); alert("Reported."); } catch {} };
  const handleLogout   = () => { localStorage.removeItem("user"); localStorage.removeItem("token"); navigate("/"); };

  const handlePollVote = async (postId, optionId) => {
    try { await axios.put(`${BASE_URL}/posts/${postId}/poll/${optionId}`, { userId: user?.id }, { headers: authHeaders() }); fetchPosts(); } catch (err) { console.log("handlePollVote:", err); }
  };

  const totalPollVotes = (post) =>
    (post.pollOptions || []).reduce((sum, opt) => sum + (opt.votes?.length || 0), 0);

  const userVotedOption = (post) =>
    (post.pollOptions || []).find(opt => opt.votes?.some(id => id === user?.id || id?.toString() === user?.id))?._id;

  const handleComment = async postId => {
    const text = commentText[postId];
    if (!text?.trim()) return;
    try { await axios.post(`${BASE_URL}/posts/${postId}/comment`, { text, userName: user?.name || "Anonymous", userId: user?.id }, { headers: authHeaders() }); setCommentText({ ...commentText, [postId]: "" }); fetchPosts(); } catch {}
  };

  const handleCommentLike = async (postId, commentId) => {
    try { await axios.put(`${BASE_URL}/posts/${postId}/comments/${commentId}/like`, { userId: user?.id }, { headers: authHeaders() }); fetchPosts(); } catch {}
  };

  const handleReply = async (postId, commentId) => {
    const text = replyText[commentId];
    if (!text?.trim()) return;
    try { await axios.post(`${BASE_URL}/posts/${postId}/comments/${commentId}/reply`, { text, userName: user?.name || "Anonymous", userId: user?.id }, { headers: authHeaders() }); setReplyText({ ...replyText, [commentId]: "" }); setReplyTarget(null); fetchPosts(); } catch {}
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const updatePollOption = (i, val) => { const c = [...pollOptions]; c[i] = val; setPollOptions(c); };
  const addPollOption    = () => { if (pollOptions.length < 6) setPollOptions([...pollOptions, ""]); };
  const removePollOption = (i) => { if (pollOptions.length > 2) setPollOptions(pollOptions.filter((_, idx) => idx !== i)); };

  return (
    <div className="min-h-screen bg-[#f0f2f8] flex flex-col">

      {/* EMERGENCY BROADCAST BANNER */}
      {emergencyBanner && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-gradient-to-r from-red-600 to-rose-700 text-white px-4 py-3 flex items-center gap-3 shadow-2xl animate-pulse">
          <div className="text-2xl shrink-0">🚨</div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm tracking-wide">EMERGENCY ALERT — {emergencyBanner.title}</p>
            <p className="text-xs opacity-90 truncate">{emergencyBanner.content} · 📍 {emergencyBanner.address}</p>
          </div>
          {emergencyBanner.lat && (
            <a href={`https://www.google.com/maps?q=${emergencyBanner.lat},${emergencyBanner.lng}`} target="_blank" rel="noopener noreferrer"
              className="shrink-0 bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-1.5 rounded-xl transition font-semibold">Maps</a>
          )}
          <button onClick={() => setEmergencyBanner(null)} className="shrink-0 p-1.5 rounded-lg hover:bg-white/20 transition"><X size={16}/></button>
        </div>
      )}

      {/* HEADER */}
      <header className={`sticky z-30 bg-white border-b border-gray-200 shadow-sm ${emergencyBanner ? "top-[60px]" : "top-0"}`}>
        <div className="flex items-center gap-2 md:gap-4 px-3 md:px-5 py-3">
          <div className="flex items-center gap-2 shrink-0">
            <img src={logo} alt="logo" className="w-8 h-8 object-contain"/>
            <span className="text-lg md:text-xl font-black tracking-tight bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">HOODCONNECT</span>
          </div>
          <div className="hidden md:block flex-1 max-w-lg mx-auto">
            <input className="w-full px-4 py-2 rounded-xl bg-gray-100 border border-gray-200 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white transition"
              placeholder="Search posts, locations..." value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2 shrink-0 ml-auto md:ml-0">
            <button onClick={() => setShowSearch(!showSearch)} className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition"><Search size={17}/></button>

            {/* Area Discovery button */}
            <button onClick={detectNearbyAreas} title="Discover nearby areas"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 transition">
              <Radar size={17}/>
            </button>

            {/* DM button */}
            <button onClick={() => { setDmUnread(0); navigate("/chat"); }}
              className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 transition">
              <MessageCircle size={18}/>
              {dmUnread > 0 && <span className="absolute -top-1 -right-1 bg-purple-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{dmUnread}</span>}
            </button>

            {/* Bell */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotifications(!showNotifications);
                  if (!showNotifications && user?.id) {
                    axios.put(`${BASE_URL}/notifications/${user.id}/read`, {}, { headers: authHeaders() });
                    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                  }
                }}
                className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-600 transition">
                <Bell size={18}/>
                {unreadCount > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{unreadCount}</span>}
              </button>
              {showNotifications && (
                <div className="absolute right-0 top-11 w-72 md:w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <span className="font-semibold text-gray-800 text-sm">Notifications</span>
                    <button onClick={() => setShowNotifications(false)}><X size={14} className="text-gray-400"/></button>
                  </div>
                  {notifications.length === 0
                    ? <p className="p-5 text-sm text-gray-400 text-center">You're all caught up 🎉</p>
                    : notifications.slice(0,10).map((n,i) => (
                      <div key={n._id||i} className={`px-4 py-3 border-b border-gray-50 text-sm ${!n.read?"bg-blue-50/60":""}`}>
                        <p className="text-gray-700"><span className="font-semibold text-gray-900">{n.senderName}</span>{" "}
                          {n.type==="like"&&"liked your post"}{n.type==="comment"&&"commented on your post"}{n.type==="trust"&&"voted on your post"}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">📝 {n.postTitle}</p>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
            <button onClick={handleLogout} className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 text-sm font-medium transition"><LogOut size={15}/> Logout</button>
            <button onClick={handleLogout} className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl bg-red-50 hover:bg-red-100 text-red-500 transition"><LogOut size={17}/></button>
          </div>
        </div>
        {showSearch && (
          <div className="md:hidden px-3 pb-2">
            <input autoFocus className="w-full px-4 py-2 rounded-xl bg-gray-100 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 transition"
              placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
        )}
      </header>

      {/* BODY */}
      <div className="flex flex-1 pb-16 md:pb-0">

        {/* LEFT SIDEBAR */}
        <aside className={`hidden md:flex bg-white border-r border-gray-200 flex-col gap-1 py-4 px-2 shrink-0 transition-all duration-200 ${collapsed?"w-14":"w-48"}`}>
          <button onClick={() => setCollapsed(!collapsed)} className="w-full flex items-center justify-center p-2 rounded-xl hover:bg-gray-100 text-gray-400 mb-1 transition"><Menu size={17}/></button>
          {[
            { action: () => { setNearMe(!nearMe); getLocation(); }, active: nearMe, icon: <MapPin size={16} className={nearMe?"text-white":"text-purple-500"}/>, label: "Near Me" },
            { action: () => setShowBookmarks(!showBookmarks), active: showBookmarks, icon: showBookmarks?<BookmarkCheck size={16} className="text-white"/>:<Bookmark size={16} className="text-purple-500"/>, label: "Saved" },
            { action: detectNearbyAreas, active: false, icon: <Radar size={16} className="text-emerald-500"/>, label: "Discover" },
          ].map((item, i) => (
            <button key={i} onClick={item.action}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition ${item.active?"bg-purple-600 text-white":"hover:bg-gray-100 text-gray-600"}`}>
              {item.icon}{!collapsed&&<span>{item.label}</span>}
            </button>
          ))}
          <div className="my-1 mx-2 border-t border-gray-100"/>
          {filters.map(f => {
            const Icon = f.icon, active = type === f.key;
            return (
              <button key={f.key} onClick={() => setType(f.key)}
                className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition ${active?"bg-purple-600 text-white":"hover:bg-gray-100 text-gray-600"}`}>
                <Icon size={16} className={active?"text-white":"text-purple-500"}/>{!collapsed&&<span>{f.label}</span>}
              </button>
            );
          })}
        </aside>

        {/* CENTER FEED */}
        <main className="flex-1 py-4 md:py-5 px-3 md:px-4 overflow-y-auto w-full" style={{ maxWidth: 640, margin: "0 auto" }}>
          <div className="flex gap-2 mb-4 md:mb-5">
            <button onClick={() => setShowModal(true)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold text-sm shadow-md hover:shadow-lg hover:from-blue-700 hover:to-purple-700 transition">
              <Plus size={17}/> Create Post
            </button>
            <button onClick={openCameraModal} className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-2xl bg-white border border-gray-200 shadow-sm hover:shadow-md text-purple-600 font-semibold text-sm transition">
              <Camera size={17}/><span className="hidden sm:inline">Camera</span>
            </button>
          </div>

          {/* Mobile filter chips */}
          <div className="md:hidden flex gap-2 overflow-x-auto pb-2 mb-3">
            {filters.map(f => { const Icon=f.icon, active=type===f.key; return (
              <button key={f.key} onClick={() => setType(f.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition shrink-0 ${active?"bg-purple-600 text-white":"bg-white border border-gray-200 text-gray-600"}`}>
                <Icon size={13}/>{f.label}
              </button>
            ); })}
          </div>

          <div className="flex items-center gap-2 mb-4">
            <MapPin size={13} className="text-purple-400"/>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              {showBookmarks?"Saved Posts":user?.area?.replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase())||"Your Hood"}
            </span>
          </div>

          {filteredPosts.length === 0 && (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-12 text-center text-gray-400 text-sm">
              {showBookmarks?"No saved posts yet.":"No posts in this area yet — be the first! 🌟"}
            </div>
          )}

          {/* POST CARDS */}
          {filteredPosts.map(post => (
            <article key={post._id} className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-4 md:mb-5 overflow-hidden hover:shadow-md transition">

              {post.type === "emergency" && post.alert && (
                <div className="bg-gradient-to-r from-red-500 to-rose-600 text-white px-4 py-2 text-xs font-bold tracking-wide flex items-center gap-2">
                  <span className="animate-pulse">🚨</span> EMERGENCY ALERT
                </div>
              )}

              {/* Header */}
              <div className="flex items-start justify-between px-4 pt-4 pb-2">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white font-bold text-sm cursor-pointer shrink-0"
                    onClick={() => post.userId && navigate(`/profile/${post.userId}`)}>
                    {(post.userName||"A")[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap cursor-pointer" onClick={() => post.userId && navigate(`/profile/${post.userId}`)}>
                      <span className="font-semibold text-sm text-gray-800 hover:text-purple-600 transition">{post.userName||"Anonymous"}</span>
                      {post.verified && <span className="text-[10px] bg-blue-100 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-bold">✓ Verified</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${TAG[post.type]||"bg-gray-100 text-gray-500"}`}>{TYPE_ICON[post.type]} {post.type}</span>
                      {post.geotagged && <span className="text-[10px] bg-green-100 text-green-600 border border-green-200 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5"><Navigation size={9}/> Geotagged</span>}
                      {post.isPoll && <span className="text-[10px] bg-indigo-100 text-indigo-600 border border-indigo-200 px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5"><BarChart2 size={9}/> Poll</span>}
                      <span className="text-[11px] text-gray-400">{new Date(post.createdAt).toLocaleDateString()} · {new Date(post.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {post.userId && post.userId !== user?.id && (
                    <button onClick={() => navigate(`/chat/${post.userId}`)} title="Send DM" className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-300 hover:text-blue-500 transition"><MessageCircle size={14}/></button>
                  )}
                  <button onClick={() => handleReport(post._id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition" title="Report"><Flag size={14}/></button>
                  <button onClick={() => handleBookmark(post._id)} className="p-1.5 rounded-lg hover:bg-purple-50 text-gray-400 hover:text-purple-600 transition">
                    {bookmarks.has(post._id)?<BookmarkCheck size={17} className="text-purple-600"/>:<Bookmark size={17}/>}
                  </button>
                </div>
              </div>

              {/* Location */}
              <div className="px-4 pb-2">
                {mapsUrl(post.targetLat||post.originLat, post.targetLng||post.originLng, post.targetAddress) ? (
                  <a href={mapsUrl(post.targetLat||post.originLat, post.targetLng||post.originLng, post.targetAddress)} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:text-blue-700 underline flex items-center gap-1 transition">
                    <MapPin size={10} className="text-purple-400 shrink-0"/>
                    <span className="truncate">{post.targetAddress||post.originAddress||"View on Maps"}</span>
                    {latitude && (post.targetLat||post.originLat) && <span className="ml-auto shrink-0 text-gray-400 no-underline">{getDistance(Number(latitude),Number(longitude),Number(post.targetLat||post.originLat),Number(post.targetLng||post.originLng)).toFixed(1)} km</span>}
                  </a>
                ) : (
                  <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin size={10} className="text-purple-400 shrink-0"/><span className="truncate">{post.targetAddress||post.originAddress||"Unknown"}</span></p>
                )}
                {post.geotagged && post.captureLat && (
                  <a href={`https://www.google.com/maps?q=${post.captureLat},${post.captureLng}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-green-600 hover:text-green-800 flex items-center gap-1 mt-0.5">
                    <Navigation size={9}/> Photo taken here · {post.captureAddress||`${post.captureLat?.toFixed(4)}, ${post.captureLng?.toFixed(4)}`}
                  </a>
                )}
              </div>

              {/* Content */}
              <div className="px-4 pb-3">
                <h3 className="font-bold text-gray-900 text-base leading-snug">{post.title}</h3>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">{post.content}</p>
              </div>

              {/* POLL DISPLAY */}
              {post.isPoll && post.pollOptions?.length > 0 && (
                <div className="px-4 pb-3">
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center gap-1.5 mb-2">
                      <BarChart2 size={14} className="text-indigo-500"/>
                      <span className="text-xs font-bold text-indigo-700">Community Poll · {totalPollVotes(post)} vote{totalPollVotes(post) !== 1 ? "s" : ""}</span>
                      {post.pollEndsAt && new Date() < new Date(post.pollEndsAt) && (
                        <span className="ml-auto text-[10px] text-indigo-400">Ends {new Date(post.pollEndsAt).toLocaleDateString()}</span>
                      )}
                      {post.pollEndsAt && new Date() >= new Date(post.pollEndsAt) && (
                        <span className="ml-auto text-[10px] bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full font-semibold">Ended</span>
                      )}
                    </div>
                    {post.pollOptions.map(opt => {
                      const total     = totalPollVotes(post);
                      const pct       = total > 0 ? Math.round((opt.votes?.length || 0) / total * 100) : 0;
                      const myVoteId  = userVotedOption(post);
                      const isMyVote  = myVoteId?.toString() === opt._id?.toString();
                      const pollEnded = post.pollEndsAt && new Date() >= new Date(post.pollEndsAt);
                      return (
                        <button key={opt._id} onClick={() => !pollEnded && handlePollVote(post._id, opt._id)} disabled={pollEnded}
                          className={`w-full text-left rounded-xl overflow-hidden border transition ${isMyVote?"border-indigo-400 bg-indigo-100":"border-gray-200 bg-white hover:border-indigo-300"} ${pollEnded?"cursor-default":""}`}>
                          <div className="relative px-3 py-2">
                            <div className={`absolute inset-y-0 left-0 rounded-xl transition-all duration-500 ${isMyVote?"bg-indigo-200":"bg-gray-100"}`} style={{ width: `${pct}%` }}/>
                            <div className="relative flex items-center justify-between">
                              <span className={`text-xs font-medium ${isMyVote?"text-indigo-800":"text-gray-700"}`}>{isMyVote && <span className="mr-1">✓</span>}{opt.text}</span>
                              <span className={`text-xs font-bold ${isMyVote?"text-indigo-700":"text-gray-500"}`}>{pct}%</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Media */}
              {post.image && (
                <div className="relative group cursor-pointer" onClick={() => setLightbox({ type:"image", src:post.image })}>
                  <img src={post.image} className="w-full max-h-72 object-cover" onError={e=>e.target.style.display="none"} alt="post"/>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center">
                    <ZoomIn size={28} className="text-white opacity-0 group-hover:opacity-100 transition drop-shadow-lg"/>
                  </div>
                </div>
              )}
              {post.video && (
                <div className="relative group cursor-pointer" onClick={() => setLightbox({ type:"video", src:post.video })}>
                  <video src={post.video} className="w-full max-h-72 object-cover pointer-events-none"/>
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                      <div className="w-0 h-0 border-t-[8px] border-b-[8px] border-l-[14px] border-transparent border-l-purple-600 ml-1"/>
                    </div>
                  </div>
                </div>
              )}

              {/* Trust bar */}
              {(post.trustUpvotes?.length>0||post.trustDownvotes?.length>0) && (
                <div className="px-4 pt-2 pb-1">
                  <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                    <span>Community Trust</span>
                    <span className="text-gray-500 font-medium">{post.trustUpvotes?.length||0}/{(post.trustUpvotes?.length||0)+(post.trustDownvotes?.length||0)} verified</span>
                  </div>
                  <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all"
                      style={{width:`${((post.trustUpvotes?.length||0)/Math.max(1,(post.trustUpvotes?.length||0)+(post.trustDownvotes?.length||0)))*100}%`}}/>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 px-3 py-2 border-t border-gray-50 flex-wrap">
                <button onClick={() => handleTrust(post._id,"up")}   className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-green-50 hover:text-green-600 transition">👍 {post.trustUpvotes?.length||0}</button>
                <button onClick={() => handleTrust(post._id,"down")} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-500 transition">👎 {post.trustDownvotes?.length||0}</button>
                <button onClick={() => handleLike(post._id)}         className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-pink-50 hover:text-pink-500 transition">❤️ {post.likes?.length||0}</button>
                <button onClick={() => setOpenComments(p=>({...p,[post._id]:!p[post._id]}))}
                  className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition ${openComments[post._id]?"bg-blue-100 text-blue-600":"text-gray-500 hover:bg-blue-50 hover:text-blue-500"}`}>
                  💬 {post.comments?.length||0}
                </button>
                <div className="flex-1"/>
                <span className="text-[11px] text-gray-300 px-1 hidden sm:inline">⏳ {getTimeLeft(post.createdAt)}</span>
                {post.userId===user?.id&&<>
                  <button onClick={() => handleEdit(post._id)}   className="px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition">✏️</button>
                  <button onClick={() => handleDelete(post._id)} className="px-2 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-50 hover:text-red-600 transition">🗑️</button>
                </>}
              </div>

              {/* UPGRADED COMMENTS */}
              {openComments[post._id] && (
                <div className="px-4 pb-4 pt-2 bg-gray-50 border-t border-gray-100">
                  {post.comments?.length > 0 && (
                    <div className="mb-3 space-y-3">
                      {post.comments.map(c => (
                        <div key={c._id} className="flex items-start gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-300 to-purple-300 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5 cursor-pointer"
                            onClick={() => c.userId && navigate(`/profile/${c.userId}`)}>
                            {(c.userName||"A")[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="bg-white rounded-2xl px-3 py-2 text-xs text-gray-700 border border-gray-100">
                              <span className="font-semibold text-purple-600 cursor-pointer mr-1" onClick={() => c.userId && navigate(`/profile/${c.userId}`)}>{c.userName}</span>
                              {renderWithMentions(c.text)}
                            </div>
                            <div className="flex items-center gap-3 mt-1 ml-1">
                              <button onClick={() => handleCommentLike(post._id, c._id)}
                                className={`flex items-center gap-1 text-[10px] font-medium transition ${c.likes?.some(id=>id===user?.id||id?.toString()===user?.id)?"text-pink-500":"text-gray-400 hover:text-pink-500"}`}>
                                <Heart size={10} className={c.likes?.some(id=>id===user?.id||id?.toString()===user?.id)?"fill-current":""}/> {c.likes?.length||0}
                              </button>
                              <button onClick={() => setReplyTarget(replyTarget?.commentId===c._id?null:{postId:post._id,commentId:c._id,userName:c.userName})}
                                className="flex items-center gap-1 text-[10px] font-medium text-gray-400 hover:text-purple-500 transition">
                                <Reply size={10}/> Reply
                              </button>
                              <span className="text-[10px] text-gray-300">{new Date(c.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                            </div>
                            {replyTarget?.commentId === c._id && (
                              <div className="flex gap-2 mt-2 ml-1">
                                <input autoFocus
                                  className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-purple-200 text-xs placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-300 transition"
                                  placeholder={`Reply to @${c.userName}...`}
                                  value={replyText[c._id]||""}
                                  onChange={e => setReplyText({...replyText,[c._id]:e.target.value})}
                                  onKeyDown={e => e.key==="Enter" && handleReply(post._id, c._id)}
                                />
                                <button onClick={() => handleReply(post._id, c._id)} className="px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 transition">Reply</button>
                              </div>
                            )}
                            {c.replies?.length > 0 && (
                              <div className="mt-2 ml-2 space-y-2 border-l-2 border-purple-100 pl-3">
                                {c.replies.map(r => (
                                  <div key={r._id} className="flex items-start gap-2">
                                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-purple-300 to-blue-300 flex items-center justify-center text-white text-[9px] font-bold shrink-0 mt-0.5 cursor-pointer"
                                      onClick={() => r.userId && navigate(`/profile/${r.userId}`)}>
                                      {(r.userName||"A")[0].toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="bg-white rounded-xl px-2.5 py-1.5 text-xs text-gray-700 border border-gray-100">
                                        <span className="font-semibold text-purple-600 mr-1 cursor-pointer text-[11px]" onClick={() => r.userId && navigate(`/profile/${r.userId}`)}>{r.userName}</span>
                                        {renderWithMentions(r.text)}
                                      </div>
                                      <div className="flex items-center gap-2 mt-0.5 ml-1">
                                        <button onClick={async () => { try { await axios.put(`${BASE_URL}/posts/${post._id}/comments/${c._id}/replies/${r._id}/like`,{userId:user?.id},{headers:authHeaders()}); fetchPosts(); } catch {} }}
                                          className={`flex items-center gap-1 text-[10px] transition ${r.likes?.some(id=>id===user?.id||id?.toString()===user?.id)?"text-pink-500":"text-gray-400 hover:text-pink-500"}`}>
                                          <Heart size={9} className={r.likes?.some(id=>id===user?.id||id?.toString()===user?.id)?"fill-current":""}/> {r.likes?.length||0}
                                        </button>
                                        <span className="text-[10px] text-gray-300">{new Date(r.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      className="flex-1 px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-300 transition"
                      placeholder="Write a comment... (use @name to mention)"
                      value={commentText[post._id]||""}
                      onChange={e => setCommentText({...commentText,[post._id]:e.target.value})}
                      onKeyDown={e => e.key==="Enter" && handleComment(post._id)}
                    />
                    <button onClick={() => handleComment(post._id)} className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-medium hover:bg-purple-700 transition">Post</button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </main>

        {/* RIGHT SIDEBAR */}
        <aside className="hidden lg:block w-60 shrink-0 py-5 px-3 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-black cursor-pointer hover:scale-105 transition shadow"
                onClick={() => user?.id && navigate(`/profile/${user.id}`)}>
                {user?.name?.charAt(0).toUpperCase()||"U"}
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <span className="font-bold text-gray-800 text-sm">{user?.name||"Unknown"}</span>
                {user?.verified && <span className="text-[10px] bg-blue-100 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full font-bold">✓</span>}
              </div>
              {user?.aadhaarStatus==="pending"  && <span className="mt-1 text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">🕐 ID Review Pending</span>}
              {user?.aadhaarStatus==="verified" && <span className="mt-1 text-[10px] bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-semibold">🛡️ ID Verified</span>}
              {user?.aadhaarStatus==="rejected" && <span className="mt-1 text-[10px] bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-semibold">❌ ID Rejected</span>}
              {user?.badges?.length > 0 && (
                <div className="flex flex-wrap gap-1 justify-center mt-2">
                  {user.badges.map(b => (
                    <span key={b} title={BADGE_META[b]?.label} className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${BADGE_META[b]?.color}`}>
                      {BADGE_META[b]?.emoji} {BADGE_META[b]?.label}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-2 flex items-center gap-1"><MapPin size={10}/>{user?.area?.replace(/-/g," ")||"No area"}</p>
              <select className="mt-3 w-full px-2 py-1.5 rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-300 transition"
                value={user?.area||""}
                onChange={e => { const a=e.target.value; const u={...user,area:a}; localStorage.setItem("user",JSON.stringify(u)); setUser(u); if(socketRef.current)socketRef.current.emit("joinRoom",{area:a}); }}>
                {areas.map(a => <option key={a._id} value={a.name}>{a.name.replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
              </select>
              {/* Discover button in sidebar */}
              <button onClick={detectNearbyAreas}
                className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-800 font-medium transition py-1.5 rounded-lg hover:bg-emerald-50 border border-emerald-200">
                <Radar size={12}/> Discover Nearby Areas
              </button>
              <button onClick={() => user?.id && navigate(`/profile/${user.id}`)} className="mt-1 w-full flex items-center justify-center gap-1 text-xs text-purple-600 hover:text-purple-800 font-medium transition py-1.5 rounded-lg hover:bg-purple-50">
                View Profile <ChevronRight size={12}/>
              </button>
              <button onClick={() => navigate("/chat")} className="mt-1 w-full flex items-center justify-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition py-1.5 rounded-lg hover:bg-blue-50">
                <MessageCircle size={12}/> Messages {dmUnread>0&&<span className="bg-purple-600 text-white text-[9px] px-1.5 py-0.5 rounded-full">{dmUnread}</span>}
              </button>
            </div>
          </div>

          {/* Leaderboard */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center"><Trophy size={13} className="text-amber-500"/></div>
              <span className="font-bold text-gray-800 text-sm">Hood Leaderboard</span>
            </div>
            {leaderboard.length===0?<p className="text-xs text-gray-400 text-center py-3">No activity yet</p>:(
              <div className="space-y-1">
                {leaderboard.map((entry,i) => (
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

      {/* MOBILE BOTTOM NAV */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 flex items-center justify-around px-2 py-2">
        <button onClick={()=>setType("all")} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[10px] font-medium transition ${type==="all"?"text-purple-600":"text-gray-400"}`}><Home size={20}/> All</button>
        <button onClick={()=>setType("emergency")} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[10px] font-medium transition ${type==="emergency"?"text-red-500":"text-gray-400"}`}><AlertTriangle size={20}/> SOS</button>
        <button onClick={()=>setShowModal(true)} className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center text-white shadow-lg -mt-4"><Plus size={22}/></button>
        <button onClick={()=>{ setDmUnread(0); navigate("/chat"); }} className="relative flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[10px] font-medium text-gray-400">
          <MessageCircle size={20}/> Chat
          {dmUnread>0&&<span className="absolute top-0 right-1 w-4 h-4 bg-purple-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{dmUnread}</span>}
        </button>
        <button onClick={()=>user?.id&&navigate(`/profile/${user.id}`)} className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl text-[10px] font-medium text-gray-400"><User size={20}/> Profile</button>
      </nav>

      {/* LIGHTBOX */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition" onClick={() => setLightbox(null)}><X size={20}/></button>
          <div onClick={e => e.stopPropagation()}>
            {lightbox.type==="image"?<img src={lightbox.src} className="max-w-[90vw] max-h-[90vh] rounded-xl object-contain shadow-2xl" alt="full view"/>
              :<video src={lightbox.src} controls autoPlay className="max-w-[90vw] max-h-[90vh] rounded-xl shadow-2xl"/>}
          </div>
        </div>
      )}

      {/* AREA DISCOVERY MODAL */}
      {showAreaDiscovery && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-600 to-teal-600">
              <div className="flex items-center gap-2"><Radar size={18} className="text-white"/><h2 className="font-bold text-white text-base">Discover Nearby Areas</h2></div>
              <button onClick={() => setShowAreaDiscovery(false)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 text-white transition"><X size={14}/></button>
            </div>
            <div className="p-4">
              {areaDetecting ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin"/>
                  <p className="text-sm text-gray-500">Detecting your location...</p>
                </div>
              ) : nearbyAreas.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  <MapPin size={32} className="mx-auto mb-2 opacity-30"/>
                  <p>No nearby areas found</p>
                  <p className="text-xs mt-1">Try expanding your search or add a new area</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-400 mb-3 font-medium">Areas with activity near you — tap to switch:</p>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {nearbyAreas.map(a => (
                      <button key={a.name} onClick={() => switchToArea(a.name)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition text-left ${user?.area === a.name?"bg-emerald-50 border-emerald-300 text-emerald-800":"bg-gray-50 border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 text-gray-700"}`}>
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0"><MapPin size={14} className="text-emerald-600"/></div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm truncate">{a.label}</p>
                          <p className="text-xs text-gray-400">{a.count} post{a.count !== 1?"s":""} · {a.distance} km away</p>
                        </div>
                        {user?.area === a.name && <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-bold shrink-0">Current</span>}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {/* Manual area input */}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-2 font-medium">Or enter area manually:</p>
                <div className="flex gap-2">
                  <input className="flex-1 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition"
                    placeholder="e.g. Bandra, Juhu..." value={tempArea} onChange={e => setTempArea(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && tempArea.trim()) { switchToArea(tempArea.toLowerCase().replace(/\s/g,"-")); setTempArea(""); } }}/>
                  <button onClick={() => { if (tempArea.trim()) { switchToArea(tempArea.toLowerCase().replace(/\s/g,"-")); setTempArea(""); } }}
                    className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition">Go</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CAMERA MODAL */}
      {showCamera && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 bg-black/80">
            <button onClick={closeCameraModal} className="text-white p-2 rounded-xl hover:bg-white/10 transition"><X size={20}/></button>
            <div className="flex bg-white/10 rounded-xl p-0.5">
              {["photo","video"].map(m => (
                <button key={m} onClick={() => { setCameraMode(m); if(cameraStream) startCamera(cameraFacing); }}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition ${cameraMode===m?"bg-white text-black":"text-white"}`}>
                  {m==="photo"?<><Image size={14} className="inline mr-1"/>Photo</>:<><Video size={14} className="inline mr-1"/>Video</>}
                </button>
              ))}
            </div>
            <button onClick={flipCamera} className="text-white p-2 rounded-xl hover:bg-white/10 transition">🔄</button>
          </div>
          <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
            {capturedPhoto?(cameraMode==="video"?<video src={capturedPhoto} controls className="max-h-full max-w-full"/>:<img src={capturedPhoto} className="max-h-full max-w-full object-contain" alt="captured"/>)
              :<video ref={videoRef} className="max-h-full max-w-full object-contain" playsInline muted/>}
            {cameraGPS&&!capturedPhoto&&(
              <div className="absolute bottom-4 left-4 right-4 bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-2 rounded-xl flex items-center gap-2">
                <Navigation size={12} className="text-green-400 shrink-0"/><span className="truncate">{captureAddress||`${cameraGPS.lat.toFixed(5)}, ${cameraGPS.lng.toFixed(5)}`}</span>
              </div>
            )}
            {isRecording&&<div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-red-600 text-white text-xs px-3 py-1.5 rounded-full"><span className="w-2 h-2 bg-white rounded-full animate-pulse"/> Recording...</div>}
          </div>
          <div className="bg-black/80 px-6 py-5 flex items-center justify-center gap-8">
            {capturedPhoto?(
              <>
                <button onClick={() => { setCapturedPhoto(null); setCapturedBlob(null); startCamera(cameraFacing); }} className="px-5 py-2.5 rounded-xl bg-white/10 text-white text-sm font-medium hover:bg-white/20 transition">Retake</button>
                <button onClick={useCapturedMedia} className="px-6 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-bold hover:bg-purple-700 transition shadow-lg">Use {cameraMode==="video"?"Video":"Photo"} →</button>
              </>
            ):(cameraMode==="photo"
              ?<button onClick={capturePhoto} className="w-16 h-16 rounded-full bg-white border-4 border-purple-500 hover:scale-95 transition shadow-lg flex items-center justify-center"><Camera size={24} className="text-purple-600"/></button>
              :<button onClick={isRecording?stopRecording:startRecording} className={`w-16 h-16 rounded-full border-4 transition shadow-lg flex items-center justify-center ${isRecording?"bg-red-500 border-red-300 animate-pulse":"bg-white border-red-500"}`}><div className={isRecording?"w-5 h-5 bg-white rounded-sm":"w-4 h-4 bg-red-500 rounded-full"}/></button>
            )}
          </div>
        </div>
      )}

      {/* CREATE POST MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center z-50 p-0 md:p-4">
          <div className="bg-white rounded-t-3xl md:rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-blue-600 to-purple-600">
              <h2 className="font-bold text-white text-base">Create Post</h2>
              <button onClick={() => setShowModal(false)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/20 hover:bg-white/30 text-white transition"><X size={14}/></button>
            </div>
            <div className="px-6 py-4 space-y-3 max-h-[75vh] md:max-h-[70vh] overflow-y-auto">
              <input className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white transition"
                placeholder="Title" value={title} onChange={e=>setTitle(e.target.value)}/>
              <textarea rows={3} className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white transition resize-none"
                placeholder="What's happening in your hood?" value={content} onChange={e=>setContent(e.target.value)}/>
              <input className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white transition"
                placeholder="Location (optional)" value={location} onChange={e=>setLocation(e.target.value)}/>
              <button onClick={getLocation} className="w-full py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition">📍 Use My Current Location</button>

              {geotagged&&captureAddress&&(
                <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-xs text-green-700">
                  <Navigation size={12}/><span className="truncate">Geotagged: {captureAddress}</span>
                  <button onClick={() => { setGeotagged(false); setCaptureAddress(null); }} className="ml-auto"><X size={12}/></button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <select className="px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-400 transition"
                  value={type==="all"?"casual":type} onChange={e=>setType(e.target.value)}>
                  <option value="casual">💬 Casual</option><option value="emergency">🚨 Emergency</option>
                  <option value="event">📅 Event</option><option value="promotional">📢 Promotional</option>
                </select>
                <select className="px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-400 transition"
                  value={severity} onChange={e=>setSeverity(e.target.value)}>
                  <option value="low">🟢 Low</option><option value="medium">🟡 Medium</option><option value="high">🔴 High</option>
                </select>
              </div>

              <div className="flex gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"><input type="checkbox" className="rounded accent-purple-600" checked={alertUsers} onChange={e=>setAlertUsers(e.target.checked)}/> 🔔 Alert users</label>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer"><input type="checkbox" className="rounded accent-purple-600" checked={anonymous} onChange={e=>setAnonymous(e.target.checked)}/> 👤 Anonymous</label>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" className="rounded accent-indigo-600" checked={isPoll} onChange={e=>setIsPoll(e.target.checked)}/>
                  <BarChart2 size={14} className="text-indigo-500"/> Add Poll
                </label>
              </div>

              {/* POLL BUILDER */}
              {isPoll && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-3 space-y-2">
                  <p className="text-xs font-bold text-indigo-700 flex items-center gap-1"><BarChart2 size={12}/> Poll Options (2–6)</p>
                  {pollOptions.map((opt, i) => (
                    <div key={i} className="flex gap-2">
                      <input className="flex-1 px-3 py-2 rounded-xl border border-indigo-200 bg-white text-xs placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
                        placeholder={`Option ${i + 1}`} value={opt} onChange={e => updatePollOption(i, e.target.value)}/>
                      {pollOptions.length > 2 && (
                        <button onClick={() => removePollOption(i)} className="w-8 h-8 rounded-lg bg-red-100 text-red-500 hover:bg-red-200 flex items-center justify-center transition shrink-0"><X size={12}/></button>
                      )}
                    </div>
                  ))}
                  {pollOptions.length < 6 && <button onClick={addPollOption} className="w-full py-1.5 rounded-xl border border-dashed border-indigo-300 text-indigo-600 text-xs font-medium hover:bg-indigo-100 transition">+ Add Option</button>}
                  <div>
                    <label className="text-xs text-indigo-600 font-medium">Poll ends at (optional)</label>
                    <input type="datetime-local" className="w-full mt-1 px-3 py-2 rounded-xl border border-indigo-200 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300 transition"
                      value={pollEndsAt} onChange={e=>setPollEndsAt(e.target.value)}/>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => { setShowModal(false); openCameraModal(); }}
                  className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl border border-dashed border-purple-300 text-xs text-purple-600 bg-purple-50 hover:bg-purple-100 transition font-medium"><Camera size={18}/> Camera</button>
                <label className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl border border-dashed border-gray-300 text-xs text-gray-500 cursor-pointer hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition">
                  <Image size={18}/> Image<input type="file" accept="image/*" hidden onChange={e => { const f=e.target.files[0]; setImage(f); setImagePreview(URL.createObjectURL(f)); setGeotagged(false); }}/>
                </label>
                <label className="flex flex-col items-center justify-center gap-1 py-3 rounded-xl border border-dashed border-gray-300 text-xs text-gray-500 cursor-pointer hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition">
                  <Video size={18}/> Video<input type="file" accept="video/*" hidden onChange={e => { setVideo(e.target.files[0]); setGeotagged(false); }}/>
                </label>
              </div>
              {imagePreview&&<img src={imagePreview} className="w-full rounded-xl object-cover max-h-48" alt="preview"/>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100">
              <button onClick={() => { handlePost(); setShowModal(false); }} className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-sm shadow hover:shadow-md hover:from-blue-700 hover:to-purple-700 transition">🚀 Post to Hood</button>
            </div>
          </div>
        </div>
      )}

      {/* EMERGENCY POPUP */}
      {emergencyPost && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-red-500 to-rose-700 text-white p-8 rounded-3xl w-full max-w-sm text-center shadow-2xl">
            <div className="text-5xl mb-3 animate-bounce">🚨</div>
            <h2 className="text-xl font-black mb-2">EMERGENCY ALERT</h2>
            <h3 className="text-base font-semibold opacity-90">{emergencyPost.title}</h3>
            <p className="mt-2 text-sm opacity-80">{emergencyPost.content}</p>
            {(emergencyPost.targetLat||emergencyPost.originLat)&&(
              <a href={mapsUrl(emergencyPost.targetLat||emergencyPost.originLat,emergencyPost.targetLng||emergencyPost.originLng)} target="_blank" rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 bg-white/20 hover:bg-white/30 text-white text-xs px-3 py-1.5 rounded-xl transition">
                <MapPin size={11}/> View on Google Maps
              </a>
            )}
            <button onClick={() => setEmergencyPost(null)} className="mt-4 block w-full bg-white text-red-600 px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-red-50 transition">Dismiss</button>
          </div>
        </div>
      )}

      {/* AREA MODAL (first time) */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-7 w-full max-w-xs text-center shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-purple-100 flex items-center justify-center mx-auto mb-4"><MapPin size={24} className="text-purple-600"/></div>
            <h2 className="text-lg font-black text-gray-800 mb-1">Where do you live?</h2>
            <p className="text-xs text-gray-400 mb-4">We'll show posts from your neighbourhood</p>
            <input className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 transition mb-3"
              placeholder="e.g. Andheri, Borivali, Majiwada" value={tempArea} onChange={e=>setTempArea(e.target.value)}/>
            <div className="flex gap-2">
              <button className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-sm hover:from-blue-700 hover:to-purple-700 transition"
                onClick={() => {
                  if (!tempArea) return;
                  const f = tempArea.toLowerCase().replace(/\s/g, "-");
                  axios.post(`${BASE_URL}/areas`, { name: f }, { headers: authHeaders() });
                  const u = { ...user, area: f }; localStorage.setItem("user", JSON.stringify(u)); setUser(u);
                  if (socketRef.current) socketRef.current.emit("joinRoom", { area: f });
                  setShowLocationModal(false);
                }}>Enter Manually</button>
              <button className="flex-1 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-sm hover:bg-emerald-100 transition"
                onClick={() => { setShowLocationModal(false); detectNearbyAreas(); }}>
                <Radar size={13} className="inline mr-1"/>Detect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
