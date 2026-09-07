export function Sparkline({
  data,
  className = '',
  strokeClassName = 'stroke-sky-500',
}: {
  data: number[];
  className?: string;
  strokeClassName?: string;
}) {
  if (data.length < 2) return null;

  const width = 100;
  const height = 32;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`h-8 w-full ${className}`}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth="1.75"
        className={strokeClassName}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
