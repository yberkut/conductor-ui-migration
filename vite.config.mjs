// Vite configuration (replaces Create React App's react-scripts: webpack config, setupProxy.js, env handling).
// Each block below says which CRA behaviour it keeps.
import { readFileSync } from "node:fs";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8")
);

// CRA's getPublicUrlOrPath(): `homepage` in package.json (or the PUBLIC_URL variable) decides where the
// app is served from. "." / "./x" give relative asset URLs in production builds; a full URL is reduced to its path.
function getPublicUrlOrPath(isDev, homepage, envPublicUrl) {
  const stubDomain = "https://create-react-app.dev";
  const withSlash = (s) => (s.endsWith("/") ? s : s + "/");
  if (envPublicUrl) {
    const url = withSlash(envPublicUrl);
    return isDev
      ? url.startsWith(".")
        ? "/"
        : new URL(url, stubDomain).pathname
      : url;
  }
  if (homepage) {
    const url = withSlash(homepage);
    const pathname = new URL(url, stubDomain).pathname;
    return isDev
      ? url.startsWith(".")
        ? "/"
        : pathname
      : url.startsWith(".")
      ? url
      : pathname;
  }
  return "/";
}

export default defineConfig(({ command, mode }) => {
  const root = process.cwd();
  const isDev = command === "serve";
  // Every variable from .env files and the process environment (CRA exposed the same set to setupProxy.js and to the dev server).
  const env = loadEnv(mode, root, "");
  const publicUrlOrPath = getPublicUrlOrPath(
    isDev,
    packageJson.homepage,
    env.PUBLIC_URL
  );

  const config = {
    plugins: [react()],

    // CRA: `homepage` / PUBLIC_URL. Here "base". The app's own router basename still comes from
    // getBasename() in src/utils/helpers.js, which reads package.json `homepage` as before.
    base: publicUrlOrPath,

    // CRA exposed `process.env.REACT_APP_*`, `NODE_ENV` and `PUBLIC_URL` to the code through DefinePlugin
    // (`process.env` was an object; an unset variable was `undefined`). Same here: the source keeps reading
    // `process.env.REACT_APP_*` and `process.env.PUBLIC_URL` unchanged. New code may use `import.meta.env.VITE_*` instead.
    // Not applied under Vitest, which provides its own `process.env`.
    define:
      mode === "test"
        ? {}
        : {
            "process.env": {
              NODE_ENV: isDev ? "development" : "production",
              PUBLIC_URL: publicUrlOrPath.replace(/\/$/, ""),
              ...loadEnv(mode, root, "REACT_APP_"),
            },
          },

    // CRA: dev server on PORT (.env has PORT=5000; CRA's own default is 3000), listening on HOST (default 0.0.0.0).
    server: {
      host: env.HOST || "0.0.0.0",
      port: Number(env.PORT) || 3000,
      // CRA: src/setupProxy.js sent /api to WF_SERVER (default http://localhost:8080) with changeOrigin and no path rewrite.
      proxy: {
        "/api": {
          target: env.WF_SERVER || "http://localhost:8080",
          changeOrigin: true,
        },
      },
    },

    build: {
      // CRA wrote to ./build (the "preview", "serve-build" scripts and the Playwright configs expect it).
      outDir: "build",
      // CRA emitted source maps unless GENERATE_SOURCEMAP=false.
      sourcemap: env.GENERATE_SOURCEMAP !== "false",
    },

    // Unit tests (none exist in the upstream repository, so the run must pass with no test files).
    // Playwright specs (e2e/, characterization/, *.test.pw.tsx) must never be picked up by Vitest.
    test: {
      environment: "jsdom",
      include: ["src/**/*.{test,spec}.{js,jsx,ts,tsx}"],
      passWithNoTests: true,
    },
  };

  return config;
});
