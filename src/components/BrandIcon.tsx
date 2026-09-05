import { useState, useEffect } from 'react';

interface BrandIconProps {
  issuer: string;
  iconUrl?: string;
  size?: number;
  className?: string;
}

const COMMON_BRAND_SLUGS: Record<string, string> = {
  aws: 'amazonwebservices',
  amazon: 'amazon',
  'amazon web services': 'amazonwebservices',
  google: 'google',
  github: 'github',
  gitlab: 'gitlab',
  bitbucket: 'bitbucket',
  discord: 'discord',
  slack: 'slack',
  microsoft: 'microsoft',
  apple: 'apple',
  cloudflare: 'cloudflare',
  steam: 'steam',
  ubisoft: 'ubisoft',
  'epic games': 'epicgames',
  playstation: 'playstation',
  xbox: 'xbox',
  nintendo: 'nintendo',
  spotify: 'spotify',
  twitter: 'x',
  x: 'x',
  facebook: 'meta',
  meta: 'meta',
  instagram: 'instagram',
  binance: 'binance',
  coinbase: 'coinbase',
  kraken: 'kraken',
  paypal: 'paypal',
  stripe: 'stripe',
  notion: 'notion',
  linear: 'linear',
  vercel: 'vercel',
  openai: 'openai',
  chatgpt: 'openai',
  proton: 'proton',
  protonmail: 'proton',
  '1password': '1password',
  bitwarden: 'bitwarden',
  dropbox: 'dropbox',
  reddit: 'reddit',
  telegram: 'telegram',
  twitch: 'twitch',
};

const GRADIENT_PALETTES = [
  'from-violet-600 to-indigo-600',
  'from-blue-600 to-cyan-600',
  'from-emerald-600 to-teal-600',
  'from-rose-600 to-pink-600',
  'from-amber-600 to-orange-600',
  'from-fuchsia-600 to-purple-600',
  'from-cyan-600 to-blue-600',
  'from-indigo-600 to-violet-600',
];

/**
 * Hash FNV-1a para asignación determinista de color y gradiente.
 */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Extrae las iniciales del nombre del proveedor (1-2 caracteres).
 */
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || 'RP';
}

export function BrandIcon({ issuer, iconUrl, size = 36, className = '' }: BrandIconProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [iconUrl, issuer]);

  const cleanName = (issuer || 'Vault').trim();
  const normalizedKey = cleanName.toLowerCase();
  const slug = COMMON_BRAND_SLUGS[normalizedKey] || normalizedKey.replace(/[^a-z0-9]/g, '');

  // Si el usuario proporcionó un iconUrl (URL externa o data:image base64), tiene prioridad total
  const effectiveIconUrl = iconUrl?.trim() || (slug ? `https://cdn.simpleicons.org/${slug}/white` : null);

  const gradientIdx = fnv1a(cleanName) % GRADIENT_PALETTES.length;
  const gradientClass = GRADIENT_PALETTES[gradientIdx];
  const initials = getInitials(cleanName);

  if (!effectiveIconUrl || hasError) {
    return (
      <div
        className={`flex items-center justify-center font-bold text-white shadow-md select-none rounded-xl bg-gradient-to-br ${gradientClass} ${className}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          fontSize: `${Math.max(11, Math.floor(size * 0.38))}px`,
        }}
        title={cleanName}
        aria-label={cleanName}
      >
        {initials}
      </div>
    );
  }

  return (
    <div
      className={`relative flex items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800/80 p-1.5 shadow-inner overflow-hidden ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      <img
        src={effectiveIconUrl}
        alt={cleanName}
        loading="lazy"
        className="w-full h-full object-contain rounded-lg filter drop-shadow transition-transform duration-200 hover:scale-110"
        onError={() => setHasError(true)}
      />
    </div>
  );
}
