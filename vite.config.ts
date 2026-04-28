import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { mockNetlifyData } from "./dev/mockNetlifyData";

export default defineConfig({
  plugins: [react(), tailwindcss(), mockNetlifyData()],
});
