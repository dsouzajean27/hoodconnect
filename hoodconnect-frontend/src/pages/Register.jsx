import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export default function Register() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    location: "",
  });
  const navigate = useNavigate();

  const handleRegister = async () => {
    try {
      // Normalize area before sending so it's consistent with what login returns
      const cleanArea = formData.location.toLowerCase().trim().replace(/\s+/g, "-");

      await axios.post("https://hoodconnect-backend.onrender.com/register", {
        ...formData,
        area: cleanArea,
      });

      alert("Account created! Please login.");
      navigate("/");
    } catch (error) {
      alert(error.response?.data?.error || "Registration Failed");
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-[#f8fafc]">
      <div className="bg-white border border-gray-200 shadow-lg p-8 rounded-[2.5rem] shadow-2xl w-96">
        <h2 className="text-4xl font-black text-center mb-2 text-white tracking-tighter">
          JOIN THE HOOD
        </h2>
        <p className="text-center text-purple-200 mb-8 text-sm">
          Secure neighborhood networking
        </p>

        <div className="space-y-3">
          {["name", "email", "password", "location"].map((field) => (
            <input
              key={field}
              type={field === "password" ? "password" : "text"}
              placeholder={
                field === "location"
                  ? "Your area (e.g. Andheri)"
                  : field.charAt(0).toUpperCase() + field.slice(1)
              }
              className="w-full bg-gray-100 text-black border border-white/10 p-4 rounded-2xl  outline-none focus:border-purple-400 transition-all"
              value={formData[field]}
              onChange={(e) =>
                setFormData({ ...formData, [field]: e.target.value })
              }
            />
          ))}
          <button
            onClick={handleRegister}
            className="w-full bg-purple-600 text-white font-black p-4 rounded-2xl hover:bg-purple-700 transition-all shadow-lg mt-2"
          >
            Register Now
          </button>
        </div>
      </div>
    </div>
  );
}
