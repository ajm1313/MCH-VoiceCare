/**
 * Tailwind CSS + DaisyUI configuration for MCH VoiceCare.
 *
 * UX-001: one documented design system across web and mobile. The tokens below
 * mirror mobile/src/theme/colors.ts and mobile/src/theme/tokens.ts — keep the
 * two in sync when either changes.
 *
 * UX-002: urgency colours must always be paired with a text label and an icon.
 * See the `.urgency-*` component classes in static/src/input.css.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./templates/**/*.{html,js}",
    "./apps/**/*.{html,py,js}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette — mirrors `brand` / `brandScale` in the mobile theme.
        brand: {
          navy: "#0A1B33",
          teal: "#1E9AA8",
          green: "#54B45F",
          coral: "#F0806C",
          red: "#DC2626",
          amber: "#F59E0B",
        },
        navy: {
          900: "#050E1C",
          800: "#0A1B33",
          700: "#102845",
          600: "#17375C",
        },
        teal: {
          50: "#F1FAFB",
          100: "#E2F4F6",
          300: "#8FD6DE",
          400: "#41B3BF",
          500: "#1E9AA8",
          600: "#1A8792",
          700: "#14707B",
        },
        // Urgency palette — identical hex values to the mobile `urgency` map so
        // a RED on the handset is the same RED on the dashboard.
        urgency: {
          red: "#DC2626",
          orange: "#EA580C",
          amber: "#D97706",
          green: "#16A34A",
          grey: "#6B7280",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      // Type scale — mirrors `type` in mobile/src/theme/tokens.ts.
      fontSize: {
        overline: ["0.6875rem", {lineHeight: "0.875rem", letterSpacing: "0.05em", fontWeight: "700"}],
        caption: ["0.75rem", {lineHeight: "1rem"}],
        small: ["0.8125rem", {lineHeight: "1.125rem"}],
        body: ["0.9375rem", {lineHeight: "1.3125rem"}],
        metric: ["1.75rem", {lineHeight: "2.125rem", fontWeight: "800"}],
      },
      borderRadius: {
        // Mirrors `radius` in the mobile theme.
        xs: "6px",
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
        "2xl": "28px",
      },
      // Navy-tinted layered shadows — mirrors `elevation` in the mobile theme.
      boxShadow: {
        xs: "0 1px 2px 0 rgba(10, 27, 51, 0.04)",
        soft: "0 2px 6px -1px rgba(10, 27, 51, 0.05), 0 1px 2px 0 rgba(10, 27, 51, 0.03)",
        card: "0 4px 14px -2px rgba(10, 27, 51, 0.08), 0 2px 4px -2px rgba(10, 27, 51, 0.04)",
        raised: "0 8px 24px -4px rgba(10, 27, 51, 0.12), 0 4px 8px -4px rgba(10, 27, 51, 0.06)",
        float: "0 12px 32px -6px rgba(10, 27, 51, 0.16), 0 6px 12px -6px rgba(10, 27, 51, 0.08)",
        ring: "0 0 0 3px rgba(30, 154, 168, 0.18)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "200ms",
        slow: "320ms",
      },
      keyframes: {
        "fade-in-up": {
          from: {opacity: "0", transform: "translateY(8px)"},
          to: {opacity: "1", transform: "translateY(0)"},
        },
        "fade-in": {
          from: {opacity: "0"},
          to: {opacity: "1"},
        },
        shimmer: {
          "100%": {transform: "translateX(100%)"},
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 320ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 240ms ease-out both",
      },
    },
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: [
      {
        // Light theme — mirrors `lightColors` in the mobile theme.
        mchvoicecare: {
          "primary": "#1E9AA8",
          "primary-content": "#FFFFFF",
          "secondary": "#54B45F",
          "secondary-content": "#08210C",
          "accent": "#0D7C66",
          "accent-content": "#FFFFFF",
          "neutral": "#0A1B33",
          "neutral-content": "#F1F5F9",
          "base-100": "#FFFFFF",
          "base-200": "#F6F9FB",
          "base-300": "#E2E8F0",
          "base-content": "#0F172A",
          "info": "#2563EB",
          "info-content": "#FFFFFF",
          "success": "#16A34A",
          "success-content": "#FFFFFF",
          "warning": "#D97706",
          "warning-content": "#FFFFFF",
          "error": "#DC2626",
          "error-content": "#FFFFFF",
          "--rounded-box": "16px",
          "--rounded-btn": "12px",
          "--rounded-badge": "999px",
          "--animation-btn": "0.2s",
          "--animation-input": "0.2s",
          "--btn-focus-scale": "0.985",
          "--border-btn": "1px",
          "--tab-radius": "10px",
        },
      },
      {
        // Dark theme — mirrors `darkColors` in the mobile theme.
        dark: {
          "primary": "#1E9AA8",
          "primary-content": "#FFFFFF",
          "secondary": "#54B45F",
          "secondary-content": "#08210C",
          "accent": "#41B3BF",
          "accent-content": "#04121F",
          "neutral": "#10233F",
          "neutral-content": "#F1F5F9",
          "base-100": "#10233F",
          "base-200": "#0A1B33",
          "base-300": "#1E3355",
          "base-content": "#F1F5F9",
          "info": "#60A5FA",
          "info-content": "#04121F",
          "success": "#4ADE80",
          "success-content": "#04121F",
          "warning": "#FBBF24",
          "warning-content": "#04121F",
          "error": "#F87171",
          "error-content": "#04121F",
          "--rounded-box": "16px",
          "--rounded-btn": "12px",
          "--rounded-badge": "999px",
          "--animation-btn": "0.2s",
          "--animation-input": "0.2s",
          "--btn-focus-scale": "0.985",
          "--border-btn": "1px",
          "--tab-radius": "10px",
        },
      },
    ],
    darkTheme: "dark",
  },
};
