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
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { BrandIcon } from './BrandIcon.tsx';
import { generateTotp, getTotpRemainingSeconds, getTotpProgress } from '../lib/crypto/totp.ts';
import { getTimeDriftOffsetMs } from '../lib/sync/timeSync.ts';
import { copyToClipboardSecurely } from '../lib/security/clipboardGuard.ts';
import type { VaultItem } from '../types/vault.ts';

interface TotpCardProps {
  item: VaultItem;
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleRecoveryCode: (id: string, codeIndex: number) => void;
  onEdit?: (item: VaultItem) => void;
}

export function TotpCard({
  item,
  onTogglePin,
  onDelete,
  onToggleRecoveryCode,
  onEdit,
}: TotpCardProps) {
  const [token, setToken] = useState<string>('------');
  const [remaining, setRemaining] = useState<number>(30);
  const [progress, setProgress] = useState<number>(1);
  const [isCopied, setIsCopied] = useState(false);

  // Recovery Codes state
  const [showRecovery, setShowRecovery] = useState(false);
  const [revealCodes, setRevealCodes] = useState(false);
  const [copiedCodeIdx, setCopiedCodeIdx] = useState<number | null>(null);

  const period = item.period || 30;

  // Actualización del token TOTP y temporizador circular
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

  // Copiar código TOTP principal
  const handleCopyToken = async () => {
    if (token === '------' || token === 'ERROR') return;
    await copyToClipboardSecurely(token, 45000);

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(40);
      } catch {}
    }

    setIsCopied(true);
    toast.success(`Código de ${item.issuer} copiado (se borrará en 45s)`);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Copiar código de recuperación individual
  const handleCopyRecoveryCode = async (code: string, idx: number) => {
    await copyToClipboardSecurely(code, 45000);
    setCopiedCodeIdx(idx);
    toast.success('Clave de recuperación copiada (se borrará en 45s)');
    setTimeout(() => setCopiedCodeIdx(null), 1500);
  };

  // Copiar secreto Base32
  const handleCopyBase32 = async () => {
    await copyToClipboardSecurely(item.secret, 45000);
    toast.success('Secreto Base32 copiado (se borrará en 45s)');
  };

  // Formateo del token: ej. "123 456" o "1234 5678"
  const formattedToken =
    token.length === 8
      ? `${token.slice(0, 4)} ${token.slice(4)}`
      : token.length === 6
      ? `${token.slice(0, 3)} ${token.slice(3)}`
      : token;

  // Dinámica de color del temporizador circular
  let timerColor = '#10b981'; // Emerald (> 10s)
  let timerTextClass = 'text-emerald-400';
  if (remaining <= 5) {
    timerColor = '#ef4444'; // Rose / Red (<= 5s)
    timerTextClass = 'text-rose-400 animate-pulse';
  } else if (remaining <= 10) {
    timerColor = '#f59e0b'; // Amber (<= 10s)
    timerTextClass = 'text-amber-400';
  }

  const radius = 13;
  const circumference = 2 * Math.PI * radius; // ~81.68
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 450, damping: 30 }}
      className={`group relative rounded-2xl bg-zinc-900/60 border ${
        item.pinned ? 'border-violet-500/40 shadow-lg shadow-violet-950/20' : 'border-zinc-800/80'
      } backdrop-blur-xl p-5 hover:border-zinc-700/80 transition-all flex flex-col justify-between overflow-hidden`}
    >
      {/* Glow ambiental tenue en pinned */}
      {item.pinned && (
        <div className="absolute top-0 right-0 w-32 h-32 bg-violet-600/10 rounded-full blur-2xl pointer-events-none" />
      )}

      {/* Cabecera de la Tarjeta */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <BrandIcon issuer={item.issuer} iconUrl={item.icon_url} size={40} className="shrink-0" />
            <div className="min-w-0">
              <h3 className="font-semibold text-sm md:text-base text-zinc-100 tracking-tight truncate">
                {item.issuer}
              </h3>
              <p className="text-xs text-zinc-400 truncate max-w-[170px]" title={item.account}>
                {item.account}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onTogglePin(item.id)}
              className={`p-1.5 rounded-lg transition-colors ${
                item.pinned
                  ? 'text-violet-400 bg-violet-500/10'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
              }`}
              title={item.pinned ? 'Desfijar cuenta' : 'Fijar cuenta arriba'}
            >
              <Pin className={`w-4 h-4 transition-transform ${item.pinned ? 'rotate-45' : ''}`} />
            </button>

            {/* Dropdown contextual Radix */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </DropdownMenu.Trigger>

              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  className="w-48 rounded-xl bg-zinc-950 border border-zinc-800 p-1.5 shadow-2xl z-50 text-xs text-zinc-300 animate-in fade-in zoom-in-95 duration-100"
                >
                  <DropdownMenu.Item
                    onClick={() => onEdit?.(item)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 hover:text-white cursor-pointer outline-none transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-zinc-400" />
                    Editar / Códigos de Respaldo
                  </DropdownMenu.Item>

                  <DropdownMenu.Item
                    onClick={handleCopyBase32}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 hover:text-white cursor-pointer outline-none transition-colors"
                  >
                    <Key className="w-3.5 h-3.5 text-zinc-400" />
                    Copiar Secreto Base32
                  </DropdownMenu.Item>

                  <DropdownMenu.Separator className="h-px bg-zinc-800 my-1" />

                  <DropdownMenu.Item
                    onClick={() => onDelete(item.id)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-rose-950/50 text-rose-400 hover:text-rose-300 cursor-pointer outline-none transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Eliminar Cuenta
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>

        {/* Display del Código TOTP y Temporizador */}
        <div
          onClick={handleCopyToken}
          className="group/code relative flex items-center justify-between p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800/80 hover:border-violet-500/40 cursor-pointer transition-all active:scale-[0.99] select-none"
          title="Haz clic para copiar el código"
        >
          <div className="flex flex-col">
            <span className="font-mono text-2xl md:text-3xl font-bold tracking-widest text-white group-hover/code:text-violet-300 transition-colors">
              {formattedToken}
            </span>
            <span className="text-[10px] text-zinc-500 flex items-center gap-1 mt-0.5 font-mono">
              {item.algorithm || 'SHA1'} · {period}s
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Temporizador Circular SVG */}
            <div className="relative w-9 h-9 flex items-center justify-center">
              <svg className="w-9 h-9 -rotate-90">
                {/* Círculo de fondo */}
                <circle
                  cx="18"
                  cy="18"
                  r={radius}
                  fill="none"
                  stroke="#27272a"
                  strokeWidth="2.5"
                />
                {/* Círculo de progreso dinámico */}
                <circle
                  cx="18"
                  cy="18"
                  r={radius}
                  fill="none"
                  stroke={timerColor}
                  strokeWidth="2.5"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  className="transition-[stroke-dashoffset] duration-500 ease-linear"
                />
              </svg>
              <span className={`absolute font-mono text-[11px] font-bold ${timerTextClass}`}>
                {remaining}
              </span>
            </div>

            {/* Icono de feedback copiado */}
            <div
              className={`p-1.5 rounded-lg transition-colors ${
                isCopied ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-500 group-hover/code:text-zinc-300'
              }`}
            >
              {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </div>
          </div>
        </div>

        {/* Tags opcionales */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-zinc-800/70 text-zinc-300 border border-zinc-700/50"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Botón rápido para agregar códigos de respaldo si la cuenta aún no tiene */}
      {(!item.recovery_codes || item.recovery_codes.length === 0) && (
        <div className="mt-3 pt-2.5 border-t border-zinc-800/60 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onEdit?.(item)}
            className="text-[11px] text-zinc-400 hover:text-amber-300 flex items-center gap-1.5 transition-colors group/btn py-0.5"
            title="Añadir códigos de recuperación entregados por el servicio"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-500/70 group-hover/btn:text-amber-400" />
            <span>+ Agregar códigos de respaldo</span>
          </button>
        </div>
      )}

      {/* Sección Colapsable de Recovery Codes */}
      {item.recovery_codes && item.recovery_codes.length > 0 && (
        <div className="mt-4 pt-3 border-t border-zinc-800/80">
          <button
            type="button"
            onClick={() => setShowRecovery(!showRecovery)}
            className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-200 transition-colors py-1"
          >
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              Claves de recuperación ({item.recovery_codes.length})
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                showRecovery ? 'rotate-180 text-violet-400' : ''
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
                <div className="p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/60 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 pb-1 border-b border-zinc-800/60">
                    <span>Marca como usado o haz clic para copiar</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onEdit?.(item)}
                        className="text-amber-400 hover:text-amber-300 flex items-center gap-1 text-[11px] font-sans"
                        title="Gestionar o agregar más códigos"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Gestionar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRevealCodes(!revealCodes)}
                        className="text-violet-400 hover:text-violet-300 flex items-center gap-1"
                      >
                        {revealCodes ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {revealCodes ? 'Ocultar' : 'Revelar'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5 max-h-36 overflow-y-auto pr-1">
                    {item.recovery_codes.map((rc, idx) => {
                      const isUsed = rc.used;
                      const isThisCopied = copiedCodeIdx === idx;
                      const displayCode = revealCodes ? rc.code : '••••••••••••';

                      return (
                        <div
                          key={idx}
                          className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                            isUsed
                              ? 'bg-zinc-900/30 text-zinc-600 line-through'
                              : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-850'
                          }`}
                        >
                          <span
                            onClick={() => !isUsed && handleCopyRecoveryCode(rc.code, idx)}
                            className="cursor-pointer tracking-wider truncate mr-2"
                            title={isUsed ? 'Código ya utilizado' : 'Clic para copiar'}
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
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}

                            <input
                              type="checkbox"
                              checked={isUsed}
                              onChange={() => onToggleRecoveryCode(item.id, idx)}
                              title={isUsed ? 'Marcar como disponible' : 'Marcar como usado'}
                              className="rounded bg-zinc-800 border-zinc-700 text-violet-600 focus:ring-0 cursor-pointer"
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
  );
}
