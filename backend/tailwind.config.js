/** Tailwind CSS + DaisyUI configuration for MCH VoiceCare */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./templates/**/*.{html,js}",
    "./apps/**/*.{html,py,js}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          teal: "#1E9AA8",
          green: "#2D9D78",
          red: "#DC2626",
          amber: "#F59E0B",
        },
      },
    },
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: [
      {
        mchvoicecare: {
          "primary": "#1E9AA8",
          "secondary": "#2D9D78",
          "accent": "#0D7C66",
          "neutral": "#1F2937",
          "base-100": "#FFFFFF",
          "base-200": "#F3F4F6",
          "base-300": "#E5E7EB",
          "info": "#3B82F6",
          "success": "#16A34A",
          "warning": "#F59E0B",
          "error": "#DC2626",
        },
      },
      "dark",
    ],
    darkTheme: "dark",
  },
};
