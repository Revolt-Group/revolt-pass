import { useState, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  Plus,
  Trash2,
  Copy,
  Check,
  Tag,
  FileText,
  User,
  Building,
  CheckCircle2,
  Upload,
  Link,
  ImageIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { BrandIcon } from './BrandIcon.tsx';
import { copyToClipboardSecurely } from '../lib/security/clipboardGuard.ts';
import { resizeImageFile } from '../lib/utils/image.ts';
import type { VaultItem, RecoveryCode } from '../types/vault.ts';

interface EditAccountModalProps {
  item: VaultItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedItem: VaultItem) => Promise<void>;
}

export function EditAccountModal({
  item,
  isOpen,
  onClose,
  onSave,
}: EditAccountModalProps) {
  const [issuer, setIssuer] = useState('');
  const [account, setAccount] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<RecoveryCode[]>([]);
  const [codeInput, setCodeInput] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (item && isOpen) {
      setIssuer(item.issuer || '');
      setAccount(item.account || '');
      setIconUrl(item.icon_url || '');
      setShowUrlInput(false);
      setNotes(item.notes || '');
      setTagsInput(item.tags?.join(', ') || '');
      setRecoveryCodes(item.recovery_codes ? [...item.recovery_codes] : []);
      setCodeInput('');
      setCopiedIndex(null);
    }
  }, [item, isOpen]);

  // Manejar selección de archivo de imagen
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const dataUrl = await resizeImageFile(file, 96);
      setIconUrl(dataUrl);
      toast.success('Foto / Logo cargado y optimizado para la bóveda');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar la imagen';
      toast.error(msg);
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Manejar pegado de imagen desde el portapapeles (Ctrl+V)
  const handlePasteCapture = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          setIsUploadingImage(true);
          try {
            const dataUrl = await resizeImageFile(file, 96);
            setIconUrl(dataUrl);
            toast.success('Imagen pegada y guardada como logo');
          } catch {
            toast.error('No se pudo procesar la imagen pegada');
          } finally {
            setIsUploadingImage(false);
          }
          return;
        }
      }
    }
  };

  // Agregar uno o múltiples códigos (soporta pegado masivo separado por saltos de línea, comas o espacios)
  const handleAddCodes = () => {
    if (!codeInput.trim()) return;

    const parsed = codeInput
      .split(/[\n,;]+/)
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    if (parsed.length === 0) return;

    const newEntries: RecoveryCode[] = parsed.map((code) => ({
      code,
      used: false,
      created_at: Date.now(),
    }));

    setRecoveryCodes((prev) => [...prev, ...newEntries]);
    setCodeInput('');
    toast.success(
      newEntries.length === 1
        ? 'Código de respaldo agregado'
        : `${newEntries.length} códigos de respaldo agregados`
    );
  };

  const handleRemoveCode = (index: number) => {
    setRecoveryCodes((prev) => prev.filter((_, i) => i !== index));
  };

  const handleToggleCodeUsed = (index: number) => {
    setRecoveryCodes((prev) =>
      prev.map((rc, i) => (i === index ? { ...rc, used: !rc.used } : rc))
    );
  };

  const handleCopyCode = async (code: string, idx: number) => {
    await copyToClipboardSecurely(code, 45000);
    setCopiedIndex(idx);
    toast.success('Código copiado al portapapeles');
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;

    if (!issuer.trim()) {
      toast.error('El nombre del servicio es obligatorio');
      return;
    }

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter((t) => t.length > 0);

    const updatedItem: VaultItem = {
      ...item,
      issuer: issuer.trim(),
      account: account.trim(),
      icon_url: iconUrl.trim() || undefined,
      notes: notes.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      recovery_codes: recoveryCodes.length > 0 ? recoveryCodes : undefined,
      updated_at: Date.now(),
    };

    setIsSaving(true);
    try {
      await onSave(updatedItem);
      onClose();
    } catch {
      toast.error('Error al guardar los cambios en la bóveda');
    } finally {
      setIsSaving(false);
    }
  };

  if (!item) return null;

  const usedCount = recoveryCodes.filter((c) => c.used).length;
  const availableCount = recoveryCodes.length - usedCount;

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
                className="fixed inset-0 bg-black/80 backdrop-blur-md z-50"
              />
            </Dialog.Overlay>

            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                onPaste={handlePasteCapture}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl bg-zinc-950 border border-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_24px_68px_rgba(0,0,0,0.8)] rounded-2xl p-6 z-50 text-zinc-100 max-h-[90vh] overflow-y-auto focus:outline-none"
              >
                {/* Cabecera del Modal */}
                <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
                  <div className="flex items-center gap-3">
                    <BrandIcon issuer={issuer || item.issuer} iconUrl={iconUrl} size={42} className="shrink-0" />
                    <div>
                      <Dialog.Title className="text-base font-semibold tracking-tight text-white flex items-center gap-2">
                        <span>Editar Cuenta & Personalización</span>
                      </Dialog.Title>
                      <Dialog.Description className="text-xs text-zinc-400 font-mono">
                        {item.issuer} {item.account ? `· ${item.account}` : ''}
                      </Dialog.Description>
                    </div>
                  </div>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </Dialog.Close>
                </div>

                <form onSubmit={handleSubmit} className="mt-5 space-y-5">
                  {/* SECCIÓN 1: PERSONALIZACIÓN DEL LOGO / FOTO */}
                  <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/[0.06] space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="relative group/avatar">
                          <BrandIcon issuer={issuer || item.issuer} iconUrl={iconUrl} size={46} className="shrink-0 ring-2 ring-white/10" />
                          {iconUrl && (
                            <button
                              type="button"
                              onClick={() => setIconUrl('')}
                              className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-zinc-800 border border-white/20 text-zinc-400 hover:text-rose-400 shadow-md transition-colors"
                              title="Restablecer logo por defecto"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Logo / Foto de la Cuenta</span>
                          </h4>
                          <p className="text-[11px] text-zinc-400">
                            {iconUrl
                              ? 'Logo personalizado activo (cifrado localmente)'
                              : 'Subí una imagen o pegá una URL'}
                          </p>
                        </div>
                      </div>

                      {/* Botones de Acción para Logo */}
                      <div className="flex items-center gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingImage}
                          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors active:scale-95"
                        >
                          <Upload className="w-3.5 h-3.5 text-zinc-400" />
                          <span>{isUploadingImage ? 'Cargando...' : 'Subir Foto'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowUrlInput(!showUrlInput)}
                          className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-white/10 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                        >
                          <Link className="w-3.5 h-3.5" />
                          <span>{showUrlInput ? 'Ocultar URL' : 'URL Externa'}</span>
                        </button>
                      </div>
                    </div>

                    {showUrlInput && (
                      <div className="pt-2 border-t border-white/[0.06] space-y-1">
                        <label className="text-[11px] text-zinc-400 font-medium block">
                          URL directa de la imagen (HTTPS)
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="url"
                            value={iconUrl.startsWith('data:') ? '' : iconUrl}
                            onChange={(e) => setIconUrl(e.target.value)}
                            placeholder="https://ejemplo.com/hytale-logo.png"
                            className="flex-1 bg-zinc-950 border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                          />
                          {iconUrl && (
                            <button
                              type="button"
                              onClick={() => setIconUrl('')}
                              className="px-2.5 py-1.5 text-xs text-zinc-400 hover:text-rose-400 transition-colors"
                            >
                              Limpiar
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SECCIÓN 2: CÓDIGOS DE RECUPERACIÓN / BACKUP */}
                  <div className="p-4 rounded-xl bg-zinc-900/60 border border-white/[0.06] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">
                          Códigos de Respaldo (Backup Codes)
                        </span>
                        {recoveryCodes.length > 0 && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                            {availableCount} disponibles · {usedCount} usados
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-zinc-500 font-mono">
                        Zero-Knowledge AES-GCM
                      </span>
                    </div>

                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Pega aquí los códigos de recuperación que te entregó el servicio (ej. Hytale, Google, Ubisoft).
                      Puedes pegar varios códigos juntos separados por saltos de línea.
                    </p>

                    {/* Input y Botón de Añadir Códigos */}
                    <div className="flex gap-2">
                      <textarea
                        rows={2}
                        placeholder="Pega uno o múltiples códigos aquí (uno por línea)..."
                        value={codeInput}
                        onChange={(e) => setCodeInput(e.target.value)}
                        className="flex-1 bg-zinc-950/80 border border-white/[0.08] rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50 resize-none transition-colors"
                      />
                      <button
                        type="button"
                        onClick={handleAddCodes}
                        disabled={!codeInput.trim()}
                        className="px-4 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-40 shrink-0"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Añadir</span>
                      </button>
                    </div>

                    {/* Lista de Códigos Registrados */}
                    {recoveryCodes.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1 pt-1">
                        {recoveryCodes.map((rc, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center justify-between p-2 rounded-lg text-xs font-mono transition-colors border ${
                              rc.used
                                ? 'bg-zinc-950/40 border-white/[0.04] text-zinc-600 line-through'
                                : 'bg-zinc-950 border-white/[0.08] text-zinc-200'
                            }`}
                          >
                            <span className="truncate mr-2 select-all font-semibold tracking-wide">
                              {rc.code}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {!rc.used && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyCode(rc.code, idx)}
                                  className="p-1 text-zinc-500 hover:text-zinc-200 transition-colors"
                                  title="Copiar código"
                                >
                                  {copiedIndex === idx ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              )}
                              <input
                                type="checkbox"
                                checked={rc.used}
                                onChange={() => handleToggleCodeUsed(idx)}
                                title={rc.used ? 'Marcar como disponible' : 'Marcar como usado'}
                                className="rounded bg-zinc-800 border-zinc-700 text-amber-500 focus:ring-0 cursor-pointer"
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveCode(idx)}
                                className="p-1 text-zinc-500 hover:text-rose-400 transition-colors"
                                title="Eliminar este código"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 border border-dashed border-white/[0.08] rounded-lg">
                        <p className="text-xs text-zinc-500">
                          No hay códigos de recuperación guardados para esta cuenta todavía.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* SECCIÓN 3: INFORMACIÓN DE LA CUENTA */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Servicio / Issuer */}
                    <div>
                      <label className="text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Nombre del Servicio</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={issuer}
                        onChange={(e) => setIssuer(e.target.value)}
                        placeholder="ej. Hytale, Google, Ubisoft"
                        className="w-full bg-zinc-950/80 border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                      />
                    </div>

                    {/* Cuenta / Usuario */}
                    <div>
                      <label className="text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Usuario o Correo</span>
                      </label>
                      <input
                        type="text"
                        value={account}
                        onChange={(e) => setAccount(e.target.value)}
                        placeholder="ej. rojas@ejemplo.com"
                        className="w-full bg-zinc-950/80 border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Etiquetas / Tags */}
                  <div>
                    <label className="text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Etiquetas (separadas por comas)</span>
                    </label>
                    <input
                      type="text"
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      placeholder="ej. gaming, personal, trabajo"
                      className="w-full bg-zinc-950/80 border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                    />
                  </div>

                  {/* Notas Adicionales */}
                  <div>
                    <label className="text-xs font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-zinc-500" />
                      <span>Notas Adicionales (Cifradas)</span>
                    </label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Notas de seguridad, pistas o información relevante..."
                      className="w-full bg-zinc-950/80 border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 resize-none transition-colors"
                    />
                  </div>

                  {/* Botones de Acción Inferiores */}
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.06]">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-900 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-5 py-2 bg-white text-zinc-950 font-semibold hover:bg-zinc-200 active:scale-[0.99] rounded-lg text-xs shadow-sm flex items-center gap-2 transition-all disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4 text-zinc-950" />
                      <span>{isSaving ? 'Guardando...' : 'Guardar Cambios'}</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
