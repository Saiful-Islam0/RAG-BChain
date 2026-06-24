/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#0D47A1",
        "ice-blue": "#E3F2FD",
        "ice-blue-dark": "#BBDEFB",
        "frosted-white": "rgba(255, 255, 255, 0.7)",
        "neon-cyan": "#00F5FF",
        success: "#22c55e",
        danger: "#ef4444",
        warning: "#f59e0b",
        "background-light": "#F0F7FF",
        "background-dark": "#0C1A31",
      },
      fontFamily: {
        display: ["Montserrat", "sans-serif"],
        bengali: ["Hind Siliguri", "sans-serif"],
      },
      borderRadius: {
        xl: "24px",
        "2xl": "32px",
      },
    },
  },
  plugins: [],
};
