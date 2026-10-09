"use client";
import { useLayoutEffect, useRef } from "react";
import { columnCount, placeCards } from "@/lib/masonry";
export function MasonryFeed({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    let frame = 0;
    function layout() {
      if (!container) return;
      const width = container.clientWidth;
      const columns = columnCount(window.innerWidth, width);
      const cardWidth = (width - (columns - 1) * 16) / columns;
      const cards = Array.from(container.children) as HTMLElement[];
      cards.forEach((card) => {
        card.style.width = `${cardWidth}px`;
      });
      const { positions, height } = placeCards(
        cards.map((card) => card.getBoundingClientRect().height),
        columns,
      );
      cards.forEach((card, index) => {
        const position = positions[index];
        card.style.transform = `translate(${position.column * (cardWidth + 16)}px, ${position.top}px)`;
      });
      container.dataset.ready = "true";
      container.style.height = `${height}px`;
    }
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(layout);
    };
    layout();
    const observer = new ResizeObserver(schedule);
    observer.observe(container);
    Array.from(container.children).forEach((card) => observer.observe(card));
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(frame);
    };
  }, [children]);
  return (
    <div ref={ref} className="masonry">
      {children}
    </div>
  );
}
