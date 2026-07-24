// design-sync stub for next/image — renders a plain <img> so Tavli components
// that use next/image render in the (non-Next) preview sandbox. Aliased via
// .design-sync/tsconfig.ds.json. Uses React.createElement to avoid any JSX
// runtime resolution in the synth bundle.
import * as React from "react";
export default function Image(props: any) {
  const {
    src, alt = "", width, height, fill, className, style,
    priority, quality, placeholder, sizes, loader, unoptimized,
    onLoadingComplete, blurDataURL, loading, fetchPriority, overrideSrc,
    ...rest
  } = props ?? {};
  const s = typeof src === "string" ? src : (src && src.src) || "";
  const fillStyle = fill
    ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" as const }
    : {};
  return React.createElement("img", {
    src: s,
    alt,
    width: fill ? undefined : width,
    height: fill ? undefined : height,
    className,
    style: Object.assign({}, fillStyle, style),
    ...rest,
  });
}
