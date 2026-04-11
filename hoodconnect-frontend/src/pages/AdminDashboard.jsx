import { useEffect, useState } from "react";
import axios from "axios";
import {
  ShieldCheck, Users, AlertTriangle, CheckCircle,
  XCircle, Ban, AlertOctagon, LogOut, Eye,
} from "lucide-react";

const BASE_URL = "https://hoodconnect-backend.onrender.com";

function adminHeaders(secret) {
  return { Authorization: `Bearer ${secret}` };
}

export default function AdminDashboard() {
  const [secret, setSecret]             = useState("");
  const [authed, setAuthed]             = useState(false);
  const [authError, setAuthError]       = useState("");

  const [tab, setTab]                   = useState("aadhaar"); // "aadhaar" | "reported"

  const [pendingUsers, setPendingUsers] = useState([]);
  const [reportedUsers, setReportedUsers] = useState([]);
  const [reportedPosts, setReportedPosts] = useState([]);

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
      // Try fetching pending users with this secret to validate it
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

  // Try restoring session
  useEffect(() => {
    const saved = localStorage.getItem("adminSecret");
    if (saved) { setSecret(saved); }
  }, []);

  // ── Data fetchers ─────────────────────────────────────────────────────────
  const fetchPendingUsers = async () => {
    try {
      const res = await axios.get(`${BASE_URL}/admin/aadhaar-pending`, { headers: adminHeaders(secret) });
      setPendingUsers(res.data);
    } catch (err) { console.log(err); }
  };

  const fetchReportedData = async () => {
    try {
      const [usersRes, postsRes] = await Promise.all([
        axios.get(`${BASE_URL}/admin/reported-users`, { headers: adminHeaders(secret) }),
        axios.get(`${BASE_URL}/admin/reported-posts`, { headers: adminHeaders(secret) }),
      ]);
      setReportedUsers(usersRes.data);
      setReportedPosts(postsRes.data);
    } catch (err) { console.log(err); }
  };

  useEffect(() => {
    if (!authed) return;
    fetchPendingUsers();
    fetchReportedData();
  }, [authed]);

  // ── Aadhaar actions ───────────────────────────────────────────────────────
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

  // ── User moderation ───────────────────────────────────────────────────────
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

  // ── Reported post actions ─────────────────────────────────────────────────
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

  // ── Login screen ──────────────────────────────────────────────────────────
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

  // ── Main dashboard ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f0f2f8]">
      {/* Toast */}
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
        <button
          onClick={() => { localStorage.removeItem("adminSecret"); setAuthed(false); setSecret(""); }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 text-sm font-medium transition"
        >
          <LogOut size={15} /> Logout
        </button>
      </header>

      {/* Stats row */}
      <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Pending Aadhaar", value: pendingUsers.length, color: "bg-amber-100 text-amber-700", icon: <Eye size={18}/> },
          { label: "Reported Users",  value: reportedUsers.length, color: "bg-red-100 text-red-600",    icon: <AlertTriangle size={18}/> },
          { label: "Reported Posts",  value: reportedPosts.length, color: "bg-orange-100 text-orange-600", icon: <AlertOctagon size={18}/> },
          { label: "Total Reviews",   value: pendingUsers.length + reportedUsers.length + reportedPosts.length, color: "bg-purple-100 text-purple-600", icon: <Users size={18}/> },
        ].map((stat) => (
          <div key={stat.label} className={`${stat.color} rounded-2xl p-4 flex items-center gap-3`}>
            <div className="opacity-70">{stat.icon}</div>
            <div>
              <p className="text-2xl font-black leading-none">{stat.value}</p>
              <p className="text-xs font-medium opacity-70 mt-0.5">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="px-6 mb-4">
        <div className="flex gap-1 bg-white rounded-2xl p-1 shadow-sm border border-gray-100 w-fit">
          {[
            { key: "aadhaar",  label: "Aadhaar Reviews",  count: pendingUsers.length },
            { key: "reported", label: "Reported Content",  count: reportedUsers.length + reportedPosts.length },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${tab===t.key ? "bg-purple-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
              {t.label}
              {t.count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab===t.key ? "bg-white/30 text-white" : "bg-red-100 text-red-600"}`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 pb-8">

        {/* ── AADHAAR REVIEWS TAB ── */}
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
                    {/* Last 4 digits */}
                    <div className="mt-2 inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
                      <ShieldCheck size={13} className="text-purple-400" />
                      <span className="text-xs font-mono text-gray-600">Aadhaar ends in: <strong>{u.aadhaarLast4 || "N/A"}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Rejection reason input */}
                <div className="mt-3 flex gap-2">
                  <input
                    className="flex-1 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-600 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-300 transition"
                    placeholder="Rejection reason (optional)"
                    value={rejectReason[u._id] || ""}
                    onChange={(e) => setRejectReason({ ...rejectReason, [u._id]: e.target.value })}
                  />
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => approveAadhaar(u._id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-bold transition shadow-sm"
                  >
                    <CheckCircle size={15} /> Approve
                  </button>
                  <button
                    onClick={() => rejectAadhaar(u._id)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition shadow-sm"
                  >
                    <XCircle size={15} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── REPORTED CONTENT TAB ── */}
        {tab === "reported" && (
          <div className="space-y-6">

            {/* Reported Users */}
            <div>
              <h2 className="font-bold text-gray-700 text-sm uppercase tracking-widest mb-3">Reported Users</h2>
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
                      <button
                        onClick={() => warnUser(u._id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition"
                      >
                        <AlertTriangle size={14} /> Warn
                      </button>
                      <button
                        onClick={() => banUser(u._id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition"
                      >
                        <Ban size={14} /> Ban
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Reported Posts */}
            <div>
              <h2 className="font-bold text-gray-700 text-sm uppercase tracking-widest mb-3">Reported Posts</h2>
              {reportedPosts.length === 0 && (
                <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center text-gray-400 text-sm">
                  No reported posts
                </div>
              )}
              {reportedPosts.map((post) => (
                <div key={post._id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          post.type==="emergency" ? "bg-red-100 text-red-600" :
                          post.type==="event"     ? "bg-amber-100 text-amber-700" :
                          post.type==="promotional" ? "bg-emerald-100 text-emerald-700" :
                          "bg-blue-100 text-blue-600"
                        }`}>{post.type}</span>
                        <span className="text-xs text-red-500 font-semibold">🚩 {post.reportCount || 1} report(s)</span>
                      </div>
                      <h3 className="font-bold text-gray-800 text-sm">{post.title}</h3>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{post.content}</p>
                      <p className="text-xs text-gray-400 mt-1">by {post.userName} · {new Date(post.createdAt).toLocaleDateString()}</p>
                    </div>
                    {post.image && <img src={post.image} className="w-16 h-16 rounded-xl object-cover shrink-0" alt="" />}
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => dismissReport(post._id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-semibold transition"
                    >
                      <CheckCircle size={14} /> Dismiss
                    </button>
                    <button
                      onClick={() => deletePost(post._id)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition"
                    >
                      <XCircle size={14} /> Delete Post
                    </button>
                    {/* Warn the post author */}
                    {post.userId && (
                      <button
                        onClick={() => warnUser(post.userId)}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition"
                      >
                        <AlertTriangle size={14} /> Warn Author
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
