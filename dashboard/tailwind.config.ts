import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Custom badge palette aligned with the iOS SDK status colors so the
        // dashboard feels familiar to QA testers used to the in-app panel.
        status: {
          ok: "#22c55e",
          warn: "#eab308",
          error: "#ef4444",
          info: "#0ea5e9",
        },
      },
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
