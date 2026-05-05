interface LogoProps {
  src?: string | null;
  className?: string;
}

export default function Logo({ src, className }: LogoProps) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src || '/logo.png'}
      alt="League Pulse"
      width={32}
      height={32}
      className={className ?? 'h-8 w-8 object-contain'}
    />
  );
}
