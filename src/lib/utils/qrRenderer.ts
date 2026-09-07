/**
 * Utility for generating and rendering crisp, vector SVG QR codes.
 * Uses ZXing's pure matrix encoder to avoid DOM lifecycle race conditions.
 */
import { QRCodeEncoder, QRCodeDecoderErrorCorrectionLevel } from '@zxing/library';

export interface QrRenderData {
  pathData: string;
  width: number;
  height: number;
  viewBoxSize: number;
}

export interface QrSvgOptions {
  size?: number;
  margin?: number;
}

/**
 * Computes the QR code matrix and transforms it into an optimized SVG path data string.
 * Consolidates consecutive horizontal modules into single rectangle runs for minimal SVG size.
 */
export function getQrPathAndDimensions(
  text: string,
  margin: number = 3
): QrRenderData | null {
  if (!text || typeof text !== 'string') return null;

  try {
    const code = QRCodeEncoder.encode(text, QRCodeDecoderErrorCorrectionLevel.L);
    const matrix = code.getMatrix();
    if (!matrix) return null;

    const width = matrix.getWidth();
    const height = matrix.getHeight();
    const viewBoxSize = width + margin * 2;

    let pathData = '';

    for (let y = 0; y < height; y++) {
      let runStart = -1;
      for (let x = 0; x < width; x++) {
        const isBlack = matrix.get(x, y) === 1;
        if (isBlack) {
          if (runStart === -1) {
            runStart = x;
          }
        } else {
          if (runStart !== -1) {
            const runLength = x - runStart;
            pathData += `M${runStart + margin},${y + margin}h${runLength}v1h-${runLength}z `;
            runStart = -1;
          }
        }
      }
      if (runStart !== -1) {
        const runLength = width - runStart;
        pathData += `M${runStart + margin},${y + margin}h${runLength}v1h-${runLength}z `;
      }
    }

    return {
      pathData: pathData.trim(),
      width,
      height,
      viewBoxSize,
    };
  } catch (err) {
    console.error('Failed to encode QR code matrix:', err);
    return null;
  }
}

/**
 * Generates a full standalone SVG string for the given text.
 */
export function generateQrSvgString(
  text: string,
  options?: QrSvgOptions
): string {
  const margin = options?.margin ?? 3;
  const size = options?.size ?? 260;
  const qrData = getQrPathAndDimensions(text, margin);

  if (!qrData) return '';

  const { pathData, viewBoxSize } = qrData;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" width="${size}" height="${size}" style="max-width: 100%; height: auto; display: block; border-radius: 12px; background: #ffffff;" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#ffffff"/><path d="${pathData}" fill="#000000"/></svg>`;
}

/**
 * Renders an SVG QR code directly into a target DOM container element.
 * 
 * @param container Target HTML container element
 * @param text The string to encode into the QR code
 * @param size Width and height of the QR code in pixels
 */
export function renderQrCodeToDom(
  container: HTMLElement,
  text: string,
  size: number = 260
): void {
  if (!container) return;
  container.innerHTML = '';
  if (!text) return;

  const svgString = generateQrSvgString(text, { size });
  if (svgString) {
    container.innerHTML = svgString;
  } else {
    container.innerHTML = `<div class="text-xs text-red-400 p-4 text-center">Error al generar código QR</div>`;
  }
}

