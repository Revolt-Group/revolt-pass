import { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Copy, Check, RotateCw, X, KeyRound, ShieldAlert, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

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

  let strengthLabel = 'Débil';
  let strengthColor = 'bg-rose-500 text-rose-400 border-rose-500/20';
  let strengthPercent = Math.min(100, Math.round((entropyBits / 120) * 100));

  if (entropyBits >= 80) {
    strengthLabel = 'Blindada (Militar)';
    strengthColor = 'bg-emerald-500 text-emerald-400 border-emerald-500/20';
  } else if (entropyBits >= 55) {
    strengthLabel = 'Fuerte';
    strengthColor = 'bg-violet-500 text-violet-400 border-violet-500/20';
  } else if (entropyBits >= 40) {
    strengthLabel = 'Moderada';
    strengthColor = 'bg-amber-500 text-amber-400 border-amber-500/20';
  }

  const handleCopy = async () => {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    setIsCopied(true);
    toast.success('Contraseña copiada al portapapeles');
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
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-zinc-950 border border-zinc-800/90 rounded-2xl p-6 shadow-2xl z-50 text-zinc-100 focus:outline-none"
              >
                <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-violet-600/10 border border-violet-500/20 text-violet-400">
                      <KeyRound className="w-5 h-5" />
                    </div>
                    <div>
                      <Dialog.Title className="text-base font-semibold tracking-tight text-white">
                        Generador Criptográfico de Contraseñas
                      </Dialog.Title>
                      <Dialog.Description className="text-xs text-zinc-400">
                        Entropía pura generada con CSPRNG en hardware
                      </Dialog.Description>
                    </div>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </Dialog.Close>
                </div>

                {/* Generated password display */}
                <div className="mt-5 relative">
                  <div className="flex items-center justify-between p-3.5 bg-zinc-900/90 border border-zinc-800 rounded-xl font-mono text-sm md:text-base break-all select-all text-zinc-100 shadow-inner">
                    <span className="tracking-wider pr-10">{password}</span>
                    <div className="flex items-center gap-1.5 ml-2 absolute right-2">
                      <button
                        type="button"
                        onClick={handleRegenerate}
                        className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                        title="Regenerar contraseña"
                      >
                        <motion.div animate={{ rotate: isRotating ? 360 : 0 }}>
                          <RotateCw className="w-4 h-4" />
                        </motion.div>
                      </button>
                      <button
                        type="button"
                        onClick={handleCopy}
                        className={`p-2 rounded-lg transition-colors ${
                          isCopied
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                        }`}
                        title="Copiar al portapapeles"
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
                        Fuerza: <strong className="text-zinc-200">{strengthLabel}</strong>
                      </span>
                      <span className="text-zinc-400 font-mono text-[11px]">
                        {entropyBits} bits de entropía
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
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
                <div className="mt-6 space-y-4 text-sm">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-zinc-300">
                        Longitud de la contraseña
                      </label>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-zinc-800 text-violet-300 font-bold">
                        {length} caracteres
                      </span>
                    </div>
                    <input
                      type="range"
                      min="8"
                      max="64"
                      value={length}
                      onChange={(e) => setLength(Number(e.target.value))}
                      className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-violet-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 pt-2">
                    <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 cursor-pointer hover:bg-zinc-900 transition-colors">
                      <input
                        type="checkbox"
                        checked={includeUpper}
                        onChange={(e) => setIncludeUpper(e.target.checked)}
                        className="rounded bg-zinc-800 border-zinc-700 text-violet-600 focus:ring-0 cursor-pointer"
                      />
                      <span className="text-xs text-zinc-300 font-medium">Mayúsculas (A-Z)</span>
                    </label>

                    <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 cursor-pointer hover:bg-zinc-900 transition-colors">
                      <input
                        type="checkbox"
                        checked={includeLower}
                        onChange={(e) => setIncludeLower(e.target.checked)}
                        className="rounded bg-zinc-800 border-zinc-700 text-violet-600 focus:ring-0 cursor-pointer"
                      />
                      <span className="text-xs text-zinc-300 font-medium">Minúsculas (a-z)</span>
                    </label>

                    <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 cursor-pointer hover:bg-zinc-900 transition-colors">
                      <input
                        type="checkbox"
                        checked={includeNumbers}
                        onChange={(e) => setIncludeNumbers(e.target.checked)}
                        className="rounded bg-zinc-800 border-zinc-700 text-violet-600 focus:ring-0 cursor-pointer"
                      />
                      <span className="text-xs text-zinc-300 font-medium">Números (0-9)</span>
                    </label>

                    <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-zinc-900/60 border border-zinc-800/80 cursor-pointer hover:bg-zinc-900 transition-colors">
                      <input
                        type="checkbox"
                        checked={includeSymbols}
                        onChange={(e) => setIncludeSymbols(e.target.checked)}
                        className="rounded bg-zinc-800 border-zinc-700 text-violet-600 focus:ring-0 cursor-pointer"
                      />
                      <span className="text-xs text-zinc-300 font-medium">Símbolos (!@#$%)</span>
                    </label>
                  </div>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-zinc-900/40 border border-zinc-800/60 cursor-pointer hover:bg-zinc-900 transition-colors">
                    <input
                      type="checkbox"
                      checked={avoidAmbiguous}
                      onChange={(e) => setAvoidAmbiguous(e.target.checked)}
                      className="rounded bg-zinc-800 border-zinc-700 text-violet-600 focus:ring-0 cursor-pointer"
                    />
                    <span className="text-xs text-zinc-400">
                      Evitar caracteres ambiguos (<code className="text-zinc-300 font-mono">1, l, I, 0, O</code>)
                    </span>
                  </label>
                </div>

                <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-zinc-800/80">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-900 transition-colors"
                  >
                    Cerrar
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-5 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-600/20 flex items-center gap-2 transition-all active:scale-95"
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {isCopied ? '¡Copiado!' : 'Copiar Contraseña'}
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
