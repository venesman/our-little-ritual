/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // The reminder sender (supabase/functions) runs on Deno and is tested with `deno test`.
  test: { exclude: ["node_modules/**", "dist/**", "supabase/functions/**"] },
});
