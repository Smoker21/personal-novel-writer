import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Low-saturation deep green accent (per brief §4)
        accent: {
          DEFAULT: "#2d5a4a",
          hover: "#244a3d",
          light: "#3d6e5c",
          subtle: "#e8f0ec",
          dark: "#1e3d33",
        },
        // Warm-tinted dark (per brief: 不要純黑)
        ink: {
          50: "#f7f6f3",
          100: "#ecebe7",
          200: "#d8d6cf",
          300: "#bdbab1",
          400: "#8e8b81",
          500: "#65635c",
          600: "#4a4944",
          700: "#363530",
          800: "#26251f",
          900: "#1a1916",
        },
        // Status colors
        status: {
          dirty: "#3b82f6", // 藍 編輯中
          saved: "#10b981", // 綠 已儲存
          warn: "#f59e0b", // 橘 警示
          error: "#ef4444", // 紅
        },
      },
      fontFamily: {
        sans: ['"Noto Sans TC"', "Inter", "system-ui", "sans-serif"],
        serif: ['"Noto Serif TC"', '"Source Serif 4"', "Georgia", "serif"],
      },
      maxWidth: {
        editor: "720px",
        reading: "720px",
      },
      borderRadius: {
        btn: "8px",
        card: "8px",
        modal: "12px",
      },
      transitionDuration: {
        "200": "200ms",
        "250": "250ms",
      },
    },
  },
  plugins: [],
};

export default config;
