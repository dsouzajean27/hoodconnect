import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
  try {
    const res = await axios.post("http://localhost:8000/login", {
      email,
      password,
    });

    console.log("LOGIN RESPONSE:", res.data);

    // ✅ IMPORTANT CHECK (adjust based on backend)
    if (res.data.message === "Login success") {
  alert("Login Successful");

  // 🔥 SAVE USER
  localStorage.setItem("user", JSON.stringify(res.data.user));

  navigate("/dashboard");
}
    else {
      alert("Invalid credentials");
    }

  } catch (error) {
    console.log("LOGIN ERROR:", error.response);
    alert(error.response?.data?.message || "Login Failed");
  }
};


  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-r from-blue-500 to-purple-600">
    <div className="bg-white p-8 rounded-2xl shadow-2xl w-96">
      
      <h2 className="text-4xl font-extrabold text-center mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 tracking-widest">
      HOODCONNECT</h2>


      <p className="text-center text-gray-500 mb-6">
        Connect with your neighborhood
      </p>

      <input
        type="email"
        placeholder="Email"
        className="w-full border p-3 mb-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <input
        type="password"
        placeholder="Password"
        className="w-full border p-3 mb-4 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button
        onClick={handleLogin}
        className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition duration-200"
      >
        Login
      </button>

      <p className="text-center text-sm text-gray-500 mt-4">
        Don’t have an account?{" "}
        <span onClick={() => navigate("/register")}
         className="text-blue-600 cursor-pointer hover:underline">
         Register
        </span>
      </p>

    </div>
  </div>
);
}