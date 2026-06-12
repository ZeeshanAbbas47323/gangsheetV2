import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        surface: {
          0: "#0d0f12",
          1: "#15181d",
          2: "#1d2127",
          3: "#262b33",
        },
        accent: {
          DEFAULT: "#4f8ef7",
          hover: "#3b7df0",
        },
      },
    },
  },
  plugins: [],
};
export default config;
