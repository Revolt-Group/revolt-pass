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

/**
 * Extracts provider initials (1-2 characters).
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

  // If user provided an iconUrl (external URL or data:image base64), it takes absolute priority
  const effectiveIconUrl = iconUrl?.trim() || (slug ? `https://cdn.simpleicons.org/${slug}/white` : null);
  const initials = getInitials(cleanName);

  if (!effectiveIconUrl || hasError) {
    return (
      <div
        className={`flex items-center justify-center font-mono font-medium text-zinc-200 select-none rounded-lg bg-[#16181d] border border-white/[0.08] hairline-top shrink-0 ${className}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          fontSize: `${Math.max(10, Math.floor(size * 0.36))}px`,
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
      className={`relative flex items-center justify-center rounded-lg bg-[#16181d] border border-white/[0.08] p-1.5 overflow-hidden hairline-top shrink-0 ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
      }}
    >
      <img
        src={effectiveIconUrl}
        alt={cleanName}
        loading="lazy"
        className="w-full h-full object-contain rounded filter contrast-125"
        onError={() => setHasError(true)}
      />
    </div>
  );
}
