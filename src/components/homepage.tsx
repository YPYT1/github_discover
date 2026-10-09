"use client";
import { useSyncExternalStore } from "react";
import { Discover } from "@/components/feed/discover";
import { FeedSkeleton } from "@/components/feed/feed-skeleton";

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function Homepage() {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  if (!ready)
    return (
      <main className="page-container py-10" aria-busy="true">
        <h1 className="mb-6 text-3xl font-semibold">Discover repositories</h1>
        <FeedSkeleton />
        <noscript>
          Enable JavaScript to search repositories and sign in.
        </noscript>
      </main>
    );
  // Read only after hydration, before Discover mounts and writes URL state.
  return <Discover initialQuery={window.location.search.slice(1)} />;
}
