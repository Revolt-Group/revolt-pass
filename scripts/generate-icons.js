import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const publicDir = path.resolve('public');

// 1. Vector SVG definition for Revolt Pass (Technical Cybersecurity Aesthetic)
function getSvg(size, isMaskable = false) {
  // Safe zone scaling: maskable needs more margin (~60% of canvas)
  const scale = isMaskable ? 0.6 : 0.72;
  const center = size / 2;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <!-- Background Gradient -->
    <radialGradient id="bgGrad" cx="50%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#18181b" />
      <stop offset="100%" stop-color="#090a0f" />
    </radialGradient>

    <!-- Metallic Shield Gradient -->
    <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="40%" stop-color="#e4e4e7" />
      <stop offset="100%" stop-color="#71717a" />
    </linearGradient>

    <!-- Core Vault Gradient -->
    <linearGradient id="coreGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#8b5cf6" />
    </linearGradient>

    <!-- Subtle Glow Filter -->
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="${size * 0.02}" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Base Technical Dark Background -->
  <rect width="${size}" height="${size}" fill="#090a0f" />

  ${!isMaskable ? `
  <!-- Squircle Base for standard icons -->
  <rect x="${size * 0.04}" y="${size * 0.04}" width="${size * 0.92}" height="${size * 0.92}" rx="${size * 0.22}" fill="url(#bgGrad)" stroke="rgba(255,255,255,0.08)" stroke-width="${size * 0.015}" />
  ` : ''}

  <!-- Emblem Group centered and scaled -->
  <g transform="translate(${center}, ${center}) scale(${scale}) translate(-100, -100)">
    <!-- Outer Shield Shadow / Glow -->
    <path
      d="M100 20 L165 48 C165 110, 100 170, 100 170 C100 170, 35 110, 35 48 Z"
      fill="none"
      stroke="#6366f1"
      stroke-width="8"
      opacity="0.25"
      filter="url(#glow)"
    />

    <!-- Main Metallic Shield Rim -->
    <path
      d="M100 22 L160 48 C160 106, 100 162, 100 162 C100 162, 40 106, 40 48 Z"
      fill="#12131a"
      stroke="url(#shieldGrad)"
      stroke-width="5"
      stroke-linejoin="round"
    />

    <!-- Inner Shield Inset Layer -->
    <path
      d="M100 34 L148 56 C148 102, 100 148, 100 148 C100 148, 52 102, 52 56 Z"
      fill="#090a0f"
      stroke="rgba(255,255,255,0.12)"
      stroke-width="2"
    />

    <!-- Central Keyhole & Lock Emblem -->
    <!-- Shackle -->
    <path
      d="M86 86 V76 C86 68.268, 92.268 62, 100 62 C107.732 62, 114 68.268, 114 76 V86"
      fill="none"
      stroke="url(#shieldGrad)"
      stroke-width="5.5"
      stroke-linecap="round"
    />
    <!-- Body -->
    <rect
      x="80"
      y="86"
      width="40"
      height="32"
      rx="6"
      fill="url(#coreGrad)"
      stroke="rgba(255,255,255,0.2)"
      stroke-width="1.5"
    />
    <!-- Keyhole -->
    <circle cx="100" cy="98" r="3.5" fill="#ffffff" />
    <path d="M98.5 98 L97 108 H103 L101.5 98 Z" fill="#ffffff" />

    <!-- Active Zero-Knowledge Pulse Indicator -->
    <circle cx="100" cy="134" r="4.5" fill="#10b981" />
    <circle cx="100" cy="134" r="8" fill="none" stroke="#10b981" stroke-width="1.5" opacity="0.6" />
  </g>
</svg>
  `.trim();
}

async function run() {
  console.log('Generating Revolt Pass PWA Icons...');

  // 1. Favicon SVG (Standard 64px representation)
  const faviconSvg = getSvg(64, false);
  fs.writeFileSync(path.join(publicDir, 'favicon.svg'), faviconSvg, 'utf-8');
  console.log('✓ public/favicon.svg created');

  // 2. pwa-192x192.png
  const svg192 = getSvg(192, false);
  await sharp(Buffer.from(svg192))
    .png()
    .toFile(path.join(publicDir, 'pwa-192x192.png'));
  console.log('✓ public/pwa-192x192.png created');

  // 3. pwa-512x512.png
  const svg512 = getSvg(512, false);
  await sharp(Buffer.from(svg512))
    .png()
    .toFile(path.join(publicDir, 'pwa-512x512.png'));
  console.log('✓ public/pwa-512x512.png created');

  // 4. maskable-icon-512x512.png (with safe padding)
  const svgMaskable = getSvg(512, true);
  await sharp(Buffer.from(svgMaskable))
    .png()
    .toFile(path.join(publicDir, 'maskable-icon-512x512.png'));
  console.log('✓ public/maskable-icon-512x512.png created');

  // 5. apple-touch-icon.png (180x180)
  const svg180 = getSvg(180, false);
  await sharp(Buffer.from(svg180))
    .png()
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));
  console.log('✓ public/apple-touch-icon.png created');

  console.log('All icons generated successfully!');
}

run().catch((err) => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
