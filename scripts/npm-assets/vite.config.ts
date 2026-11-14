import { defineConfig } from "vite";
import mkcert from "vite-plugin-mkcert";

export default defineConfig({
    build: {
        target: "es2022",
        lib: {
            entry: "esm/mod.js",
            formats: ["es"],
            fileName: "mod",
        },
    },
    plugins: [
        mkcert(),
    ],
    server: {
        port: 3489,
        cors: true,
    },
});
0;
