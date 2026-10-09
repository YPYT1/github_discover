"use client";
import { useEffect, useRef } from "react";

export function Exposure({
  id,
  active,
  onSeen,
  children,
}: {
  id: number;
  active: boolean;
  onSeen: (id: number) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let visible = false,
      recorded = false;
    const cancel = () => {
      clearTimeout(timer);
      timer = undefined;
    };
    const schedule = () => {
      cancel();
      if (visible && !document.hidden && !recorded)
        timer = setTimeout(() => {
          if (!document.hidden && visible) {
            recorded = true;
            onSeen(id);
          }
        }, 1000);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0].intersectionRatio >= 0.5;
        schedule();
      },
      { threshold: [0, 0.5] },
    );
    observer.observe(ref.current);
    document.addEventListener("visibilitychange", schedule);
    return () => {
      cancel();
      observer.disconnect();
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [id, active, onSeen]);
  return (
    <div ref={ref} className="masonry-item" data-repository-id={id}>
      {children}
    </div>
  );
}
