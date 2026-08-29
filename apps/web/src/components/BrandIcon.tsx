import Image from "next/image";

/**
 * The IntentFlow brand icon, sized for use in nav bars.
 * Replaces the old inline lightning-bolt SVG.
 *
 * @param size - box size in px (default 36 for h-9/w-9 navbars,
 *               32 for h-8/w-8 merchant navbars)
 */
export default function BrandIcon({ size = 36 }: { size?: number }) {
  return (
    <Image
      src="/branding/intentflow-icon-nav.png"
      alt="IntentFlow"
      width={size}
      height={size}
      priority
      style={{ borderRadius: "inherit" }}
    />
  );
}
