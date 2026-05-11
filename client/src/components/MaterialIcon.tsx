// Material Symbols Rounded glyph — Google's official icon set, served from
// the fonts.googleapis.com stylesheet imported in index.css. Using ligatures
// keeps the JSX readable: <MaterialIcon name="contacts" />.
import { CSSProperties } from "react";

interface Props {
  name: string;
  filled?: boolean;
  className?: string;
  size?: number;
  weight?: 300 | 400 | 500 | 600 | 700;
  style?: CSSProperties;
  "aria-hidden"?: boolean;
}

export function MaterialIcon({
  name,
  filled = false,
  className = "",
  size = 24,
  weight = 400,
  style,
  "aria-hidden": ariaHidden = true,
}: Props) {
  const settings = `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}`;
  return (
    <span
      aria-hidden={ariaHidden}
      className={`material-symbols-rounded ${filled ? "filled" : ""} ${className}`}
      style={{ fontSize: `${size}px`, lineHeight: `${size}px`, fontVariationSettings: settings, ...style }}
    >
      {name}
    </span>
  );
}
