import Image from "next/image";
import { cn } from "@/lib/utils";
import { COMPANY_NAME_AR, LOGO_SRC } from "@/lib/branding";

export function BrandLogo({
  className,
  size = 40,
  priority = false,
}: {
  className?: string;
  size?: number;
  priority?: boolean;
}) {
  return (
    <Image
      src={LOGO_SRC}
      alt={COMPANY_NAME_AR}
      width={size}
      height={size}
      priority={priority}
      unoptimized
      className={cn("object-contain", className)}
    />
  );
}
