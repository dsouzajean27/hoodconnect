import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, ShieldCheck, AlertCircle } from "lucide-react";

export default function Register() {
  const [formData, setFormData] = useState({ name: "", email: "", password: "", location: "" });
  const [aadhaar, setAadhaar]   = useState("");        // raw input, 12 digits
  const [aadhaarError, setAadhaarError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();

  // ── Aadhaar input handler ─────────────────────────────────────────────────
  // Only keeps digits, caps at 12, shows masked display
  const handleAadhaar = (e) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 12);
    setAadhaar(digits);
    if (digits.length > 0 && digits.length < 12) {
      setAadhaarError("Aadhaar must be exactly 12 digits");
    } else {
      setAadhaarError("");
    }
  };

  // Masked display: XXXX XXXX 1234
  const maskedDisplay = () => {
    if (!aadhaar) return "";
    const padded = aadhaar.padEnd(12, "_");
    return `XXXX XXXX ${padded.slice(8, 12)}`;
  };

  const handleRegister = async () => {
    if (aadhaar && aadhaar.length !== 12) {
      setAadhaarError("Aadhaar must be exactly 12 digits");
      return;
    }

    setLoading(true);
    try {
      const cleanArea = formData.location.toLowerCase().trim().replace(/\s+/g, "-");

      await axios.post("https://hoodconnect-backend.onrender.com/register", {
        ...formData,
        area: cleanArea,
        // Only send last 4 digits — never the full Aadhaar number
        aadhaarLast4: aadhaar ? aadhaar.slice(-4) : null,
      });

      alert("Account created! Your Aadhaar is under review. You'll get a Verified badge once approved.");
      navigate("/");
    } catch (error) {
      alert(error.response?.data?.error || "Registration Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 to-purple-900 px-4 py-8">
      <div className="bg-white/10 backdrop-blur-lg p-8 rounded-[2.5rem] shadow-2xl w-full max-w-md border border-white/20">

        <h2 className="text-4xl font-black text-center mb-1 text-white tracking-tighter">
          JOIN THE HOOD
        </h2>
        <p className="text-center text-purple-200 mb-7 text-sm">
          Secure neighbourhood networking
        </p>

        <div className="space-y-3">
          {/* Name */}
          <input
            type="text"
            placeholder="Full Name"
            className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl text-white placeholder-white/40 outline-none focus:border-purple-400 transition"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />

          {/* Email */}
          <input
            type="email"
            placeholder="Email"
            className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl text-white placeholder-white/40 outline-none focus:border-purple-400 transition"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />

          {/* Password */}
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl text-white placeholder-white/40 outline-none focus:border-purple-400 transition pr-12"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {/* Location / Area */}
          <input
            type="text"
            placeholder="Your area (e.g. Andheri)"
            className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl text-white placeholder-white/40 outline-none focus:border-purple-400 transition"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
          />

          {/* ── Aadhaar section ─────────────────────────────────────────── */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck size={16} className="text-purple-300" />
              <span className="text-sm font-semibold text-white">Aadhaar Verification</span>
              <span className="ml-auto text-[10px] bg-purple-500/40 text-purple-200 px-2 py-0.5 rounded-full">Optional</span>
            </div>

            <p className="text-xs text-white/40 mb-3 leading-relaxed">
              Adding your Aadhaar number helps us verify your identity and prevent fake accounts.
              We only store the <span className="text-white/70 font-semibold">last 4 digits</span> — your full number is never saved.
            </p>

            <input
              type="tel"
              inputMode="numeric"
              placeholder="Enter 12-digit Aadhaar number"
              className="w-full bg-white/5 border border-white/10 p-3 rounded-xl text-white placeholder-white/30 outline-none focus:border-purple-400 transition text-sm tracking-widest"
              value={aadhaar}
              onChange={handleAadhaar}
              maxLength={12}
            />

            {/* Live masked preview */}
            {aadhaar.length > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-white/40">Stored as:</span>
                <span className="text-xs font-mono font-bold text-purple-300 tracking-widest">
                  {maskedDisplay()}
                </span>
              </div>
            )}

            {aadhaarError && (
              <div className="mt-2 flex items-center gap-1.5 text-red-400 text-xs">
                <AlertCircle size={12} />
                {aadhaarError}
              </div>
            )}

            {/* What happens next */}
            {aadhaar.length === 12 && (
              <div className="mt-3 bg-purple-500/20 border border-purple-400/30 rounded-xl p-3 text-xs text-purple-200 leading-relaxed">
                ✅ Your Aadhaar will be reviewed by our admins. Once approved, your profile will show a <strong>🛡️ ID Verified</strong> badge.
              </div>
            )}
          </div>

          {/* Submit */}
          <button
            onClick={handleRegister}
            disabled={loading || !!aadhaarError}
            className="w-full bg-purple-500 hover:bg-purple-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black p-4 rounded-2xl transition shadow-lg mt-2"
          >
            {loading ? "Creating account..." : "Register Now"}
          </button>
        </div>

        <p className="text-center text-sm text-blue-100 mt-6">
          Already have an account?{" "}
          <span onClick={() => navigate("/")} className="font-bold cursor-pointer underline">
            Login
          </span>
        </p>
      </div>
    </div>
  );
}
