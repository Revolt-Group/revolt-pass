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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { BrandIcon } from './BrandIcon.tsx';
import { generateTotp } from '../lib/crypto/totp.ts';
import { getTimeDriftOffsetMs } from '../lib/sync/timeSync.ts';
import { copyToClipboardSecurely } from '../lib/security/clipboardGuard.ts';
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
  const [tokens, setTokens] = useState<Record<string, string>>({});

  // Calcular tokens en vivo para los resultados de la paleta
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

    toast.success(`Código de ${item.issuer} copiado (se borrará en 45s)`);
    onClose();
  };

  const pinnedItems = items.filter((i) => i.pinned);
  const unpinnedItems = items.filter((i) => !i.pinned);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] p-4">
          {/* Overlay desenfocado */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-md"
          />

          {/* Caja Flotante cmdk */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ type: 'spring', stiffness: 450, damping: 32 }}
            className="relative w-full max-w-xl bg-zinc-950/95 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden z-10 text-zinc-100"
          >
            <Command
              className="w-full flex flex-col focus:outline-none"
              loop
            >
              {/* Buscador Superior */}
              <div className="flex items-center px-4 py-3.5 border-b border-zinc-800/80 gap-3">
                <Search className="w-5 h-5 text-zinc-400 shrink-0" />
                <Command.Input
                  autoFocus
                  placeholder="Buscar cuenta por nombre, correo o etiqueta..."
                  className="w-full bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
                />
                <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 rounded">
                  ESC para cerrar
                </kbd>
              </div>

              {/* Lista de Resultados */}
              <Command.List className="max-h-[60vh] overflow-y-auto p-2 text-xs space-y-1">
                <Command.Empty className="py-8 text-center text-zinc-500">
                  No se encontraron resultados para esta búsqueda.
                </Command.Empty>

                {/* Acciones Rápidas */}
                <Command.Group heading="Acciones del Sistema" className="text-zinc-500 font-semibold px-2 py-1">
                  <Command.Item
                    onSelect={() => {
                      onClose();
                      onOpenAddAccount();
                    }}
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-zinc-300 hover:text-white hover:bg-violet-600/20 aria-selected:bg-violet-600/20 aria-selected:text-white cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <PlusCircle className="w-4 h-4 text-violet-400" />
                      <span className="font-medium text-xs">Vincular Nueva Cuenta 2FA</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">QR / Manual</span>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => {
                      onClose();
                      onOpenGenerator();
                    }}
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-zinc-300 hover:text-white hover:bg-violet-600/20 aria-selected:bg-violet-600/20 aria-selected:text-white cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <KeyRound className="w-4 h-4 text-emerald-400" />
                      <span className="font-medium text-xs">Generador de Contraseñas</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">CSPRNG</span>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => {
                      onClose();
                      onTriggerSync();
                    }}
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-zinc-300 hover:text-white hover:bg-violet-600/20 aria-selected:bg-violet-600/20 aria-selected:text-white cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <RefreshCw className="w-4 h-4 text-cyan-400" />
                      <span className="font-medium text-xs">Sincronizar Bóveda con Cloudflare D1</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">Push & Pull</span>
                  </Command.Item>

                  <Command.Item
                    onSelect={() => {
                      onClose();
                      onLockVault();
                    }}
                    className="flex items-center justify-between px-3 py-2 rounded-xl text-zinc-300 hover:text-white hover:bg-rose-950/40 aria-selected:bg-rose-950/40 aria-selected:text-rose-300 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Lock className="w-4 h-4 text-rose-400" />
                      <span className="font-medium text-xs">Bloquear Bóveda Ahora</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">Purgar RAM</span>
                  </Command.Item>
                </Command.Group>

                {/* Cuentas Fijadas */}
                {pinnedItems.length > 0 && (
                  <Command.Group heading="Cuentas Fijadas" className="text-zinc-500 font-semibold px-2 py-1 mt-2">
                    {pinnedItems.map((item) => {
                      const code = tokens[item.id] || '------';
                      return (
                        <Command.Item
                          key={item.id}
                          value={`${item.issuer} ${item.account} ${item.tags?.join(' ') || ''}`}
                          onSelect={() => handleCopyAndClose(item)}
                          className="flex items-center justify-between px-3 py-2.5 rounded-xl text-zinc-200 hover:text-white hover:bg-zinc-800/70 aria-selected:bg-zinc-850 aria-selected:text-white cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <BrandIcon issuer={item.issuer} iconUrl={item.icon_url} size={28} className="shrink-0" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-xs text-white truncate">
                                  {item.issuer}
                                </span>
                                <Pin className="w-3 h-3 text-violet-400 shrink-0 rotate-45" />
                              </div>
                              <p className="text-[11px] text-zinc-400 truncate">{item.account}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 font-mono text-sm font-bold text-violet-400 tracking-wider">
                            <span>{code}</span>
                            <Copy className="w-3.5 h-3.5 text-zinc-500" />
                          </div>
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                )}

                {/* Todas las Cuentas */}
                <Command.Group heading="Todas las Cuentas" className="text-zinc-500 font-semibold px-2 py-1 mt-2">
                  {unpinnedItems.map((item) => {
                    const code = tokens[item.id] || '------';
                    return (
                      <Command.Item
                        key={item.id}
                        value={`${item.issuer} ${item.account} ${item.tags?.join(' ') || ''}`}
                        onSelect={() => handleCopyAndClose(item)}
                        className="flex items-center justify-between px-3 py-2.5 rounded-xl text-zinc-200 hover:text-white hover:bg-zinc-800/70 aria-selected:bg-zinc-850 aria-selected:text-white cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <BrandIcon issuer={item.issuer} iconUrl={item.icon_url} size={28} className="shrink-0" />
                          <div className="min-w-0">
                            <span className="font-semibold text-xs text-white truncate block">
                              {item.issuer}
                            </span>
                            <p className="text-[11px] text-zinc-400 truncate">{item.account}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 font-mono text-sm font-bold text-zinc-300 tracking-wider">
                          <span>{code}</span>
                          <Copy className="w-3.5 h-3.5 text-zinc-500" />
                        </div>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              </Command.List>

              {/* Barra de Atajos en Pie */}
              <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-800/80 bg-zinc-900/40 text-[11px] text-zinc-400">
                <span>Navegar con <kbd className="px-1 py-0.5 rounded bg-zinc-800 font-mono text-[10px]">↑</kbd> <kbd className="px-1 py-0.5 rounded bg-zinc-800 font-mono text-[10px]">↓</kbd></span>
                <span>Presiona <kbd className="px-1.5 py-0.5 rounded bg-zinc-800 font-mono text-[10px] text-zinc-200">Enter</kbd> para copiar</span>
              </div>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
