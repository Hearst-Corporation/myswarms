import { redirect } from "next/navigation";

// Legacy route — redirect to the new canonical URL.
export default function AutomotiveRedirectPage() {
  redirect("/automobile");
}
