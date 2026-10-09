export function columnCount(viewport: number, container: number) {
  const target = viewport >= 1440 ? 4 : viewport >= 1024 ? 3 : 2;
  return Math.max(1, Math.min(target, Math.floor((container + 16) / 276)));
}
export function placeCards(heights: number[], columns: number, gap = 16) {
  const bottoms = Array.from({ length: columns }, () => 0);
  const positions = heights.map((height) => {
    const top = Math.min(...bottoms);
    const column = bottoms.indexOf(top);
    bottoms[column] = top + height + gap;
    return { column, top };
  });
  return {
    positions,
    height: Math.max(0, ...bottoms) - (heights.length ? gap : 0),
  };
}
