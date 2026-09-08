import * as Dialog from '@radix-ui/react-dialog';
import { Printer, X, ShieldAlert, Key, Globe, User, Hash, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { printEmergencyKit } from '../lib/utils/emergencyKit.ts';
import { useTranslation } from '../i18n/index.ts';

interface EmergencyKitModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  username: string;
  vaultVersion?: number;
  kdfAlgorithm?: string;
}

export function EmergencyKitModal({
  isOpen,
  onClose,
  userId,
  username,
  vaultVersion = 1,
  kdfAlgorithm = 'argon2id',
}: EmergencyKitModalProps) {
  const { t } = useTranslation();

  const handlePrint = () => {
    printEmergencyKit({
      userId,
      username,
      vaultVersion,
      kdfAlgorithm,
      instanceUrl: typeof window !== 'undefined' ? window.location.origin : 'https://pass.revoltgroup.com.ar',
    });
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
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
              />
            </Dialog.Overlay>
            <div className="fixed inset-0 flex items-center justify-center p-4 z-50 pointer-events-none">
              <Dialog.Content asChild>
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 8 }}
                  className="w-full max-w-lg bg-[#0f1013] border border-white/[0.1] rounded-2xl shadow-2xl p-6 pointer-events-auto max-h-[90vh] overflow-y-auto"
                >
                  <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                        <Key className="w-5 h-5" />
                      </div>
                      <div>
                        <Dialog.Title className="text-base font-semibold text-white">
                          Kit de Emergencia Revolt Pass
                        </Dialog.Title>
                        <Dialog.Description className="text-xs text-zinc-400">
                          Documento físico confidencial de recuperación de cuenta
                        </Dialog.Description>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Zero-Knowledge Security Notice */}
                  <div className="my-5 p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-xs text-amber-200/90 flex gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-semibold text-amber-300">Garantía Criptográfica Zero-Knowledge</div>
                      <p className="text-[11px] leading-relaxed text-zinc-300">
                        Por diseño de seguridad estricto, <strong>tu Contraseña Maestra no se almacena en el servidor y nunca se imprimirá pre-rellenada</strong>. Al imprimir este kit, deberás escribirla a mano con tinta indeleble y custodiar la hoja en un lugar físico bajo llave.
                      </p>
                    </div>
                  </div>

                  {/* Summary Details Box */}
                  <div className="space-y-2.5 bg-[#08090a] border border-white/[0.08] p-4 rounded-xl text-xs">
                    <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-zinc-400 flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-zinc-500" />
                        Instancia
                      </span>
                      <span className="font-mono text-zinc-200 truncate max-w-[240px]">
                        {typeof window !== 'undefined' ? window.location.origin : 'https://pass.revoltgroup.com.ar'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-zinc-400 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-zinc-500" />
                        Usuario
                      </span>
                      <span className="font-mono font-medium text-white">{username}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-zinc-400 flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-zinc-500" />
                        User ID
                      </span>
                      <span className="font-mono text-[11px] text-zinc-400 truncate max-w-[200px]">{userId}</span>
                    </div>
                    <div className="flex items-center justify-between py-1">
                      <span className="text-zinc-400">Algoritmo KDF</span>
                      <span className="font-mono text-zinc-300">
                        {kdfAlgorithm === 'argon2id' ? 'Argon2id (64MB RAM)' : 'PBKDF2 (600.000)'}
                      </span>
                    </div>
                  </div>

                  {/* Instructions preview */}
                  <div className="mt-4 p-3 bg-white/[0.02] border border-white/[0.05] rounded-xl text-[11px] text-zinc-400 space-y-1">
                    <div className="font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Incluye en el documento:
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-zinc-400 pl-1">
                      <li>Código QR de acceso directo a la instancia</li>
                      <li>Recuadro designado para anotación manual con tinta</li>
                      <li>Instrucciones paso a paso para restaurar la bóveda en caso de desastre</li>
                    </ul>
                  </div>

                  {/* Modal Footer Actions */}
                  <div className="mt-6 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-white/[0.05] transition-colors"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={handlePrint}
                      className="px-4 py-2 bg-white hover:bg-zinc-200 text-black rounded-xl text-xs font-semibold shadow-md flex items-center gap-2 transition-all active:scale-[0.99]"
                    >
                      <Printer className="w-4 h-4 text-black" />
                      <span>Imprimir / Guardar como PDF</span>
                    </button>
                  </div>
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
