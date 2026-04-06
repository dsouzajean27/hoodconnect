import { useEffect, useState, useRef, useCallback } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Globe, AlertTriangle, Calendar, User, Megaphone, Menu, X, MapPin, Camera, Video, LogOut, Plus, Search } from "lucide-react";
import { io } from "socket.io-client";
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// --- Configuration & Assets ---
const BASE_URL = "https://hoodconnect-backend.onrender.com";
const alertSound = new Audio("https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3");

// Leaflet Icon Setup
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png",
});

const MAP_ICONS = {
  emergency: new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png', iconSize: [25, 41], iconAnchor: [12, 41] }),
  casual: new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png', iconSize: [25, 41], iconAnchor: [12, 41] }),
  event: new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png', iconSize: [25, 41], iconAnchor: [12, 41] }),
  promotional: new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png', iconSize: [25, 41], iconAnchor: [12, 41] }),
};

export default function Dashboard() {
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const seenAlertsRef = useRef(new Set());

  // --- State ---
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("user")) || null);
  const [posts, setPosts] = useState([]);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [collapsed, setCollapsed] = useState(false);
  const [nearMe, setNearMe] = useState(false);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);

  // Post Creation State
  const [showModal, setShowModal] = useState(false);
  const [postData, setPostData] = useState({ title: "", content: "", location: "", type: "casual", severity: "low", anonymous: false, alertUsers: false });
  const [files, setFiles] = useState({ image: null, video: null, preview: null });
  const [selectedPosition, setSelectedPosition] = useState(null);

  // UI State
  const [emergencyPost, setEmergencyPost] = useState(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [tempArea, setTempArea] = useState("");
  const [commentText, setCommentText] = useState({});

  // --- Core Functions ---
  const fetchPosts = useCallback(async () => {
    if (!user?.area) return;
    try {
      const res = await axios.get(`${BASE_URL}/posts?area=${user.area}`);
      setPosts(res.data);
    } catch (err) { console.error("Fetch error:", err); }
  }, [user?.area]);

  const updateUserArea = (newArea) => {
    const formatted = newArea.toLowerCase().replace(/\s/g, "-");
    const updatedUser = { ...user, area: formatted };
    localStorage.setItem("user", JSON.stringify(updatedUser));
    setUser(updatedUser);
    if (socketRef.current) socketRef.current.emit("joinRoom", { area: formatted });
  };

  // --- Effects ---
  useEffect(() => {
    socketRef.current = io(BASE_URL, { transports: ["websocket"] });
    socketRef.current.on("newPost", (post) => setPosts((prev) => [post, ...prev]));
    
    if (!user?.area) setShowLocationModal(true);
    else fetchPosts();

    return () => socketRef.current.disconnect();
  }, [user?.area, fetchPosts]);

  useEffect(() => {
    posts.forEach((post) => {
      const isRecent = new Date() - new Date(post.createdAt) < 86400000;
      if (post.type === "emergency" && post.alert && isRecent && !seenAlertsRef.current.has(post._id)) {
        setEmergencyPost(post);
        alertSound.play().catch(() => {}); // Catch browser autoplay block
        seenAlertsRef.current.add(post._id);
      }
    });
  }, [posts]);

  // --- Handlers ---
  const getGPS = () => {
    navigator.geolocation.getCurrentPosition((pos) => {
      setLatitude(pos.coords.latitude);
      setLongitude(pos.coords.longitude);
      socketRef.current?.emit("joinLocation", { latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    }, null, { enableHighAccuracy: true });
  };

  const handlePostSubmit = async () => {
    try {
      const fd = new FormData();
      Object.keys(postData).forEach(key => fd.append(key, postData[key]));
      fd.append("area", user?.area || "mumbai");
      fd.append("userId", user?.id);
      fd.append("userName", user?.name || "Unknown");
      fd.append("latitude", latitude || "");
      fd.append("longitude", longitude || "");
      if (files.image) fd.append("image", files.image);
      if (video) fd.append("video", files.video);

      await axios.post(`${BASE_URL}/posts`, fd);
      setShowModal(false);
      setPostData({ title: "", content: "", location: "", type: "casual", severity: "low", anonymous: false, alertUsers: false });
      setFiles({ image: null, video: null, preview: null });
      fetchPosts();
    } catch (err) { console.error(err); }
  };

  const handleAction = async (id, action, payload = {}) => {
    try {
      const routes = { like: `like`, trust: `trust`, comment: `comment`, delete: `` };
      const method = action === 'delete' ? 'delete' : (action === 'comment' ? 'post' : 'put');
      await axios[method](`${BASE_URL}/posts/${id}/${routes[action]}`, { userId: user?.id, ...payload });
      fetchPosts();
    } catch (err) { console.error(err); }
  };

  const getDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return (6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1);
  };

  const filteredPosts = posts.filter(p => {
    const matchesType = type === "all" || p.type === type;
    const matchesSearch = !search || [p.title, p.content, p.targetAddress].some(f => f?.toLowerCase().includes(search.toLowerCase()));
    const matchesNear = !nearMe || getDistance(latitude, longitude, p.targetLat || p.originLat, p.targetLng || p.originLng) <= 5;
    return matchesType && matchesSearch && matchesNear;
  });

  function MapEvents() {
    useMapEvents({
      async click(e) {
        setSelectedPosition([e.latlng.lat, e.latlng.lng]);
        setLatitude(e.latlng.lat);
        setLongitude(e.latlng.lng);
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${e.latlng.lat}&lon=${e.latlng.lng}&format=json`);
        const data = await res.json();
        setPostData(prev => ({ ...prev, location: data.display_name || "Selected Location" }));
        setShowModal(true);
      }
    });
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white font-sans flex flex-col">
      {/* HEADER */}
      <header className="flex justify-between items-center p-5 bg-white/5 backdrop-blur-md sticky top-0 z-[40] border-b border-white/10">
        <h1 className="text-2xl font-black tracking-tighter text-blue-400">HOODCONNECT</h1>
        <button onClick={() => navigate("/")} className="flex items-center gap-2 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white px-4 py-2 rounded-xl transition-all"><LogOut size={18}/> Logout</button>
      </header>

      <main className="flex flex-1 gap-6 p-6 max-w-7xl mx-auto w-full">
        {/* LEFT NAV */}
        <aside className={`transition-all duration-300 bg-white/5 border border-white/10 p-4 rounded-3xl h-fit sticky top-24 ${collapsed ? "w-20" : "w-64"}`}>
          <button onClick={() => setCollapsed(!collapsed)} className="p-2 hover:bg-white/10 rounded-lg mb-4"><Menu /></button>
          <button onClick={() => { setNearMe(!nearMe); getGPS(); }} className={`flex items-center gap-3 w-full p-3 rounded-xl mb-2 transition-colors ${nearMe ? "bg-blue-600 text-white" : "hover:bg-white/10"}`}>
            <MapPin size={20} /> {!collapsed && <span>Near Me</span>}
          </button>
          <div className="h-px bg-white/10 my-4" />
          {[{ key: "all", label: "All", icon: Globe }, { key: "emergency", label: "Emergency", icon: AlertTriangle }, { key: "event", label: "Event", icon: Calendar }, { key: "casual", label: "Casual", icon: User }, { key: "promotional", label: "Promo", icon: Megaphone }].map((f) => (
            <button key={f.key} onClick={() => setType(f.key)} className={`flex items-center gap-3 w-full p-3 rounded-xl mb-1 transition-colors ${type === f.key ? "bg-white/20" : "hover:bg-white/10"}`}>
              <f.icon size={20} /> {!collapsed && <span>{f.label}</span>}
            </button>
          ))}
        </aside>

        {/* FEED */}
        <section className="flex-1 max-w-2xl space-y-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white/10 border border-white/10 outline-none focus:border-blue-500 transition-all" placeholder="Search neighborhood alerts..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>

          <button onClick={() => setShowModal(true)} className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg hover:scale-[1.02] active:scale-95 transition-all"><Plus /> Create New Post</button>

          <div className="rounded-3xl overflow-hidden h-72 border border-white/10 shadow-2xl relative z-0">
            <MapContainer center={[19.076, 72.8777]} zoom={12} style={{ height: "100%", width: "100%" }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y} (1).png" />
              <MapEvents />
              {filteredPosts.map(p => (p.targetLat || p.originLat) && (
                <Marker key={p._id} position={[p.targetLat || p.originLat, p.targetLng || p.originLng]} icon={MAP_ICONS[p.type] || MAP_ICONS.casual}>
                  <Popup><div className="text-black font-sans"><p className="font-bold">{p.title}</p><p className="text-xs">{p.content}</p></div></Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {filteredPosts.map((post) => (
            <article key={post._id} className="bg-white rounded-3xl overflow-hidden shadow-sm">
              <div className="p-5 flex items-center justify-between border-b border-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold">{post.userName?.charAt(0)}</div>
                  <div>
                    <h4 className="text-gray-900 font-bold text-sm">@{post.userName}</h4>
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest">{post.type} • {new Date(post.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-blue-600">⏳ {new Date() - new Date(post.createdAt) > 86400000 ? "Expired" : "Live"}</p>
                  <p className="text-[10px] text-gray-400">📍 {getDistance(latitude, longitude, post.targetLat || post.originLat, post.targetLng || post.originLng)} km away</p>
                </div>
              </div>

              {post.type === "emergency" && post.alert && <div className="bg-red-500 text-white p-2 text-center text-xs font-black animate-pulse tracking-tighter">🚨 CRITICAL EMERGENCY ALERT 🚨</div>}

              <div className="p-5 space-y-3">
                <h3 className="text-gray-900 font-extrabold text-xl leading-tight">{post.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{post.content}</p>
                {post.image && <img src={`${BASE_URL}/uploads/${post.image}`} className="rounded-2xl w-full object-cover max-h-80 border" alt="post" />}
                {post.video && <video src={`${BASE_URL}/uploads/${post.video}`} controls className="rounded-2xl w-full border" />}
                <p className="text-xs text-gray-400 italic">📍 {post.targetAddress || "No location provided"}</p>
              </div>

              <div className="px-5 py-4 bg-gray-50 flex justify-between">
                <div className="flex gap-6">
                  <button onClick={() => handleAction(post._id, 'trust', { type: 'up' })} className="flex items-center gap-1.5 text-gray-600 hover:text-green-600 transition-colors">👍 <span className="text-xs font-bold">{post.trustUpvotes?.length || 0}</span></button>
                  <button onClick={() => handleAction(post._id, 'trust', { type: 'down' })} className="flex items-center gap-1.5 text-gray-600 hover:text-red-600 transition-colors">❌ <span className="text-xs font-bold">{post.trustDownvotes?.length || 0}</span></button>
                  <button onClick={() => handleAction(post._id, 'like')} className="flex items-center gap-1.5 text-gray-600 hover:text-pink-600 transition-colors">❤️ <span className="text-xs font-bold">{post.likes?.length || 0}</span></button>
                </div>
                <div className="flex gap-4">
                  <button onClick={() => handleAction(post._id, 'delete')} className="text-red-400 hover:text-red-600 text-xs font-bold">Delete</button>
                </div>
              </div>

              <div className="p-4 border-t border-gray-100">
                <div className="flex gap-2 mb-4">
                  <input className="flex-1 bg-gray-100 p-2.5 rounded-xl text-sm text-black outline-none border border-transparent focus:border-blue-400" placeholder="Write a comment..." value={commentText[post._id] || ""} onChange={(e) => setCommentText({...commentText, [post._id]: e.target.value})} />
                  <button onClick={() => handleAction(post._id, 'comment', { text: commentText[post._id], userName: user?.name })} className="bg-blue-600 text-white px-4 rounded-xl text-xs font-bold">Post</button>
                </div>
                {post.comments?.map((c, i) => (
                  <div key={i} className="text-xs py-1 border-b border-gray-50 last:border-0"><span className="font-bold text-gray-800">{c.userName}</span> <span className="text-gray-600">{c.text}</span></div>
                ))}
              </div>
            </article>
          ))}
        </section>

        {/* RIGHT ASIDE */}
        <aside className="w-80 space-y-6 sticky top-24 h-fit">
          <div className="bg-white/5 border border-white/10 p-6 rounded-[2rem] text-center">
            <div className="w-20 h-20 mx-auto bg-gradient-to-tr from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-2xl font-black shadow-xl mb-4">{user?.name?.charAt(0)}</div>
            <h2 className="text-xl font-bold">{user?.name}</h2>
            <p className="text-blue-400 text-xs font-bold mb-6 flex items-center justify-center gap-1"><MapPin size={12}/> {user?.area || "Unknown Area"}</p>
            <label className="text-[10px] text-gray-500 uppercase font-black block mb-2">Switch Neighborhood</label>
            <select className="w-full p-3 rounded-xl bg-slate-800 text-sm border border-white/10 outline-none" value={user?.area} onChange={(e) => updateUserArea(e.target.value)}>
              <option value="majiwada">Majiwada</option>
              <option value="andheri">Andheri</option>
              <option value="borivali">Borivali</option>
              <option value="dadar">Dadar</option>
            </select>
          </div>
        </aside>
      </main>

      {/* CREATE MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-white/10 w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl relative">
            <button onClick={() => setShowModal(false)} className="absolute top-6 right-6 text-gray-400 hover:text-white"><X /></button>
            <h2 className="text-2xl font-black mb-6">Create New Post</h2>
            
            <div className="space-y-4">
              <input className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 outline-none" placeholder="Catchy title..." value={postData.title} onChange={e => setPostData({...postData, title: e.target.value})} />
              <textarea className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 outline-none h-28" placeholder="Share what's happening..." value={postData.content} onChange={e => setPostData({...postData, content: e.target.value})} />
              <div className="flex gap-2">
                <input className="flex-1 p-3 rounded-xl bg-white/5 border border-white/10 text-xs" placeholder="Location name..." value={postData.location} onChange={e => setPostData({...postData, location: e.target.value})} />
                <button onClick={getGPS} className="bg-green-500/20 text-green-400 p-3 rounded-xl hover:bg-green-500 hover:text-white transition-all"><MapPin size={18}/></button>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <select className="p-3 rounded-xl bg-slate-700 text-xs" value={postData.type} onChange={e => setPostData({...postData, type: e.target.value})}>
                  <option value="casual">Casual</option>
                  <option value="emergency">Emergency</option>
                  <option value="event">Event</option>
                </select>
                <select className="p-3 rounded-xl bg-slate-700 text-xs" value={postData.severity} onChange={e => setPostData({...postData, severity: e.target.value})}>
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium</option>
                  <option value="high">Urgent</option>
                </select>
              </div>

              <div className="flex items-center justify-between px-2">
                <label className="flex items-center gap-2 text-xs text-gray-400"><input type="checkbox" checked={postData.alertUsers} onChange={e => setPostData({...postData, alertUsers: e.target.checked})} /> Send Alert</label>
                <label className="flex items-center gap-2 text-xs text-gray-400"><input type="checkbox" checked={postData.anonymous} onChange={e => setPostData({...postData, anonymous: e.target.checked})} /> Anonymous</label>
              </div>

              <div className="flex gap-3">
                <label className="flex-1 flex flex-col items-center justify-center p-4 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:border-blue-500/50">
                  <Camera size={20} className="mb-1" /><span className="text-[10px]">Photo</span>
                  <input type="file" accept="image/*" hidden onChange={e => {setFiles({...files, image: e.target.files[0], preview: URL.createObjectURL(e.target.files[0])})}} />
                </label>
                <label className="flex-1 flex flex-col items-center justify-center p-4 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:border-blue-500/50">
                  <Video size={20} className="mb-1" /><span className="text-[10px]">Video</span>
                  <input type="file" accept="video/*" hidden onChange={e => setFiles({...files, video: e.target.files[0]})} />
                </label>
              </div>
              
              {files.preview && <img src={files.preview} className="w-full h-32 object-cover rounded-xl border border-white/10" alt="preview" />}

              <button onClick={handlePostSubmit} className="w-full py-4 bg-blue-600 rounded-2xl font-black shadow-xl active:scale-95 transition-all">POST ALERT</button>
            </div>
          </div>
        </div>
      )}

      {/* EMERGENCY POPUP */}
      {emergencyPost && (
        <div className="fixed inset-0 bg-red-950/95 z-[200] flex items-center justify-center p-6 text-center">
          <div className="max-w-md animate-pulse">
            <AlertTriangle size={80} className="text-red-500 mx-auto mb-6" />
            <h2 className="text-4xl font-black text-white mb-4 tracking-tighter">EMERGENCY ALERT</h2>
            <h3 className="text-xl font-bold text-red-400 mb-2">{emergencyPost.title}</h3>
            <p className="text-gray-300 mb-8">{emergencyPost.content}</p>
            <button onClick={() => setEmergencyPost(null)} className="w-full py-4 bg-white text-red-600 rounded-2xl font-black text-lg">I UNDERSTAND</button>
          </div>
        </div>
      )}

      {/* ONBOARDING LOCATION */}
      {showLocationModal && (
        <div className="fixed inset-0 bg-slate-900 z-[300] flex items-center justify-center p-6 text-center">
          <div className="bg-white text-black p-10 rounded-[3rem] w-full max-w-sm shadow-2xl">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6"><MapPin size={32} /></div>
            <h2 className="text-2xl font-black mb-2">Almost there!</h2>
            <p className="text-gray-500 text-sm mb-6">Enter your neighborhood to see what's happening around you.</p>
            <input className="w-full p-4 border-2 border-gray-100 rounded-2xl mb-4 text-center font-bold" placeholder="e.g. Andheri West" value={tempArea} onChange={e => setTempArea(e.target.value)} />
            <button className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black" onClick={() => { if(tempArea) { updateUserArea(tempArea); setShowLocationModal(false); } }}>Explore Neighborhood</button>
          </div>
        </div>
      )}
    </div>
  );
}