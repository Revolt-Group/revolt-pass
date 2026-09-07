import { useMemo } from 'react';
import { getQrPathAndDimensions } from '../lib/utils/qrRenderer';

interface QrCodeViewProps {
  value: string;
  size?: number;
  margin?: number;
  className?: string;
  alt?: string;
}

export function QrCodeView({
  value,
  size = 260,
  margin = 3,
  className = '',
  alt = 'Código QR',
}: QrCodeViewProps) {
  const qrData = useMemo(() => {
    if (!value) return null;
    return getQrPathAndDimensions(value, margin);
  }, [value, margin]);

  if (!value || !qrData) {
    return (
      <div
        className={`flex items-center justify-center bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-500 text-xs ${className}`}
        style={{ width: size, height: size }}
      >
        <span>Sin datos para generar QR</span>
      </div>
    );
  }

  const { pathData, viewBoxSize } = qrData;

  return (
    <div
      className={`relative inline-flex items-center justify-center p-3 bg-white rounded-2xl shadow-lg ${className}`}
      style={{
        width: '100%',
        maxWidth: `${size}px`,
        aspectRatio: '1 / 1',
      }}
      role="img"
      aria-label={alt}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        className="w-full h-full block select-none"
        shapeRendering="crispEdges"
      >
        <rect width="100%" height="100%" fill="#ffffff" />
        <path d={pathData} fill="#000000" />
      </svg>
    </div>
  );
}
