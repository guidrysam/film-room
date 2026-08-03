import { Suspense } from "react";
import MacLinkClient from "./MacLinkClient";

export default function MacLinkPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-md items-center justify-center px-4 text-sm text-zinc-400">
          Loading…
        </main>
      }
    >
      <MacLinkClient />
    </Suspense>
  );
}
