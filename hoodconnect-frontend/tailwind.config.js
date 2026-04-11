
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // tailwind.config.js
  theme: {
    extend: {
      colors: {
        primary: "#7C3AED",     // purple
        primaryLight: "#A78BFA",
        background: "#F8FAFC",
        surface: "#FFFFFF",

        textPrimary: "#111827",
        textSecondary: "#6B7280",

        success: "#10B981",
        warning: "#F59E0B",
        danger: "#EF4444",
        info: "#3B82F6",
      },
    },
  },
  fontFamily: {
    sans: ["Inter", "sans-serif"],
  },
  plugins: [],
};