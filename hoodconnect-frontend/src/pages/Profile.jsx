import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

const BASE_URL = "https://hoodconnect-backend.onrender.com";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getTier(score) {
  if (score >= 150) return { label: "Diamond", emoji: "💎", color: "text-cyan-400" };
  if (score >= 50)  return { label: "Gold",    emoji: "🥇", color: "text-yellow-400" };
  if (score >= 10)  return { label: "Silver",  emoji: "🥈", color: "text-gray-300" };
  return               { label: "Bronze",  emoji: "🥉", color: "text-orange-400" };
}

export default function Profile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingArea, setEditingArea] = useState(false);
  const [newArea, setNewArea] = useState("");

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("user")); }
    catch { return null; }
  })();

  const isOwnProfile = currentUser?.id === userId;

  useEffect(() => {
    axios.get(`${BASE_URL}/profile/${userId}`, {
      headers: authHeaders()
    }).then(res => {
      setData(res.data);
      setNewArea(res.data.user.area || "");
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId]);

  const handleAreaUpdate = async () => {
    try {
      const formatted = newArea.toLowerCase().replace(/\s/g, "-");
      await axios.put(`${BASE_URL}/users/${userId}/area`, 
        { area: formatted },
        { headers: authHeaders() }
      );
      // Update localStorage too
      const updatedUser = { ...currentUser, area: formatted };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setData(prev => ({ ...prev, user: { ...prev.user, area: formatted }}));
      setEditingArea(false);
    } catch (err) {
      console.log(err);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-slate-900 flex items-center justify-center text-white text-xl">
      Loading...
    </div>
  );

  if (!data) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-slate-900 flex items-center justify-center text-white text-xl">
      User not found
    </div>
  );

  const tier = getTier(data.trustScore);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-slate-900 text-white p-6">
      
      {/* BACK BUTTON */}
      <button
        onClick={() => navigate("/dashboard")}
        className="mb-6 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl transition"
      >
        ← Back
      </button>

      {/* PROFILE CARD */}
      <div className="max-w-2xl mx-auto">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 mb-6 text-center">
          
          {/* AVATAR */}
          <div className="w-24 h-24 mx-auto bg-purple-500 rounded-full flex items-center justify-center text-4xl mb-4">
            {data.user.name?.charAt(0).toUpperCase()}
          </div>

          <h1 className="text-3xl font-bold">{data.user.name}</h1>

          {/* TIER BADGE */}
          <div className={`text-2xl mt-2 ${tier.color}`}>
            {tier.emoji} {tier.label}
          </div>

          {/* STATS ROW */}
          <div className="flex justify-center gap-8 mt-6">
            <div className="text-center">
              <p className="text-2xl font-bold">{data.trustScore}</p>
              <p className="text-xs text-gray-300">Trust Score</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{data.postCount}</p>
              <p className="text-xs text-gray-300">Posts</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">
                {data.user.area?.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) || "—"}
              </p>
              <p className="text-xs text-gray-300">Area</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">
                {new Date(data.user.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
              </p>
              <p className="text-xs text-gray-300">Joined</p>
            </div>
          </div>

          {/* EDIT AREA (own profile only) */}
          {isOwnProfile && (
            <div className="mt-6">
              {editingArea ? (
                <div className="flex gap-2 justify-center">
                  <input
                    className="p-2 rounded-xl text-black"
                    value={newArea}
                    onChange={(e) => setNewArea(e.target.value)}
                    placeholder="New area"
                  />
                  <button
                    onClick={handleAreaUpdate}
                    className="bg-purple-500 px-4 py-2 rounded-xl"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingArea(false)}
                    className="bg-white/10 px-4 py-2 rounded-xl"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEditingArea(true)}
                  className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl transition text-sm"
                >
                  ✏️ Edit Area
                </button>
              )}
            </div>
          )}
        </div>

        {/* POSTS */}
        <h2 className="text-xl font-bold mb-4">
          {isOwnProfile ? "Your Posts" : `${data.user.name}'s Posts`}
        </h2>

        {data.posts.length === 0 ? (
          <div className="bg-white/10 rounded-2xl p-8 text-center text-gray-300">
            No public posts yet
          </div>
        ) : (
          data.posts.map(post => (
            <div key={post._id} className="bg-white text-black rounded-2xl mb-4 p-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                    post.type === "emergency" ? "bg-red-100 text-red-600" :
                    post.type === "event" ? "bg-yellow-100 text-yellow-600" :
                    post.type === "promotional" ? "bg-green-100 text-green-600" :
                    "bg-blue-100 text-blue-600"
                  }`}>
                    {post.type}
                  </span>
                  <h3 className="font-bold text-purple-600 mt-2">{post.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{post.content}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    📍 {post.targetAddress || post.originAddress || "Unknown location"}
                  </p>
                </div>
                {post.image && (
                  <img src={post.image} className="w-16 h-16 rounded-xl object-cover ml-4" alt="" />
                )}
              </div>
              <div className="flex gap-4 mt-3 text-sm text-gray-500">
                <span>❤️ {post.likes?.length || 0}</span>
                <span>👍 {post.trustUpvotes?.length || 0}</span>
                <span>💬 {post.comments?.length || 0}</span>
                <span className="ml-auto text-xs">
                  {new Date(post.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}