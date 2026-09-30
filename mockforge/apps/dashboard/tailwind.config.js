/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "system-ui", "-apple-system", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      colors: {
        signal: {
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c"
        },
        obsidian: {
          950: "#07080a",
          900: "#0e1015",
          850: "#13161d",
          800: "#191d26",
          700: "#222733",
          600: "#2f3647"
        },
        phosphor: {
          green: "#00e599",
          cyan: "#00d4ff",
          amber: "#ffb000",
          crimson: "#ff2e63",
          violet: "#9d4edd"
        }
      }
    }
  },
  plugins: []
};
