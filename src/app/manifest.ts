import type { MetadataRoute } from "next";
import enMessages from "../../messages/en.json";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: enMessages.app.title,
    short_name: "Alumex",
    description: enMessages.app.description,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f3f6fa",
    theme_color: "#0b5cad",
    icons: [
      {
        src: "/icons/alumex-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/alumex-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
