import { useState, useEffect } from 'react';
import { Command } from 'cmdk';
import {
  Search,
  Pin,
  KeyRound,
  PlusCircle,
  RefreshCw,
  Lock,
  Copy,
  Globe,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { BrandIcon } from './BrandIcon.tsx';
import { generateTotp } from '../lib/crypto/totp.ts';
import { getTimeDriftOffsetMs } from '../lib/sync/timeSync.ts';
import { copyToClipboardSecurely } from '../lib/security/clipboardGuard.ts';
import { useTranslation } from '../i18n/index.ts';
import type { VaultItem } from '../types/vault.ts';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  items: VaultItem[];
  onOpenAddAccount: () => void;
  onOpenGenerator: () => void;
  onTriggerSync: () => void;
  onLockVault: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  items,
  onOpenAddAccount,
  onOpenGenerator,
  onTriggerSync,
  onLockVault,
}: CommandPaletteProps) {
  const { t, toggleLang } = useTranslation();
  const [tokens, setTokens] = useState<Record<string, string>>({});

  // Compute live tokens for palette search results
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const offsetMs = getTimeDriftOffsetMs();

    async function loadTokens() {
      const map: Record<string, string> = {};
      for (const item of items) {
        try {
          const code = await generateTotp(item.secret, {
            digits: item.digits || 6,
            period: item.period || 30,
            algorithm: item.algorithm || 'SHA1',
            timeDriftOffsetMs: offsetMs,
          });
          map[item.id] = code;
        } catch {
          map[item.id] = '------';
        }
      }
      if (isMounted) setTokens(map);
    }

    loadTokens();
    const interval = setInterval(loadTokens, 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOpen, items]);

  const handleCopyAndClose = async (item: VaultItem) => {
    const code = tokens[item.id];
    if (!code || code === '------') return;

    await copyToClipboardSecurely(code, 45000);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(40);
      } catch {}
    }

    toast.success(t('totpCard.copiedTimeout', { issuer: item.issuer }));
    onClose();
  };

  const pinnedItems = items.filter((i) => i.pinned);
  const unpinnedItems = items.filter((i) => !i.pinned);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] p-4">
          {/* Blurred overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-md"
          />

          {/* cmdk Floating Box */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ type: 'spring', stiffness: 450, damping: 32 }}
            className="relative w-full max-w-xl bg-[#0f1013] border border-white/[0.08] hairline-top rounded-xl shadow-[0_24px_68px_rgba(0,0,0,0.8)] overflow-hidden z-10 text-zinc-100"
          >
            <Command
              className="w-full flex flex-col focus:outline-none"
              loop
            >
              {/* Top Search Input */}
              <div className="flex items-center px-4 py-3 border-b border-white/[0.08] gap-3 bg-[#08090a]">
                <Search className="w-4 h-4 text-zinc-400 shrink-0" />
                <Command.Input
                  autoFocus
                  placeholder={t('commandPalette.placeholder')}
                  className="w-full bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
                />
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 bg-[#16181d] border border-white/[0.08] rounded">
                  ESC
                </kbd>
              </div>

              {/* Results List */}
              <Command.List className="max-h-[55vh] overflow-y-auto p-2 text-xs space-y-1 custom-scrollbar">
                <Command.Empty className="py-8 text-center text-zinc-500">
                  {t('commandPalette.noResults')}
                </Command.Empty>

                {/* Quick Actions */}
                <Command.Group heading={t('commandPalette.systemActions')} className="text-zinc-500 font-semibold px-2 py-1 text-[11px] font-mono uppercase">
                  <Command.Item
                    onSelect={() => {
                      onClose();
                      onOpenAddAccount();
                    }}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.06] aria-selected:bg-white/[0.06] aria-selected:text-white cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <PlusCircle className="w-4 h-4 text-white" />
                      <span className="font-medium text-xs">{t('commandPalette.addAccount')}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">{t('commandPalette.addAccountSubtitle')}</span>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => {
                      onClose();
                      onOpenGenerator();
                    }}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.06] aria-selected:bg-white/[0.06] aria-selected:text-white cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <KeyRound className="w-4 h-4 text-white" />
                      <span className="font-medium text-xs">{t('commandPalette.openGenerator')}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">{t('commandPalette.generatorSubtitle')}</span>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => {
                      onClose();
                      onTriggerSync();
                    }}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.06] aria-selected:bg-white/[0.06] aria-selected:text-white cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <RefreshCw className="w-4 h-4 text-white" />
                      <span className="font-medium text-xs">{t('commandPalette.syncVault')}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">{t('commandPalette.syncSubtitle')}</span>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => {
                      toggleLang();
                      toast.success(t('toasts.langChanged'));
                    }}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-zinc-300 hover:text-white hover:bg-white/[0.06] aria-selected:bg-white/[0.06] aria-selected:text-white cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Globe className="w-4 h-4 text-emerald-400" />
                      <span className="font-medium text-xs">{t('commandPalette.toggleLanguage')}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">{t('commandPalette.langSubtitle')}</span>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => {
                      onClose();
                      onLockVault();
                    }}
                    className="flex items-center justify-between px-2.5 py-2 rounded-lg text-zinc-300 hover:text-rose-400 hover:bg-rose-500/10 aria-selected:bg-rose-500/10 aria-selected:text-rose-400 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Lock className="w-4 h-4 text-rose-400" />
                      <span className="font-medium text-xs">{t('commandPalette.lockVault')}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">{t('commandPalette.lockSubtitle')}</span>
                  </Command.Item>
                </Command.Group>

                {/* Pinned Accounts */}
                {pinnedItems.length > 0 && (
                  <Command.Group heading={t('nav.pinnedVaults')} className="text-zinc-500 font-semibold px-2 py-1 mt-2 text-[11px] font-mono uppercase">
                    {pinnedItems.map((item) => {
                      const code = tokens[item.id] || '------';
                      return (
                        <Command.Item
                          key={item.id}
                          value={`${item.issuer} ${item.account} ${item.tags?.join(' ') || ''}`}
                          onSelect={() => handleCopyAndClose(item)}
                          className="flex items-center justify-between px-2.5 py-2 rounded-lg text-zinc-200 hover:text-white hover:bg-white/[0.06] aria-selected:bg-white/[0.06] aria-selected:text-white cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <BrandIcon issuer={item.issuer} iconUrl={item.icon_url} size={28} className="shrink-0" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-xs text-white truncate">
                                  {item.issuer}
                                </span>
                                <Pin className="w-3 h-3 text-zinc-400 shrink-0 rotate-45" />
                              </div>
                              <p className="text-[11px] text-zinc-400 truncate">{item.account}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 font-mono text-xs md:text-sm font-semibold text-white tracking-wider">
                            <span>{code}</span>
                            <Copy className="w-3 h-3 text-zinc-500" />
                          </div>
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )}

                {/* All Accounts */}
                <Command.Group heading={t('nav.allVaults')} className="text-zinc-500 font-semibold px-2 py-1 mt-2 text-[11px] font-mono uppercase">
                  {unpinnedItems.map((item) => {
                    const code = tokens[item.id] || '------';
                    return (
                      <Command.Item
                        key={item.id}
                        value={`${item.issuer} ${item.account} ${item.tags?.join(' ') || ''}`}
                        onSelect={() => handleCopyAndClose(item)}
                        className="flex items-center justify-between px-2.5 py-2 rounded-lg text-zinc-200 hover:text-white hover:bg-white/[0.06] aria-selected:bg-white/[0.06] aria-selected:text-white cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <BrandIcon issuer={item.issuer} iconUrl={item.icon_url} size={28} className="shrink-0" />
                          <div className="min-w-0">
                            <span className="font-medium text-xs text-white truncate block">
                              {item.issuer}
                            </span>
                            <p className="text-[11px] text-zinc-400 truncate">{item.account}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 font-mono text-xs md:text-sm font-semibold text-zinc-200 tracking-wider">
                          <span>{code}</span>
                          <Copy className="w-3 h-3 text-zinc-500" />
                        </div>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              </Command.List>

              {/* Footer Keyboard Shortcuts Bar */}
              <div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.08] bg-[#08090a] text-[11px] text-zinc-500 font-mono">
                <span>{t('commandPalette.footerNavigate')} <kbd className="px-1 py-0.2 rounded bg-[#16181d] border border-white/[0.08] text-zinc-300">↑</kbd> <kbd className="px-1 py-0.2 rounded bg-[#16181d] border border-white/[0.08] text-zinc-300">↓</kbd></span>
                <span>{t('commandPalette.footerSelect')} <kbd className="px-1.5 py-0.2 rounded bg-[#16181d] border border-white/[0.08] text-white">Enter</kbd></span>
              </div>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
