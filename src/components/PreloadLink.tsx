import { Link, type LinkProps } from 'react-router-dom';
import { preloadRoute } from '../routes/lazyPages';

function getPathname(to: LinkProps['to']): string | undefined {
  if (typeof to === 'string') {
    return to;
  }
  return to.pathname;
}

export function PreloadLink({
  to,
  onFocus,
  onPointerDown,
  onPointerEnter,
  ...props
}: LinkProps) {
  const warmRoute = () => {
    const pathname = getPathname(to);
    if (pathname) void preloadRoute(pathname);
  };

  return (
    <Link
      {...props}
      to={to}
      onFocus={(event) => {
        warmRoute();
        onFocus?.(event);
      }}
      onPointerDown={(event) => {
        warmRoute();
        onPointerDown?.(event);
      }}
      onPointerEnter={(event) => {
        warmRoute();
        onPointerEnter?.(event);
      }}
    />
  );
}
