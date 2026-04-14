import { useEffect, useState } from "react";
import axios from "axios";
import {
  ShieldCheck, Users, AlertTriangle, CheckCircle,
  XCircle, Ban, AlertOctagon, LogOut, Eye,
  BarChart2, Search, Filter, TrendingUp, RefreshCw,
} from "lucide-react";

const BASE_URL = "https://hoodconnect-backend.onrender.com";

function adminHeaders(secret) {
  return { Authorization: `Bearer ${secret}` };
}

// ── Pure-SVG bar chart (no external lib) ─────────────────────────────────────
function BarChart({ data = [], color = "#8b5cf6", height = 80 }) {
  if (!data.length) return <p className="text-xs text-gray-400 text-center py-6">No data yet</p>;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
          <span className="text-[9px] text-gray-400 font-medium leading-none">{d.count}</span>
          <div
            className="w-full rounded-t transition-all"
            style={{ height: `${Math.max((d.count / max) * (height - 20), 2)}px`, background: color }}
          />
          <span className="text-[8px] text-gray-400 truncate w-full text-center leading-none">
            {(d._id || "").toString().slice(-5)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Pure-SVG donut chart ──────────────────────────────────────────────────────
function DonutChart({ data = [] }) {
  if (!data.length) return <p className="text-xs text-gray-400 text-center py-6">No data</p>;
  const COLORS = { emergency:"#ef4444", event:"#f59e0b", casual:"#3b82f6", promotional:"#10b981" };
  const total = data.reduce((s, d) => s + d.count, 0);
  const size = 90, r = 28, cx = 45, cy = 45, circ = 2 * Math.PI * r;
  let cum = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="shrink-0">
        {data.map((d, i) => {
          const pct    = d.count / total;
          const offset = circ * (1 - cum);
          const dash   = circ * pct;
          cum += pct;
          return (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={COLORS[d._id] || "#a78bfa"} strokeWidth="14"
              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={offset}
              transform={`rotate(-90 ${cx} ${cy})`}/>
          );
        })}
        <text x={cx} y={cy + 4} textAnchor="middle" fill="#374151" fontSize="10" fontWeight="bold">{total}</text>
      </svg>
      <div className="space-y-1 min-w-0">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600 min-w-0">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORS[d._id] || "#a78bfa" }}/>
            <span className="capitalize truncate">{d._id}</span>
            <span className="text-gray-400 font-medium ml-auto pl-2 shrink-0">
              {Math.round(d.count / total * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [secret, setSecret]             = useState("");
  const [authed, setAuthed]             = useState(false);
  const [authError, setAuthError]       = useState("");

  // NEW: analytics tab added alongside existing tabs
  const [tab, setTab]                   = useState("aadhaar");

  const [pendingUsers, setPendingUsers] = useState([]);
  const [reportedUsers, setReportedUsers] = useState([]);
  const [reportedPosts, setReportedPosts] = useState([]);
  const [analytics, setAnalytics]       = useState(null);   // NEW
  const [areas, setAreas]               = useState([]);      // NEW

  // NEW: search + area filter state
  const [searchQ, setSearchQ]       = useState("");
  const [areaFilter, setAreaFilter] = useState("");

  const [rejectReason, setRejectReason] = useState({});
  const [loading, setLoading]           = useState(false);
  const [toast, setToast]               = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    setLoading(true);
    try {
      await axios.get(`${BASE_URL}/admin/aadhaar-pending`, { headers: adminHeaders(secret) });
      localStorage.setItem("adminSecret", secret);
      setAuthed(true);
      setAuthError("");
    } catch {
      setAuthError("Invalid admin secret. Access denied.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem("adminSecret");
    if (saved) setSecret(saved);
  }, []);

  // ── Data fetchers ─────────────────────────────────────────────────────────
  const fetchPendingUsers = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/admin/aadhaar-pending`, { headers: adminHeaders(secret) });
      setPendingUsers(res.data);
    } catch (err) { console.log(err); }
  };

  // NEW: pass search + area to reported endpoints
  const fetchReportedData = async () => {
    try {
      const params = new URLSearchParams();
      if (searchQ)    params.set("search", searchQ);
      if (areaFilter) params.set("area",   areaFilter);
      const [usersRes, postsRes] = await Promise.all([
        axios.get(`${BASE_URL}/admin/reported-users?${params}`,  { headers: adminHeaders(secret) }),
        axios.get(`${BASE_URL}/admin/reported-posts?${params}`,  { headers: adminHeaders(secret) }),
      ]);
      setReportedUsers(usersRes.data);
      setReportedPosts(postsRes.data);
    } catch (err) { console.log(err); }
  };

  // NEW: fetch analytics
  const fetchAnalytics = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/admin/analytics`, { headers: adminHeaders(secret) });
      setAnalytics(res.data);
    } catch (err) { console.log(err); }
  };

  // NEW: fetch areas for filter dropdown
  const fetchAreas = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/areas`);
      setAreas(res.data);
    } catch {}
  };

  useEffect(() => {
    if (!authed) return;
    fetchPendingUsers();
    fetchReportedData();
    fetchAnalytics();   // NEW
    fetchAreas();       // NEW
  }, [authed]);

  // Re-fetch reported when search/area filter changes
  useEffect(() => {
    if (authed) fetchReportedData();
  }, [searchQ, areaFilter]);

  // ── Aadhaar actions (unchanged) ───────────────────────────────────────────
  const approveAadhaar = async (userId) => {
    try {
      await axios.put(`${BASE_URL}/admin/aadhaar/${userId}/approve`, {}, { headers: adminHeaders(secret) });
      showToast("✅ Aadhaar approved");
      fetchPendingUsers();
    } catch { showToast("Failed to approve", "error"); }
  };

  const rejectAadhaar = async (userId) => {
    const reason = rejectReason[userId] || "Does not meet requirements";
    try {
      await axios.put(`${BASE_URL}/admin/aadhaar/${userId}/reject`, { reason }, { headers: adminHeaders(secret) });
      showToast("❌ Aadhaar rejected");
      fetchPendingUsers();
    } catch { showToast("Failed to reject", "error"); }
  };

  // ── User moderation (unchanged) ───────────────────────────────────────────
  const warnUser = async (userId) => {
    try {
      await axios.put(`${BASE_URL}/admin/users/${userId}/warn`, {}, { headers: adminHeaders(secret) });
      showToast("⚠️ Warning issued");
      fetchReportedData();
    } catch { showToast("Failed to warn", "error"); }
  };

  const banUser = async (userId) => {
    if (!window.confirm("Ban this user? They won't be able to log in.")) return;
    try {
      await axios.put(`${BASE_URL}/admin/users/${userId}/ban`, {}, { headers: adminHeaders(secret) });
      showToast("🚫 User banned");
      fetchReportedData();
    } catch { showToast("Failed to ban", "error"); }
  };

  // ── Post moderation (unchanged) ───────────────────────────────────────────
  const deletePost = async (postId) => {
    if (!window.confirm("Delete this post?")) return;
    try {
      await axios.delete(`${BASE_URL}/admin/posts/${postId}`, { headers: adminHeaders(secret) });
      showToast("🗑️ Post deleted");
      fetchReportedData();
    } catch { showToast("Failed to delete", "error"); }
  };

  const dismissReport = async (postId) => {
    try {
      await axios.put(`${BASE_URL}/admin/posts/${postId}/dismiss-report`, {}, { headers: adminHeaders(secret) });
      showToast("✓ Report dismissed");
      fetchReportedData();
    } catch { showToast("Failed to dismiss", "error"); }
  };

  // ── Login screen (unchanged) ──────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-slate-800 flex items-center justify-center px-4">
        <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-3xl p-8 w-full max-w-sm text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/30 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck size={32} className="text-purple-300" />
          </div>
          <h1 className="text-2xl font-black text-white mb-1">Admin Portal</h1>
          <p className="text-sm text-white/50 mb-6">HoodConnect — Restricted Access</p>
          <input
            type="password"
            placeholder="Enter admin secret"
            className="w-full bg-white/5 border border-white/10 p-3 rounded-2xl text-white placeholder-white/30 outline-none focus:border-purple-400 transition mb-3 text-sm"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          />
          {authError && <p className="text-red-400 text-xs mb-3">{authError}</p>}
          <button
            onClick={handleLogin}
            disabled={loading || !secret}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold py-3 rounded-2xl transition"
          >
            {loading ? "Verifying..." : "Access Dashboard"}
          </button>
        </div>
      </div>
    );
  }

  // ── Summary stats ─────────────────────────────────────────────────────────
  const S = analytics?.summary || {};

  return (
    <div className="min-h-screen bg-[#f0f2f8]">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-lg text-sm font-semibold text-white transition-all ${toast.type === "error" ? "bg-red-500" : "bg-green-500"}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center">
            <ShieldCheck size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-black text-gray-800 text-lg leading-none">HoodConnect Admin</h1>
            <p className="text-xs text-gray-400">Moderation Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* NEW: refresh button */}
          <button onClick={() => { fetchPendingUsers(); fetchReportedData(); fetchAnalytics(); }}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-400 transition" title="Refresh">
            <RefreshCw size={16}/>
          </button>
          <button
            onClick={() => { localStorage.removeItem("adminSecret"); setAuthed(false); setSecret(""); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 text-sm font-medium transition"
          >
            <LogOut size={15} /> Logout
          </button>
        </div>
      </header>

      {/* NEW: Summary stats row */}
      <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Users",    value: S.totalUsers    || 0, color: "bg-blue-100 text-blue-700",    icon: <Users size={18}/> },
          { label: "Total Posts",    value: S.totalPosts    || 0, color: "bg-purple-100 text-purple-700", icon: <TrendingUp size={18}/> },
          { label: "New Users (7d)", value: S.newUsers7d   || 0, color: "bg-green-100 text-green-700",   icon: <Eye size={18}/> },
          { label: "Total Reports",  value: S.totalReports  || 0, color: "bg-red-100 text-red-700",       icon: <AlertTriangle size={18}/> },
        ].map(stat => (
          <div key={stat.label} className={`${stat.color} rounded-2xl p-4 flex items-center gap-3`}>
            <div className="opacity-60">{stat.icon}</div>
            <div>
              <p className="text-2xl font-black leading-none">{stat.value}</p>
              <p className="text-xs font-medium opacity-70 mt-0.5">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs — NEW: analytics tab added */}
      <div className="px-6 mb-4">
        <div className="flex gap-1 bg-white rounded-2xl p-1 shadow-sm border border-gray-100 w-fit flex-wrap">
          {[
            { key: "aadhaar",   label: "Aadhaar Reviews",  count: pendingUsers.length },
            { key: "reported",  label: "Reported Content",  count: reportedUsers.length + reportedPosts.length },
            { key: "analytics", label: "Analytics",          count: 0 },  // NEW
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${tab === t.key ? "bg-purple-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
              {t.label}
              {t.count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === t.key ? "bg-white/30 text-white" : "bg-red-100 text-red-600"}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 pb-8">

        {/* ── AADHAAR REVIEWS TAB (unchanged) ── */}
        {tab === "aadhaar" && (
          <div className="space-y-3">
            <h2 className="font-bold text-gray-700 text-sm uppercase tracking-widest mb-3">Pending Aadhaar Verifications</h2>
            {pendingUsers.length === 0 && (
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center text-gray-400 text-sm">
                🎉 No pending Aadhaar reviews
              </div>
            )}
            {pendingUsers.map((u) => (
              <div key={u._id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white font-bold shrink-0">
                    {u.name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-gray-800">{u.name}</span>
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">🕐 Pending</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{u.email}</p>
                    <div className="flex gap-3 mt-1 text-xs text-gray-400">
                      <span>📍 {u.area?.replace(/-/g," ")}</span>
                      <span>📅 {new Date(u.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="mt-2 inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
                      <ShieldCheck size={13} className="text-purple-400" />
                      <span className="text-xs font-mono text-gray-600">Aadhaar ends in: <strong>{u.aadhaarLast4 || "N/A"}</strong></span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    className="flex-1 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-600 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-300 transition"
                    placeholder="Rejection reason (optional)"
                    value={rejectReason[u._id] || ""}
                    onChange={(e) => setRejectReason({ ...rejectReason, [u._id]: e.target.value })}
                  />
                </div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => approveAadhaar(u._id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-bold transition shadow-sm">
                    <CheckCircle size={15} /> Approve
                  </button>
                  <button onClick={() => rejectAadhaar(u._id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition shadow-sm">
                    <XCircle size={15} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── REPORTED CONTENT TAB (search + area filter added) ── */}
        {tab === "reported" && (
          <div className="space-y-6">

            {/* NEW: Search + area filter bar */}
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
                <input
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-300 transition"
                  placeholder="Search name, email, title..."
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                />
              </div>
              <div className="relative">
                <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
                <select
                  className="pl-8 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-300 transition appearance-none"
                  value={areaFilter}
                  onChange={e => setAreaFilter(e.target.value)}
                >
                  <option value="">All Areas</option>
                  {areas.map(a => (
                    <option key={a._id} value={a.name}>
                      {a.name.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Reported Users */}
            <div>
              <h2 className="font-bold text-gray-700 text-sm uppercase tracking-widest mb-3">
                Reported Users {searchQ || areaFilter ? `(filtered)` : ""}
              </h2>
              {reportedUsers.length === 0 && (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-gray-400 text-sm">
                  No reported users
                </div>
              )}
              {reportedUsers.map((u) => (
                <div key={u._id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-400 to-orange-400 flex items-center justify-center text-white font-bold shrink-0">
                      {u.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-800">{u.name}</span>
                        {u.banned && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold">🚫 Banned</span>}
                        {u.warnings > 0 && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">⚠️ {u.warnings} warning(s)</span>}
                      </div>
                      <p className="text-xs text-gray-400">{u.email} · {u.area?.replace(/-/g," ")}</p>
                      <p className="text-xs text-red-500 mt-0.5 font-medium">Reported {u.reportCount || 1} time(s)</p>
                    </div>
                  </div>
                  {!u.banned && (
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => warnUser(u._id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition">
                        <AlertTriangle size={14} /> Warn
                      </button>
                      <button onClick={() => banUser(u._id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition">
                        <Ban size={14} /> Ban
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Reported Posts */}
            <div>
              <h2 className="font-bold text-gray-700 text-sm uppercase tracking-widest mb-3">
                Reported Posts {searchQ || areaFilter ? `(filtered)` : ""}
              </h2>
              {reportedPosts.length === 0 && (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-gray-400 text-sm">
                  No reported posts
                </div>
              )}
              {reportedPosts.map((post) => (
                <div key={post._id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          post.type==="emergency" ? "bg-red-100 text-red-600" :
                          post.type==="event"     ? "bg-amber-100 text-amber-700" :
                          post.type==="promotional" ? "bg-emerald-100 text-emerald-700" :
                          "bg-blue-100 text-blue-600"
                        }`}>{post.type}</span>
                        <span className="text-xs text-red-500 font-semibold">🚩 {post.reportCount || 1} report(s)</span>
                        {/* NEW: show area */}
                        {post.area && <span className="text-[10px] text-gray-400">📍 {post.area.replace(/-/g," ")}</span>}
                      </div>
                      <h3 className="font-bold text-gray-800 text-sm">{post.title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{post.content}</p>
                      <p className="text-xs text-gray-400 mt-1">by {post.userName} · {new Date(post.createdAt).toLocaleDateString()}</p>
                    </div>
                    {post.image && <img src={post.image} className="w-16 h-16 rounded-xl object-cover shrink-0" alt="" />}
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    <button onClick={() => dismissReport(post._id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-semibold transition">
                      <CheckCircle size={14} /> Dismiss
                    </button>
                    <button onClick={() => deletePost(post._id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition">
                      <XCircle size={14} /> Delete Post
                    </button>
                    {post.userId && (
                      <button onClick={() => warnUser(post.userId)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition">
                        <AlertTriangle size={14} /> Warn Author
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── NEW: ANALYTICS TAB ── */}
        {tab === "analytics" && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">

              {/* Posts per day */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart2 size={15} className="text-purple-500"/>
                  <span className="font-bold text-gray-800 text-sm">Posts — last 7 days</span>
                </div>
                <BarChart data={analytics?.postsPerDay} color="#8b5cf6"/>
              </div>

              {/* Reports per day */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <AlertOctagon size={15} className="text-red-500"/>
                  <span className="font-bold text-gray-800 text-sm">Reports — last 7 days</span>
                </div>
                <BarChart data={analytics?.reportsPerDay} color="#ef4444"/>
              </div>

              {/* Post type breakdown */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Eye size={15} className="text-blue-500"/>
                  <span className="font-bold text-gray-800 text-sm">Post Type Breakdown</span>
                </div>
                <DonutChart data={analytics?.postTypes}/>
              </div>

              {/* Users per area */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Users size={15} className="text-green-500"/>
                  <span className="font-bold text-gray-800 text-sm">Users per Area (top 10)</span>
                </div>
                <BarChart
                  data={(analytics?.usersPerArea || []).map(u => ({ _id: u._id, count: u.count }))}
                  color="#10b981"
                />
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
