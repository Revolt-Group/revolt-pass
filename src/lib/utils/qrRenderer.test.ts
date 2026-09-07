import { describe, it, expect } from 'vitest';
import { generateQrSvgString, getQrPathAndDimensions, renderQrCodeToDom } from './qrRenderer';

describe('QR Renderer Utility', () => {
  it('generates valid SVG for standard OTP URI', () => {
    const uri = 'otpauth://totp/GitHub:user?secret=JBSWY3DPEHPK3PXP&issuer=GitHub';
    const svg = generateQrSvgString(uri, { size: 260, margin: 4 });

    expect(svg).toBeDefined();
    expect(svg).toContain('<svg');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox=');
    expect(svg).toContain('<rect width="100%" height="100%" fill="#ffffff"');
    expect(svg).toContain('<path d="M');
    expect(svg).toContain('fill="#000000"');
    expect(svg).toContain('</svg>');
  });

  it('generates valid SVG for Google Authenticator migration URI', () => {
    const migrationUri =
      'otpauth-migration://offline?data=CjEKCkpCU1dZM0RQSFASBmdpdGh1YhoGdXNlckAxIAEoATACCghFeGFtcGxlIDEYASABKAIwARgBIAEYAiAA';
    const svg = generateQrSvgString(migrationUri, { size: 280, margin: 3 });

    expect(svg).toBeDefined();
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 47 47"'); // 41x41 matrix + margin 3 on each side (41 + 6 = 47)
    expect(svg).toContain('d="M');
  });

  it('returns empty string for empty or non-string input', () => {
    expect(generateQrSvgString('')).toBe('');
    expect(generateQrSvgString(null as unknown as string)).toBe('');
  });

  it('computes matrix dimensions and combined path runs correctly', () => {
    const data = getQrPathAndDimensions('test', 2);
    expect(data).not.toBeNull();
    if (data) {
      expect(data.width).toBeGreaterThan(0);
      expect(data.height).toBeGreaterThan(0);
      expect(data.viewBoxSize).toBe(data.width + 4);
      expect(data.pathData.length).toBeGreaterThan(0);
    }
  });

  it('renderQrCodeToDom injects SVG markup into container', () => {
    const container = { innerHTML: '' } as unknown as HTMLElement;
    renderQrCodeToDom(container, 'otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP', 200);
    expect(container.innerHTML).toContain('<svg');
    expect(container.innerHTML).toContain('fill="#000000"');
  });
});
