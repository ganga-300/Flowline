import { notFound } from "next/navigation";
import { DesignGallery } from "./DesignGallery";

export const metadata = { title: "Flowline - design preview" };

// Development-only preview of the design system. Not available in production builds.
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignGallery />;
}
