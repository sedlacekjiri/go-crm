import type { MetadataRoute } from "next";

// Lets the CRM be added to the phone home screen and open full-screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Go CRM",
    short_name: "Go CRM",
    description: "Partner CRM – Go Car Rentals & Go Campers, Reykjavík",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f6f4",
    theme_color: "#ffffff",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
