// CardConnect logo — a business card silhouette in Google Blue with a
// Material-style rounded corner radius. Includes a small chip dot so it reads
// as "card + identity", and works at 24px (app bar) all the way up to 96px.
export function Logo({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-label="CardConnect"
      className={className}
    >
      {/* The card */}
      <rect x="3" y="7" width="26" height="18" rx="5" fill="hsl(var(--blue))" />
      {/* Avatar circle */}
      <circle cx="11" cy="16" r="3" fill="white" />
      {/* Name lines */}
      <rect x="16.5" y="13" width="9" height="2" rx="1" fill="white" opacity="0.95" />
      <rect x="16.5" y="17" width="6.5" height="1.6" rx="0.8" fill="white" opacity="0.6" />
      {/* Connect dot \u2014 Google Yellow accent in the corner so the logo feels playful */}
      <circle cx="26.5" cy="9.5" r="2.2" fill="hsl(var(--google-yellow))" stroke="white" strokeWidth="1.4" />
    </svg>
  );
}
