import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { MessageCircle } from "lucide-react";

const BASE_URL = "https://hoodconnect-backend.onrender.com";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getTier(score) {
  if (score >= 150) return { label: "Diamond", emoji: "💎", color: "text-cyan-500" };
  if (score >= 50)  return { label: "Gold",    emoji: "🥇", color: "text-yellow-500" };
  if (score >= 10)  return { label: "Silver",  emoji: "🥈", color: "text-gray-400" };
  return               { label: "Bronze",  emoji: "🥉", color: "text-orange-400" };
}

// ── Badge metadata — same as Dashboard ───────────────────────────────────────
const BADGE_META = {
  verified_citizen:   { emoji: "🛡️", label: "Verified Citizen",   color: "bg-blue-100 text-blue-700 border-blue-200" },
  first_responder:    { emoji: "🚨", label: "First Responder",    color: "bg-red-100 text-red-700 border-red-200" },
  active_contributor: { emoji: "💬", label: "Active Contributor", color: "bg-purple-100 text-purple-700 border-purple-200" },
  top_of_area:        { emoji: "🏆", label: "Top of Area",        color: "bg-amber-100 text-amber-700 border-amber-200" },
  truth_seeker:       { emoji: "🔍", label: "Truth Seeker",       color: "bg-teal-100 text-teal-700 border-teal-200" },
  old_timer:          { emoji: "📅", label: "Old Timer",          color: "bg-gray-100 text-gray-700 border-gray-200" },
  newcomer:           { emoji: "✨", label: "Newcomer",           color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};

export default function Profile() {
  const { userId } = useParams();
  const navigate   = useNavigate();

  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [editingArea, setEditingArea] = useState(false);
  const [newArea, setNewArea]     = useState("");
  const [editingBio, setEditingBio]   = useState(false);
  const [newBio, setNewBio]       = useState("");

  const currentUser = (() => {
    try { return JSON.parse(localStorage.getItem("user")); } catch { return null; }
  })();
  const isOwnProfile = currentUser?.id === userId;

  useEffect(() => {
    axios.get(`${BASE_URL}/profile/${userId}`, { headers: authHeaders() })
      .then(res => { setData(res.data); setNewArea(res.data.user.area||""); setNewBio(res.data.user.bio||""); setLoading(false); })
      .catch(() => setLoading(false));
  }, [userId]);

  const handleAreaUpdate = async () => {
    try {
      const formatted = newArea.toLowerCase().replace(/\s/g, "-");
      await axios.put(`${BASE_URL}/users/${userId}/area`, { area: formatted }, { headers: authHeaders() });
      const updatedUser = { ...currentUser, area: formatted };
      localStorage.setItem("user", JSON.stringify(updatedUser));
      setData(prev => ({ ...prev, user: { ...prev.user, area: formatted } }));
      setEditingArea(false);
    } catch (err) { console.log(err); }
  };

  const handleBioUpdate = async () => {
    try {
      await axios.put(`${BASE_URL}/users/${userId}/bio`, { bio: newBio }, { headers: authHeaders() });
      setData(prev => ({ ...prev, user: { ...prev.user, bio: newBio } }));
      setEditingBio(false);
    } catch (err) { console.log(err); }
  };

  if (loading) return (
    <div className="min-h-screen bg-[#f0f2f8] flex items-center justify-center text-gray-500 text-sm">Loading...</div>
  );
  if (!data) return (
    <div className="min-h-screen bg-[#f0f2f8] flex items-center justify-center text-gray-500 text-sm">User not found</div>
  );

  const tier = getTier(data.trustScore);
  const nextTierScore = data.trustScore<10?10:data.trustScore<50?50:data.trustScore<150?150:null;
  const prevTierScore = data.trustScore<10?0:data.trustScore<50?10:data.trustScore<150?50:150;
  const progressPercent = nextTierScore ? Math.round(((data.trustScore-prevTierScore)/(nextTierScore-prevTierScore))*100) : 100;

  return (
    <div className="min-h-screen bg-[#f0f2f8] p-4 md:p-6">

      {/* Back */}
      <button onClick={() => navigate("/dashboard")} className="mb-6 bg-white border border-gray-200 shadow-sm hover:shadow-md px-4 py-2 rounded-xl text-sm text-gray-600 font-medium transition">
        ← Back
      </button>

      <div className="max-w-2xl mx-auto">

        {/* PROFILE CARD */}
        <div className="bg-white border border-gray-100 shadow-sm rounded-3xl p-6 md:p-8 mb-5 text-center">

          {/* Avatar */}
          <div className="w-20 h-20 md:w-24 md:h-24 mx-auto bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-3xl md:text-4xl font-black mb-4 shadow">
            {data.user.name?.charAt(0).toUpperCase()}
          </div>

          {/* Name + verified */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-black text-gray-800">{data.user.name}</h1>
            {data.user.verified && (
              <span title="Verified community member" className="inline-flex items-center gap-1 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                ✓ Verified
              </span>
            )}
          </div>

          {/* Aadhaar status */}
          <div className="flex items-center justify-center gap-2 mt-1 flex-wrap">
            {data.user.aadhaarStatus==="pending"  && <span className="text-[11px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">🕐 ID Review Pending</span>}
            {data.user.aadhaarStatus==="verified" && <span className="text-[11px] bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-semibold">🛡️ ID Verified</span>}
            {data.user.aadhaarStatus==="rejected" && <span className="text-[11px] bg-red-100 text-red-600 border border-red-200 px-2 py-0.5 rounded-full font-semibold">❌ ID Rejected</span>}
          </div>

          {isOwnProfile && !data.user.verified && (
            <p className="text-xs text-gray-400 mt-1">Reach 50 trust points to earn your Verified badge</p>
          )}

          {/* Tier */}
          <div className={`text-xl md:text-2xl mt-2 font-bold ${tier.color}`}>{tier.emoji} {tier.label}</div>

          {/* Tier progress */}
          {nextTierScore && (
            <div className="mt-3 mx-auto max-w-xs">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>{data.trustScore} pts</span><span>Next: {nextTierScore} pts</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-purple-400 to-blue-400 rounded-full transition-all" style={{width:`${progressPercent}%`}}/>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="flex justify-center gap-6 md:gap-8 mt-5 flex-wrap">
            {[
              { val: data.trustScore, label: "Trust Score" },
              { val: data.postCount,  label: "Posts" },
              { val: data.user.area?.replace(/-/g," ").replace(/\b\w/g,c=>c.toUpperCase())||"—", label: "Area" },
              { val: new Date(data.user.createdAt).toLocaleDateString("en-IN",{month:"short",year:"numeric"}), label: "Joined" },
            ].map(s=>(
              <div key={s.label} className="text-center">
                <p className="text-xl md:text-2xl font-black text-gray-800">{s.val}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* ── BADGES ── */}
          {data.user.badges?.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Badges</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {data.user.badges.map(b => (
                  <span key={b} title={BADGE_META[b]?.label}
                    className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border font-semibold ${BADGE_META[b]?.color}`}>
                    {BADGE_META[b]?.emoji} {BADGE_META[b]?.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Bio */}
          <div className="mt-5">
            {editingBio ? (
              <div className="flex flex-col gap-2 items-center">
                <textarea className="w-full p-2 rounded-xl text-gray-800 text-sm border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none"
                  maxLength={160} rows={3} value={newBio} onChange={e=>setNewBio(e.target.value)} placeholder="Write a short bio (max 160 chars)"/>
                <div className="flex gap-2">
                  <button onClick={handleBioUpdate} className="bg-purple-600 text-white px-4 py-1.5 rounded-xl text-sm font-medium hover:bg-purple-700 transition">Save</button>
                  <button onClick={()=>setEditingBio(false)} className="bg-gray-100 text-gray-600 px-4 py-1.5 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Cancel</button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500 italic">{data.user.bio||(isOwnProfile?"No bio yet — add one!":"")}</p>
                {isOwnProfile && <button onClick={()=>setEditingBio(true)} className="mt-2 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-1 rounded-xl transition">✏️ {data.user.bio?"Edit Bio":"Add Bio"}</button>}
              </div>
            )}
          </div>

          {/* Edit area */}
          {isOwnProfile && (
            <div className="mt-4">
              {editingArea ? (
                <div className="flex gap-2 justify-center flex-wrap">
                  <input className="p-2 rounded-xl text-gray-800 text-sm border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-300" value={newArea} onChange={e=>setNewArea(e.target.value)} placeholder="New area"/>
                  <button onClick={handleAreaUpdate} className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-purple-700 transition">Save</button>
                  <button onClick={()=>setEditingArea(false)} className="bg-gray-100 text-gray-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-200 transition">Cancel</button>
                </div>
              ) : (
                <button onClick={()=>setEditingArea(true)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-xl transition text-sm font-medium">✏️ Edit Area</button>
              )}
            </div>
          )}

          {/* DM button — shown on other people's profiles */}
          {!isOwnProfile && (
            <button
              onClick={() => navigate(`/chat/${userId}`)}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold text-sm hover:from-blue-700 hover:to-purple-700 transition shadow"
            >
              <MessageCircle size={16}/> Send Message
            </button>
          )}
        </div>

        {/* POSTS */}
        <h2 className="text-lg font-black text-gray-700 mb-3">
          {isOwnProfile?"Your Posts":`${data.user.name}'s Posts`}
        </h2>

        {data.posts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-gray-400 text-sm">No public posts yet</div>
        ) : (
          data.posts.map(post => (
            <div key={post._id} className="bg-white border border-gray-100 shadow-sm rounded-2xl mb-4 p-4">
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    post.type==="emergency"?"bg-red-100 text-red-600":
                    post.type==="event"?"bg-amber-100 text-amber-700":
                    post.type==="promotional"?"bg-emerald-100 text-emerald-700":
                    "bg-blue-100 text-blue-600"
                  }`}>{post.type}</span>
                  <h3 className="font-bold text-gray-800 mt-2 text-sm">{post.title}</h3>
                  <p className="text-sm text-gray-500 mt-1 leading-relaxed">{post.content}</p>
                  <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                    📍 {post.targetAddress||post.originAddress||"Unknown"}
                  </p>
                </div>
                {post.image && <img src={post.image} className="w-14 h-14 rounded-xl object-cover shrink-0" alt=""/>}
              </div>

              {/* Trust bar */}
              {(post.trustUpvotes?.length>0||post.trustDownvotes?.length>0) && (
                <div className="mt-3">
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full"
                      style={{width:`${((post.trustUpvotes?.length||0)/Math.max(1,(post.trustUpvotes?.length||0)+(post.trustDownvotes?.length||0)))*100}%`}}/>
                  </div>
                </div>
              )}

              <div className="flex gap-4 mt-3 text-sm text-gray-400">
                <span>❤️ {post.likes?.length||0}</span>
                <span>👍 {post.trustUpvotes?.length||0}</span>
                <span>💬 {post.comments?.length||0}</span>
                <span className="ml-auto text-xs">{new Date(post.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
