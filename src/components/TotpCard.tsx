import { useState, useEffect, useCallback } from 'react';
import {
  Pin,
  MoreVertical,
  Copy,
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Trash2,
  Key,
  ShieldAlert,
  Edit3,
  Plus,
  QrCode,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { BrandIcon } from './BrandIcon.tsx';
import { AccountQrModal } from './AccountQrModal.tsx';
import { generateTotp, getTotpRemainingSeconds, getTotpProgress } from '../lib/crypto/totp.ts';
import { getTimeDriftOffsetMs } from '../lib/sync/timeSync.ts';
import { copyToClipboardSecurely } from '../lib/security/clipboardGuard.ts';
import { useTranslation } from '../i18n/index.ts';
import type { VaultItem } from '../types/vault.ts';

interface TotpCardProps {
  item: VaultItem;
  viewMode?: 'grid' | 'list';
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleRecoveryCode: (id: string, codeIndex: number) => void;
  onEdit?: (item: VaultItem) => void;
}

export function TotpCard({
  item,
  viewMode = 'grid',
  onTogglePin,
  onDelete,
  onToggleRecoveryCode,
  onEdit,
}: TotpCardProps) {
  const { t } = useTranslation();
  const [token, setToken] = useState<string>('------');
  const [remaining, setRemaining] = useState<number>(30);
  const [progress, setProgress] = useState<number>(1);
  const [isCopied, setIsCopied] = useState(false);

  // Recovery Codes state
  const [showRecovery, setShowRecovery] = useState(false);
  const [revealCodes, setRevealCodes] = useState(false);
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);

  const period = item.period || 30;

  // TOTP token update and circular countdown timer
  const updateCode = useCallback(async () => {
    try {
      const offsetMs = getTimeDriftOffsetMs();
      const currentToken = await generateTotp(item.secret, {
        digits: item.digits || 6,
        period: item.period || 30,
        algorithm: item.algorithm || 'SHA1',
        timeDriftOffsetMs: offsetMs,
      });
      setToken(currentToken);

      const rem = getTotpRemainingSeconds(period, offsetMs);
      const prog = getTotpProgress(period, offsetMs);
      setRemaining(rem);
      setProgress(prog);
    } catch {
      setToken('ERROR');
    }
  }, [item.secret, item.digits, item.period, item.algorithm, period]);

  useEffect(() => {
    updateCode();
    const interval = setInterval(updateCode, 1000);
    return () => clearInterval(interval);
  }, [updateCode]);

  // Copy main TOTP code
  const handleCopyToken = async () => {
    if (token === '------' || token === 'ERROR') return;
    await copyToClipboardSecurely(token, 45000);

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(40);
      } catch {}
    }

    setIsCopied(true);
    toast.success(t('totpCard.copiedTimeout', { issuer: item.issuer }));
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Copy individual recovery code
  const handleCopyRecoveryCode = async (code: string, idx: number) => {
    await copyToClipboardSecurely(code, 45000);
    setCopiedCodeIdx(idx);
    toast.success(t('totpCard.copyRecoverySuccess'));
    setTimeout(() => setCopiedCodeIdx(null), 1500);
  };

  // Copy Base32 secret
  const handleCopyBase32 = async () => {
    await copyToClipboardSecurely(item.secret, 45000);
    toast.success(t('totpCard.copySecretSuccess'));
  };

  // Token formatting: e.g. "123 456" or "1234 5678"
  const formattedToken =
    token.length === 8
      ? `${token.slice(0, 4)} ${token.slice(4)}`
      : token.length === 6
      ? `${token.slice(0, 3)} ${token.slice(3)}`
      : token;

  // Dynamic color logic for circular countdown timer
  let timerColor = '#10b981'; // Emerald (> 10s)
  let timerTextClass = 'text-emerald-400';
  if (remaining <= 5) {
    timerColor = '#ef4444'; // Rose / Red (<= 5s)
    timerTextClass = 'text-rose-400 animate-pulse';
  } else if (remaining <= 10) {
    timerColor = '#f59e0b'; // Amber (<= 10s)
    timerTextClass = 'text-amber-400';
  }

  const radius = 12;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  // Common Contextual Radix Dropdown
  const renderDropdown = () => (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="w-48 rounded-lg bg-[#0f1013] border border-white/[0.1] p-1 shadow-2xl z-50 text-xs text-zinc-300 hairline-top"
        >
          <DropdownMenu.Item
            onClick={() => onEdit?.(item)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-white/[0.06] hover:text-white cursor-pointer outline-none transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5 text-zinc-400" />
            {t('totpCard.editCodes')}
          </DropdownMenu.Item>

          <DropdownMenu.Item
            onClick={() => setShowQrModal(true)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-white/[0.06] hover:text-white cursor-pointer outline-none transition-colors"
          >
            <QrCode className="w-3.5 h-3.5 text-blue-400" />
            {t('accountQr.viewButton') || 'Ver Código QR'}
          </DropdownMenu.Item>

          <DropdownMenu.Item
            onClick={handleCopyBase32}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-white/[0.06] hover:text-white cursor-pointer outline-none transition-colors"
          >
            <Key className="w-3.5 h-3.5 text-zinc-400" />
            {t('totpCard.copyBase32')}
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="h-px bg-white/[0.08] my-1" />

          <DropdownMenu.Item
            onClick={() => onDelete(item.id)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-rose-500/10 text-rose-400 hover:text-rose-300 cursor-pointer outline-none transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('totpCard.deleteAccount')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );

  // ---------------------------------------------------------------------------
  // COMPACT LIST ROW VIEW
  // ---------------------------------------------------------------------------
  if (viewMode === 'list') {
    return (
      <>
        <div
          className={`group relative rounded-lg bg-[#0f1013] border ${
            item.pinned ? 'border-white/20' : 'border-white/[0.08]'
          } hairline-top px-3 sm:px-3.5 py-2.5 hover:border-white/[0.16] transition-colors flex items-center justify-between gap-2 sm:gap-3 w-full max-w-full`}
        >
          {/* Left: Brand + Identity */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <BrandIcon issuer={item.issuer} iconUrl={item.icon_url} size={32} className="shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-xs text-white truncate">
                  {item.issuer}
                </span>
                {item.pinned && (
                  <span className="text-[10px] font-mono text-zinc-400 bg-white/[0.04] border border-white/[0.08] px-1 py-0.2 rounded">
                    PIN
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 truncate max-w-[200px]" title={item.account}>
                {item.account}
              </p>
            </div>
          </div>

          {/* Right: Code + Timer + Actions */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Token Box */}
            <button
              type="button"
              onClick={handleCopyToken}
              className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#08090a] border border-white/[0.08] hover:border-white/20 transition-all active:scale-[0.99]"
              title={t('totpCard.clickToCopy')}
            >
              <span className="font-mono text-sm md:text-base font-semibold tracking-wider text-white">
                {formattedToken}
              </span>
              {isCopied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300" />
              )}
            </button>

            {/* Mini Circular Timer */}
            <div className="relative w-6 h-6 flex items-center justify-center">
              <svg className="w-6 h-6 -rotate-90">
                <circle cx="12" cy="12" r="10" fill="none" stroke="#27272a" strokeWidth="2" />
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="none"
                  stroke={timerColor}
                  strokeWidth="2"
                  strokeDasharray={2 * Math.PI * 10}
                  strokeDashoffset={2 * Math.PI * 10 * (1 - progress)}
                  strokeLinecap="round"
                  className="transition-[stroke-dashoffset] duration-500 ease-linear"
                />
              </svg>
              <span className={`absolute font-mono text-[9px] font-semibold ${timerTextClass}`}>
                {remaining}
              </span>
            </div>

            {/* Pin Button */}
            <button
              type="button"
              onClick={() => onTogglePin(item.id)}
              className={`p-1 rounded-md transition-colors ${
                item.pinned
                  ? 'text-white bg-white/[0.08]'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
              }`}
              title={item.pinned ? t('totpCard.unpinAccount') : t('totpCard.pinAccount')}
            >
              <Pin className={`w-3.5 h-3.5 transition-transform ${item.pinned ? 'rotate-45' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {renderDropdown()}
          </div>
        </div>

        <AccountQrModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          item={item}
        />
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // STANDARD GRID CARD VIEW
  // ---------------------------------------------------------------------------
  return (
    <>
      <motion.div
        layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 450, damping: 30 }}
      className={`group relative rounded-xl bg-[#0f1013] border ${
        item.pinned ? 'border-white/20 shadow-md' : 'border-white/[0.08]'
      } hairline-top p-3.5 sm:p-4 hover:border-white/[0.16] transition-all flex flex-col justify-between overflow-hidden w-full max-w-full`}
    >
      {/* Card Header */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandIcon issuer={item.issuer} iconUrl={item.icon_url} size={36} className="shrink-0" />
            <div className="min-w-0">
              <h3 className="font-semibold text-sm text-white tracking-tight truncate">
                {item.issuer}
              </h3>
              <p className="text-xs text-zinc-400 truncate" title={item.account}>
                {item.account}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onTogglePin(item.id)}
              className={`p-1.5 rounded-md transition-colors ${
                item.pinned
                  ? 'text-white bg-white/[0.08]'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
              }`}
              title={item.pinned ? t('totpCard.unpinAccount') : t('totpCard.pinAccount')}
            >
              <Pin className={`w-3.5 h-3.5 transition-transform ${item.pinned ? 'rotate-45' : ''}`} />
            </button>

            {renderDropdown()}
          </div>
        </div>

        {/* TOTP Code Display and Timer */}
        <div
          onClick={handleCopyToken}
          className="group/code relative flex items-center justify-between p-3 rounded-lg bg-[#08090a] border border-white/[0.08] hover:border-white/20 cursor-pointer transition-colors active:scale-[0.99] select-none"
          title={t('totpCard.clickToCopy')}
        >
          <div className="flex flex-col min-w-0 mr-2">
            <span className="font-mono text-xl sm:text-2xl font-bold tracking-wider text-white group-hover/code:text-zinc-200 transition-colors truncate">
              {formattedToken}
            </span>
            <span className="text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5 font-mono">
              {item.algorithm || 'SHA1'} · {period}s
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* SVG Circular Timer */}
            <div className="relative w-8 h-8 flex items-center justify-center">
              <svg className="w-8 h-8 -rotate-90">
                <circle
                  cx="16"
                  cy="16"
                  r={radius}
                  fill="none"
                  stroke="#27272a"
                  strokeWidth="2"
                />
                <circle
                  cx="16"
                  cy="16"
                  r={radius}
                  fill="none"
                  stroke={timerColor}
                  strokeWidth="2"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-[stroke-dashoffset] duration-500 ease-linear"
                />
              </svg>
              <span className={`absolute font-mono text-[10px] font-semibold ${timerTextClass}`}>
                {remaining}
              </span>
            </div>

            {/* Copy feedback icon */}
            <div
              className={`p-1.5 rounded-md transition-colors ${
                isCopied ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-500 group-hover/code:text-zinc-300'
              }`}
            >
              {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </div>
          </div>
        </div>

        {/* Optional tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/[0.04] text-zinc-300 border border-white/[0.08]"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Quick button to add backup codes if none exist */}
      {(!item.recovery_codes || item.recovery_codes.length === 0) && (
        <div className="mt-3 pt-2.5 border-t border-white/[0.06] flex items-center justify-between">
          <button
            type="button"
            onClick={() => onEdit?.(item)}
            className="text-[11px] text-zinc-400 hover:text-amber-300 flex items-center gap-1.5 transition-colors group/btn py-0.5"
            title={t('totpCard.addBackupCodes')}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400/80 group-hover/btn:text-amber-300" />
            <span>{t('totpCard.addBackupCodes')}</span>
          </button>
        </div>
      )}

      {/* Collapsible Recovery Codes Section */}
      {item.recovery_codes && item.recovery_codes.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={() => setShowRecovery(!showRecovery)}
            className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-200 transition-colors py-1"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              {t('totpCard.recoveryCodesHeader', { count: item.recovery_codes.length })}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                showRecovery ? 'rotate-180 text-white' : ''
              }`}
            />
          </button>

          <AnimatePresence>
            {showRecovery && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden mt-2"
              >
                <div className="p-2.5 rounded-lg bg-[#08090a] border border-white/[0.08] space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 pb-1 border-b border-white/[0.06]">
                    <span>{t('totpCard.markUsedHint')}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit?.(item)}
                        className="text-amber-400 hover:text-amber-300 flex items-center gap-1 text-[11px] font-sans"
                        title={t('totpCard.manageCodes')}
                      >
                        <Plus className="w-3 h-3" />
                        <span>{t('totpCard.manageCodes')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRevealCodes(!revealCodes)}
                        className="text-zinc-400 hover:text-white flex items-center gap-1"
                      >
                        {revealCodes ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {revealCodes ? t('totpCard.hideCodes') : t('totpCard.revealCodes')}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto pr-1 custom-scrollbar">
                    {item.recovery_codes.map((rc, idx) => {
                      const isUsed = rc.used;
                      const isThisCopied = copiedCodeIdx === idx;
                      const displayCode = revealCodes ? rc.code : '••••••••••••';

                      return (
                        <div
                          key={idx}
                          className={`flex items-center justify-between px-2 py-1.5 rounded-md text-xs font-mono border transition-colors ${
                            isUsed
                              ? 'bg-transparent border-white/[0.04] text-zinc-600 line-through'
                              : 'bg-[#16181d] border-white/[0.06] text-zinc-200'
                          }`}
                        >
                          <span
                            onClick={() => !isUsed && handleCopyRecoveryCode(rc.code, idx)}
                            className="cursor-pointer tracking-wider truncate mr-2"
                            title={isUsed ? t('totpCard.usedCodeTitle') : t('totpCard.clickToCopy')}
                          >
                            {displayCode}
                          </span>

                          <div className="flex items-center gap-2 shrink-0">
                            {!isUsed && (
                              <button
                                type="button"
                                onClick={() => handleCopyRecoveryCode(rc.code, idx)}
                                className="text-zinc-500 hover:text-white"
                              >
                                {isThisCopied ? (
                                  <Check className="w-3 h-3 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            )}

                            <input
                              type="checkbox"
                              checked={isUsed}
                              onChange={() => onToggleRecoveryCode(item.id, idx)}
                              title={isUsed ? t('totpCard.markAsAvailable') : t('totpCard.markAsUsed')}
                              className="rounded bg-[#08090a] border-white/20 text-white focus:ring-0 cursor-pointer"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>

    <AccountQrModal
      isOpen={showQrModal}
      onClose={() => setShowQrModal(false)}
      item={item}
    />
  </>
  );
}
