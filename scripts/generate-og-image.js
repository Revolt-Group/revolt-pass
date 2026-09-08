import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const width = 1200;
const height = 630;

let gridLines = '';
for (let i = 0; i < 25; i++) {
  gridLines += `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="${height}" />\n`;
}
for (let i = 0; i < 14; i++) {
  gridLines += `<line x1="0" y1="${i * 50}" x2="${width}" y2="${i * 50}" />\n`;
}

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <radialGradient id="bgGrad" cx="50%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#181825" />
      <stop offset="60%" stop-color="#0d0e15" />
      <stop offset="100%" stop-color="#06070a" />
    </radialGradient>
    <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="40%" stop-color="#e4e4e7" />
      <stop offset="100%" stop-color="#71717a" />
    </linearGradient>
    <linearGradient id="coreGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#8b5cf6" />
    </linearGradient>
    <linearGradient id="textGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#cbd5e1" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="16" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <rect width="${width}" height="${height}" fill="url(#bgGrad)" />

  <!-- Grid decoration -->
  <g opacity="0.07" stroke="#ffffff" stroke-width="1">
    ${gridLines}
  </g>

  <!-- Ambient Glow -->
  <circle cx="240" cy="315" r="200" fill="#6366f1" opacity="0.12" filter="url(#glow)" />
  <circle cx="960" cy="315" r="220" fill="#8b5cf6" opacity="0.08" filter="url(#glow)" />

  <!-- Shield Emblem (Centered on left) -->
  <g transform="translate(240, 315) scale(1.4) translate(-100, -100)">
    <path d="M100 20 L165 48 C165 110, 100 170, 100 170 C100 170, 35 110, 35 48 Z" fill="none" stroke="#6366f1" stroke-width="10" opacity="0.4" filter="url(#glow)" />
    <path d="M100 20 L165 48 C165 110, 100 170, 100 170 C100 170, 35 110, 35 48 Z" fill="none" stroke="url(#shieldGrad)" stroke-width="6" stroke-linejoin="round" />
    <path d="M100 32 L153 55 C153 105, 100 155, 100 155 C100 155, 47 105, 47 55 Z" fill="#12131a" stroke="rgba(255,255,255,0.12)" stroke-width="2" />
    <circle cx="100" cy="80" r="16" fill="url(#coreGrad)" />
    <path d="M93 84 L107 84 L111 118 L89 118 Z" fill="url(#coreGrad)" />
    <circle cx="100" cy="80" r="6" fill="#090a0f" />
    <path d="M98 84 L102 84 L104 106 L96 106 Z" fill="#090a0f" />
  </g>

  <!-- Typography & Content -->
  <g transform="translate(440, 190)">
    <!-- Supertitle / Badge -->
    <rect x="0" y="0" width="280" height="36" rx="18" fill="rgba(99,102,241,0.15)" stroke="rgba(99,102,241,0.4)" stroke-width="1.5" />
    <text x="14" y="23" fill="#818cf8" font-family="system-ui, -apple-system, sans-serif" font-size="14" font-weight="700" letter-spacing="1.5">ZERO-KNOWLEDGE VAULT</text>

    <!-- Title -->
    <text x="0" y="100" fill="url(#textGrad)" font-family="system-ui, -apple-system, sans-serif" font-size="64" font-weight="800" letter-spacing="-1.5">Revolt Pass</text>

    <!-- Subtitle -->
    <text x="0" y="150" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="24" font-weight="400">Enterprise-Grade Password, 2FA &amp; Secrets Manager</text>

    <!-- Value Prop Description -->
    <text x="0" y="190" fill="#64748b" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="400">Polymorphic Secrets · Envelope Encryption · Cloudflare Edge · $0/mo</text>

    <!-- Feature Pills -->
    <g transform="translate(0, 235)">
      <!-- Pill 1 -->
      <rect x="0" y="0" width="145" height="36" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1" />
      <text x="16" y="23" fill="#f1f5f9" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="600">AES-256-GCM</text>

      <!-- Pill 2 -->
      <rect x="157" y="0" width="155" height="36" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1" />
      <text x="173" y="23" fill="#f1f5f9" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="600">Argon2id WASM</text>

      <!-- Pill 3 -->
      <rect x="324" y="0" width="155" height="36" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1" />
      <text x="340" y="23" fill="#f1f5f9" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="600">FIDO2 / Passkeys</text>

      <!-- Pill 4 -->
      <rect x="491" y="0" width="170" height="36" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1" />
      <text x="507" y="23" fill="#22c55e" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="600">GNU AGPLv3 Open</text>
    </g>
  </g>

  <!-- Bottom Accent Bar -->
  <rect x="0" y="624" width="1200" height="6" fill="url(#coreGrad)" />
</svg>
`;

await sharp(Buffer.from(svg))
  .png({ quality: 95 })
  .toFile(path.resolve('public/og-image.png'));

console.log('og-image.png generated successfully (1200x630)');
