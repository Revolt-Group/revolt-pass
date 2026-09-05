import { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Copy, Check, RotateCw, X, KeyRound, ShieldAlert, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { useTranslation } from '../i18n/index.ts';

interface PasswordGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CHAR_POOLS = {
  uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ', // Excluding O, I to avoid visual ambiguity
  lowercase: 'abcdefghijkmnopqrstuvwxyz', // Excluding l
  numbers: '23456789', // Excluding 0, 1
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  ambiguousUpper: 'IO',
  ambiguousLower: 'l',
  ambiguousNumbers: '01',
};

export function PasswordGeneratorModal({ isOpen, onClose }: PasswordGeneratorModalProps) {
  const { t } = useTranslation();
  const [length, setLength] = useState(20);
  const [includeUpper, setIncludeUpper] = useState(true);
  const [includeLower, setIncludeLower] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [avoidAmbiguous, setAvoidAmbiguous] = useState(true);

  const [password, setPassword] = useState('');
  const [isCopied, setIsCopied] = useState(false);
  const [isRotating, setIsRotating] = useState(false);

  const generatePassword = useCallback(() => {
    let pool = '';
    if (includeUpper) {
      pool += CHAR_POOLS.uppercase + (avoidAmbiguous ? '' : CHAR_POOLS.ambiguousUpper);
    }
    if (includeLower) {
      pool += CHAR_POOLS.lowercase + (avoidAmbiguous ? '' : CHAR_POOLS.ambiguousLower);
    }
    if (includeNumbers) {
      pool += CHAR_POOLS.numbers + (avoidAmbiguous ? '' : CHAR_POOLS.ambiguousNumbers);
    }
    if (includeSymbols) {
      pool += CHAR_POOLS.symbols;
    }

    if (!pool) {
      setPassword('');
      return;
    }

    const randomValues = new Uint32Array(length);
    crypto.getRandomValues(randomValues);

    let result = '';
    for (let i = 0; i < length; i++) {
      result += pool[randomValues[i] % pool.length];
    }

    setPassword(result);
  }, [length, includeUpper, includeLower, includeNumbers, includeSymbols, avoidAmbiguous]);

  useEffect(() => {
    if (isOpen) {
      generatePassword();
      setIsCopied(false);
    }
  }, [isOpen, generatePassword]);

  // Shannon entropy calculation: E = L * log2(N)
  let poolSize = 0;
  if (includeUpper) poolSize += avoidAmbiguous ? 24 : 26;
  if (includeLower) poolSize += avoidAmbiguous ? 25 : 26;
  if (includeNumbers) poolSize += avoidAmbiguous ? 8 : 10;
  if (includeSymbols) poolSize += CHAR_POOLS.symbols.length;

  const entropyBits = poolSize > 0 ? Math.round(length * Math.log2(poolSize)) : 0;

  let strengthLabel = t('generator.strengthWeak');
  let strengthColor = 'bg-rose-500 text-rose-400 border-rose-500/20';
  let strengthPercent = Math.min(100, Math.round((entropyBits / 120) * 100));

  if (entropyBits >= 80) {
    strengthLabel = t('generator.strengthArmored');
    strengthColor = 'bg-emerald-500 text-emerald-400 border-emerald-500/20';
  } else if (entropyBits >= 55) {
    strengthLabel = t('generator.strengthStrong');
    strengthColor = 'bg-violet-500 text-violet-400 border-violet-500/20';
  } else if (entropyBits >= 40) {
    strengthLabel = t('generator.strengthModerate');
    strengthColor = 'bg-amber-500 text-amber-400 border-amber-500/20';
  }

  const handleCopy = async () => {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    setIsCopied(true);
    toast.success(t('generator.copiedPassword'));
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleRegenerate = () => {
    setIsRotating(true);
    generatePassword();
    setTimeout(() => setIsRotating(false), 300);
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AnimatePresence>
        {isOpen && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/70 backdrop-blur-md z-50"
              />
            </Dialog.Overlay>

            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-[#0f1013] border border-white/[0.08] hairline-top rounded-xl p-6 shadow-[0_24px_68px_rgba(0,0,0,0.8)] z-50 text-zinc-100 focus:outline-none"
              >
                <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-[#16181d] border border-white/[0.1] hairline-top text-white">
                      <KeyRound className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <Dialog.Title className="text-base font-semibold tracking-tight text-white">
                        {t('generator.title')}
                      </Dialog.Title>
                      <Dialog.Description className="text-xs text-zinc-400">
                        {t('generator.subtitle')}
                      </Dialog.Description>
                    </div>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </Dialog.Close>
                </div>

                {/* Generated password display */}
                <div className="mt-5 relative">
                  <div className="flex items-center justify-between p-3.5 bg-[#08090a] border border-white/[0.08] rounded-lg font-mono text-sm md:text-base break-all select-all text-white">
                    <span className="tracking-wider pr-10">{password}</span>
                    <div className="flex items-center gap-1.5 ml-2 absolute right-2">
                      <button
                        type="button"
                        onClick={handleRegenerate}
                        className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-[#16181d] transition-colors"
                        title={t('generator.regenerate')}
                      >
                        <motion.div animate={{ rotate: isRotating ? 360 : 0 }}>
                          <RotateCw className="w-4 h-4" />
                        </motion.div>
                      </button>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className={`p-1.5 rounded-md transition-colors ${
                          isCopied
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'text-zinc-400 hover:text-white hover:bg-[#16181d]'
                        }`}
                        title={t('generator.copyPassword')}
                      >
                        {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Strength and entropy bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-zinc-400 flex items-center gap-1.5">
                        {entropyBits >= 55 ? (
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        {t('generator.strengthTitle')}: <strong className="text-zinc-200">{strengthLabel}</strong>
                      </span>
                      <span className="text-zinc-400 font-mono text-[11px]">
                        {entropyBits} {t('generator.bitsOfEntropy')}
                      </span>
                    </div>
                    <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full ${strengthColor.split(' ')[0]}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${strengthPercent}%` }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                      />
                    </div>
                  </div>
                </div>

                {/* Controls and Settings */}
                <div className="mt-5 space-y-3.5 text-sm">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-zinc-300">
                        {t('generator.lengthLabel')}
                      </label>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-[#16181d] border border-white/[0.08] text-white font-medium">
                        {length} {t('generator.charactersSuffix')}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="8"
                      max="64"
                      value={length}
                      onChange={(e) => setLength(Number(e.target.value))}
                      className="w-full h-1.5 bg-[#16181d] rounded-lg appearance-none cursor-pointer accent-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <label className="flex items-center gap-2 p-2 rounded-lg bg-[#16181d]/50 border border-white/[0.06] cursor-pointer hover:bg-[#16181d] transition-colors">
                      <input
                        type="checkbox"
                        checked={includeUpper}
                        onChange={(e) => setIncludeUpper(e.target.checked)}
                        className="rounded bg-[#08090a] border-white/20 text-white focus:ring-0 cursor-pointer"
                      />
                      <span className="text-xs text-zinc-300 font-medium">{t('generator.uppercase')}</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-lg bg-[#16181d]/50 border border-white/[0.06] cursor-pointer hover:bg-[#16181d] transition-colors">
                      <input
                        type="checkbox"
                        checked={includeLower}
                        onChange={(e) => setIncludeLower(e.target.checked)}
                        className="rounded bg-[#08090a] border-white/20 text-white focus:ring-0 cursor-pointer"
                      />
                      <span className="text-xs text-zinc-300 font-medium">{t('generator.lowercase')}</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-lg bg-[#16181d]/50 border border-white/[0.06] cursor-pointer hover:bg-[#16181d] transition-colors">
                      <input
                        type="checkbox"
                        checked={includeNumbers}
                        onChange={(e) => setIncludeNumbers(e.target.checked)}
                        className="rounded bg-[#08090a] border-white/20 text-white focus:ring-0 cursor-pointer"
                      />
                      <span className="text-xs text-zinc-300 font-medium">{t('generator.numbers')}</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-lg bg-[#16181d]/50 border border-white/[0.06] cursor-pointer hover:bg-[#16181d] transition-colors">
                      <input
                        type="checkbox"
                        checked={includeSymbols}
                        onChange={(e) => setIncludeSymbols(e.target.checked)}
                        className="rounded bg-[#08090a] border-white/20 text-white focus:ring-0 cursor-pointer"
                      />
                      <span className="text-xs text-zinc-300 font-medium">{t('generator.symbols')}</span>
                    </label>
                  </div>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-[#16181d]/30 border border-white/[0.06] cursor-pointer hover:bg-[#16181d] transition-colors">
                    <input
                      type="checkbox"
                      checked={avoidAmbiguous}
                      onChange={(e) => setAvoidAmbiguous(e.target.checked)}
                      className="rounded bg-[#08090a] border-white/20 text-white focus:ring-0 cursor-pointer"
                    />
                    <span className="text-xs text-zinc-400">
                      {t('generator.avoidAmbiguous')}
                    </span>
                  </label>
                </div>

                <div className="mt-5 flex items-center justify-end gap-2.5 pt-3 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
                  >
                    {t('common.close')}
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-4 py-1.5 text-xs font-medium rounded-lg bg-white hover:bg-zinc-200 text-black shadow-sm flex items-center gap-1.5 transition-all active:scale-[0.99]"
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5 text-black" /> : <Copy className="w-3.5 h-3.5 text-black" />}
                    {isCopied ? t('generator.copiedPassword') : t('generator.copyPassword')}
                  </button>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
