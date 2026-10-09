import type { ImgHTMLAttributes } from "react";
export default function Image(props: ImgHTMLAttributes<HTMLImageElement>) {
  // Static demo uses native image loading; production keeps next/image.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={props.alt ?? ""} />;
}
