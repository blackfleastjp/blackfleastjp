import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: { fontFamily: { sans: ["DM Sans", "sans-serif"], display: ["Manrope", "sans-serif"] } },
  },
  plugins: [forms, typography],
};
