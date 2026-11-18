import { Button } from "@/components/ui";
import { StatusPage } from "@/components/layout/StatusPage";

export const metadata = { title: "Page not found - Flowline" };

export default function NotFound() {
  return (
    <StatusPage
      code="404"
      title="This page doesn't exist"
      description="The link may be wrong, or the page was moved."
      actions={
        <>
          <Button variant="secondary" href="/">Home</Button>
          <Button href="/dashboard">Go to your Zaps</Button>
        </>
      }
    />
  );
}
