import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";
import { ArrowLeft, Send, MessageCircle } from "lucide-react";

const BASE_URL = "https://hoodconnect-backend.onrender.com";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Badge display map (same as Profile)
const BADGE_META = {
  verified_citizen:   { emoji: "🛡️", label: "Verified Citizen" },
  first_responder:    { emoji: "🚨", label: "First Responder" },
  active_contributor: { emoji: "💬", label: "Active Contributor" },
  top_of_area:        { emoji: "🏆", label: "Top of Area" },
  truth_seeker:       { emoji: "🔍", label: "Truth Seeker" },
  old_timer:          { emoji: "📅", label: "Old Timer" },
  newcomer:           { emoji: "✨", label: "Newcomer" },
};

export default function Chat() {
  const { otherId } = useParams();   // present when coming from profile page
  const navigate    = useNavigate();

  const [user] = useState(() => {
    try { return JSON.parse(localStorage.getItem("user")); } catch { return null; }
  });

  const [conversations, setConversations] = useState([]);
  const [activeChat, setActiveChat]       = useState(null);  // { userId, name, badges }
  const [messages, setMessages]           = useState([]);
  const [input, setInput]                 = useState("");
  const [loading, setLoading]             = useState(false);

  const socketRef  = useRef(null);
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);

  // ── Fetch conversation list ───────────────────────────────────────────────
  const fetchConversations = async () => {
    if (!user?.id) return;
    try {
      const res = await axios.get(`${BASE_URL}/conversations/${user.id}`, { headers: authHeaders() });
      setConversations(res.data);
    } catch (err) { console.log("fetchConversations:", err); }
  };

  // ── Fetch messages for active chat ────────────────────────────────────────
  const fetchMessages = async (othId) => {
    setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/messages/${user.id}/${othId}`, { headers: authHeaders() });
      setMessages(res.data);
    } catch (err) { console.log("fetchMessages:", err); }
    finally { setLoading(false); }
  };

  // ── Socket setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    socketRef.current = io(BASE_URL, { transports: ["websocket"] });
    if (user?.id) socketRef.current.emit("joinUserRoom", { userId: user.id });

    socketRef.current.on("newMessage", (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    socketRef.current.on("newDM", () => {
      fetchConversations(); // refresh unread count
    });

    return () => socketRef.current.disconnect();
  }, []);

  // ── Join conversation socket room when activeChat changes ─────────────────
  useEffect(() => {
    if (!activeChat || !socketRef.current) return;
    socketRef.current.emit("joinConversation", { userId: user.id, otherId: activeChat.userId });
    fetchMessages(activeChat.userId);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [activeChat?.userId]);

  // ── Scroll to bottom when messages update ─────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── If navigated with an otherId param, open that chat directly ───────────
  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (otherId && conversations.length > 0) {
      const existing = conversations.find(c => c.userId.toString() === otherId);
      if (existing) {
        setActiveChat({ userId: existing.userId, name: existing.name, badges: existing.badges });
      } else {
        // New conversation — fetch user info
        axios.get(`${BASE_URL}/profile/${otherId}`, { headers: authHeaders() })
          .then(res => setActiveChat({ userId: otherId, name: res.data.user.name, badges: res.data.user.badges || [] }))
          .catch(() => {});
      }
    }
  }, [otherId, conversations]);

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!input.trim() || !activeChat) return;
    const text = input.trim();
    setInput("");
    try {
      await axios.post(`${BASE_URL}/messages`, { receiverId: activeChat.userId, text }, { headers: authHeaders() });
      fetchConversations();
    } catch (err) { console.log("sendMessage:", err); }
  };

  if (!user) { navigate("/"); return null; }

  return (
    <div className="min-h-screen bg-[#f0f2f8] flex flex-col">

      {/* Header */}
      <header className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/dashboard")} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition">
          <ArrowLeft size={18} />
        </button>
        <MessageCircle size={20} className="text-purple-600" />
        <span className="font-black text-gray-800 text-lg tracking-tight">Messages</span>
        {activeChat && (
          <>
            <span className="text-gray-300 mx-1">·</span>
            <span className="font-semibold text-gray-700 text-sm truncate">{activeChat.name}</span>
          </>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Conversation list ── */}
        <aside className={`bg-white border-r border-gray-200 flex flex-col shrink-0 ${activeChat ? "hidden md:flex" : "flex"} w-full md:w-72`}>
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Conversations</p>
          </div>

          {conversations.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-400 text-sm">
              <MessageCircle size={40} className="mb-3 opacity-30" />
              <p className="font-medium">No messages yet</p>
              <p className="text-xs mt-1">Start a chat by visiting someone's profile</p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {conversations.map((conv) => (
              <button
                key={conv.userId}
                onClick={() => setActiveChat({ userId: conv.userId, name: conv.name, badges: conv.badges })}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 text-left transition ${activeChat?.userId === conv.userId ? "bg-purple-50 border-l-2 border-l-purple-600" : ""}`}
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {conv.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-800 text-sm truncate">{conv.name}</span>
                    {conv.unread > 0 && (
                      <span className="ml-2 shrink-0 w-5 h-5 bg-purple-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {conv.unread}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {conv.lastMessage?.text || ""}
                  </p>
                  {/* Mini badges */}
                  {conv.badges?.length > 0 && (
                    <div className="flex gap-1 mt-0.5">
                      {conv.badges.slice(0, 3).map(b => (
                        <span key={b} title={BADGE_META[b]?.label} className="text-[11px]">{BADGE_META[b]?.emoji}</span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {/* ── Chat window ── */}
        {activeChat ? (
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Chat header (mobile back) */}
            <div className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
              <button onClick={() => setActiveChat(null)} className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500 transition">
                <ArrowLeft size={16} />
              </button>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white font-bold text-sm">
                {activeChat.name[0].toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-800">{activeChat.name}</p>
                {activeChat.badges?.length > 0 && (
                  <div className="flex gap-1">
                    {activeChat.badges.slice(0, 3).map(b => <span key={b} className="text-[11px]">{BADGE_META[b]?.emoji}</span>)}
                  </div>
                )}
              </div>
              <button
                onClick={() => navigate(`/profile/${activeChat.userId}`)}
                className="ml-auto text-xs text-purple-600 hover:text-purple-800 font-medium"
              >
                View Profile
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {loading && (
                <div className="text-center text-gray-400 text-sm py-8">Loading messages...</div>
              )}
              {!loading && messages.length === 0 && (
                <div className="text-center text-gray-400 text-sm py-12">
                  <MessageCircle size={32} className="mx-auto mb-2 opacity-30" />
                  Send your first message to {activeChat.name}!
                </div>
              )}
              {messages.map((msg, i) => {
                const isMe = msg.senderId === user.id || msg.senderId?.toString() === user.id;
                return (
                  <div key={msg._id || i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                    {!isMe && (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-blue-400 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mr-2 mt-1">
                        {activeChat.name[0].toUpperCase()}
                      </div>
                    )}
                    <div className={`max-w-[70%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                      <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        isMe
                          ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-br-sm"
                          : "bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm"
                      }`}>
                        {msg.text}
                      </div>
                      <span className="text-[10px] text-gray-400 mt-1 px-1">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <div className="bg-white border-t border-gray-200 px-4 py-3 flex gap-2">
              <input
                ref={inputRef}
                className="flex-1 px-4 py-2.5 rounded-2xl bg-gray-100 border border-gray-200 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:bg-white transition"
                placeholder={`Message ${activeChat.name}...`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim()}
                className="w-10 h-10 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 flex items-center justify-center text-white disabled:opacity-40 hover:from-blue-700 hover:to-purple-700 transition shadow"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        ) : (
          /* Desktop empty state */
          <div className="hidden md:flex flex-1 items-center justify-center text-gray-400 flex-col gap-3">
            <MessageCircle size={48} className="opacity-20" />
            <p className="font-medium text-sm">Select a conversation</p>
            <p className="text-xs">or visit a profile to start a new chat</p>
          </div>
        )}
      </div>
    </div>
  );
}
