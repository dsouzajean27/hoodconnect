import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
    try {
      const res = await axios.post(
        "https://hoodconnect-backend.onrender.com/login",
        { email, password }
      );

      if (res.data.user) {
        const userData = {
          id: res.data.user.id,
          name: res.data.user.name,
          // FIX: area now reliably comes from DB (user schema has the field)
          area: res.data.user.area?.toLowerCase().replace(/\s+/g, "-") || "unknown",
        };

        localStorage.setItem("user", JSON.stringify(userData));
        // FIX: store JWT token so protected routes can send it as Authorization header
        localStorage.setItem("token", res.data.token);

        alert("Welcome back!");
        navigate("/dashboard");
      }
    } catch (error) {
      alert(error.response?.data?.message || "Login Failed");
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-[#f8fafc] via-[#eef2ff] to-[#ede9fe]">
      <div className="bg-white shadow-xl border border-gray-100 p-8 rounded-[2.5rem] shadow-2xl w-96 border">
        <h2 className="text-4xl font-black text-center mb-2 text-black tracking-tighter">
          HOODCONNECT
        </h2>
        <p className="text-center text-gray-200 mb-8 text-sm font-medium">
          Your neighborhood, synchronized.
        </p>

        <div className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            className="w-full bg-white shadow-xl border border-gray-100 border border-white/10 p-4 rounded-2xl  outline-none focus:border-blue-400 transition-all"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full bg-white shadow-xl border border-gray-100 border border-white/10 p-4 rounded-2xl outline-none focus:border-blue-400 transition-all"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            onClick={handleLogin}
            className="w-full bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-semibold shadow-md hover:shadow-lg hover:scale-[1.02] transition text-white hover:bg-purple-700 font-black p-4 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-lg"
          >
            Login
          </button>
        </div>

        <p className="text-center text-sm text-grey-500 mt-6">
          New here?{" "}
          <span
            onClick={() => navigate("/register")}
            className="font-bold cursor-pointer underline"
          >
            Create Account
          </span>
        </p>
      </div>
    </div>
  );
}
