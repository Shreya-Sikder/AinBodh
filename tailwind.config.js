/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#1a3255",
        surface: "#f4f6f9",
        border: "#e2e8f0",
        muted: "#64748b",
        teal: "#0d7da0",
        tealSoft: "#e0f5fb",
      },
      boxShadow: {
        soft: "0 8px 28px rgba(15, 35, 60, 0.08)",
      },
    },
  },
  plugins: [],
};
