interface FireIconProps {
  size?: number;
  className?: string;
}

export function FireIcon({ size = 24, className = '' }: FireIconProps) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}fire-icon.svg`}
      alt=""
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    />
  );
}
