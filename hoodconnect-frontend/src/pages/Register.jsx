import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [location, setLocation] = useState("");
  const navigate = useNavigate();

  const handleRegister = async () => {
    try {
      const res = await axios.post("http://127.0.0.1:8000/register", {
        name,
        email,
        password,
        location,
      });

      alert("Registration Successful");
      navigate("/");
      console.log(res.data);
    } catch (error) {
      console.log(error.response);
      alert(error.response?.data?.message || "Registration Failed");
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-r from-purple-500 to-blue-600">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-96">
        
        <h2 className="text-4xl font-extrabold text-center mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 tracking-widest">
          HOODCONNECT
        </h2>

        <p className="text-center text-gray-500 mb-6 text-sm">
          Create your account
        </p>

        <input
          type="text"
          placeholder="Name"
          className="w-full border p-3 mb-3 rounded-lg"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <input
          type="email"
          placeholder="Email"
          className="w-full border p-3 mb-3 rounded-lg"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full border p-3 mb-3 rounded-lg"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <input
          type="text"
          placeholder="Location"
          className="w-full border p-3 mb-4 rounded-lg"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />

        <button
          onClick={handleRegister}
          className="w-full bg-purple-600 text-white p-3 rounded-lg hover:bg-purple-700"
        >
          Register
        </button>

      </div>
    </div>
  );
}