import { Navigate } from "react-router-dom";

// FIX: prevents unauthenticated users from accessing /dashboard directly.
// Redirects to login if no user is found in localStorage.
export default function ProtectedRoute({ children }) {
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null;
    }
  })();

  return user ? children : <Navigate to="/" replace />;
}
