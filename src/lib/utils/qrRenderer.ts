/**
 * Utility for rendering vector SVG QR codes using ZXing.
 */
import { BrowserQRCodeSvgWriter } from '@zxing/library';

/**
 * Renders an SVG QR code directly into a target DOM container element.
 * Applies high-contrast white background and responsive scaling.
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
  container.innerHTML = '';
  if (!text) return;

  try {
    const writer = new BrowserQRCodeSvgWriter();
    const svg = writer.write(text, size, size);
    
    // Set responsive and styling attributes
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.maxWidth = `${size}px`;
    svg.style.maxHeight = `${size}px`;
    svg.style.display = 'block';
    svg.style.margin = '0 auto';
    svg.style.backgroundColor = '#ffffff';
    svg.style.borderRadius = '12px';
    svg.style.padding = '10px';

    container.appendChild(svg);
  } catch (err) {
    console.error('Failed to generate QR code SVG:', err);
    container.innerHTML = `<div class="text-xs text-red-400 p-4 text-center">Error al generar código QR</div>`;
  }
}
