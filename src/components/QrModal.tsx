import { useState, useEffect, useRef, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Camera,
  UploadCloud,
  ClipboardPaste,
  Edit3,
  X,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  QrCode,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BrowserQRCodeReader } from '@zxing/browser';
import { toast } from 'sonner';
import { parseOtpAuthUri } from '../lib/crypto/totp.ts';
import { sanitizeBase32, isValidBase32 } from '../lib/crypto/base32.ts';
import type { VaultItem, TotpAlgorithm, RecoveryCode } from '../types/vault.ts';

interface QrModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveAccount: (item: VaultItem) => Promise<void>;
}

type IngestionTab = 'camera' | 'dropzone' | 'paste' | 'manual';

export function QrModal({ isOpen, onClose, onSaveAccount }: QrModalProps) {
  const [activeTab, setActiveTab] = useState<IngestionTab>('camera');

  // Form State
  const [issuer, setIssuer] = useState('');
  const [account, setAccount] = useState('');
  const [secret, setSecret] = useState('');
  const [digits, setDigits] = useState<6 | 8>(6);
  const [period, setPeriod] = useState(30);
  const [algorithm, setAlgorithm] = useState<TotpAlgorithm>('SHA1');
  const [recoveryCodes, setRecoveryCodes] = useState<RecoveryCode[]>([]);
  const [newRecoveryInput, setNewRecoveryInput] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  // Camera State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  // Dropzone / Paste State
  const [dragActive, setDragActive] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setIssuer('');
      setAccount('');
      setSecret('');
      setDigits(6);
      setPeriod(30);
      setAlgorithm('SHA1');
      setRecoveryCodes([]);
      setNewRecoveryInput('');
      setTagsInput('');
      setScanSuccess(false);
      setCameraError(null);
    }
  }, [isOpen]);

  const handleParsedUri = useCallback((rawUri: string) => {
    try {
      const parsed = parseOtpAuthUri(rawUri);
      if (parsed.issuer) setIssuer(parsed.issuer);
      if (parsed.account) setAccount(parsed.account);
      if (parsed.secret) setSecret(sanitizeBase32(parsed.secret));
      if (parsed.digits) setDigits(parsed.digits);
      if (parsed.period) setPeriod(parsed.period);
      if (parsed.algorithm) setAlgorithm(parsed.algorithm);

      setScanSuccess(true);
      toast.success(`Código QR detectado: ${parsed.issuer || 'Cuenta'}`);
      setActiveTab('manual'); // Llevar al formulario para revisión y guardado
    } catch (err) {
      toast.error('El código escaneado no es un URI de TOTP válido (otpauth://totp/...)');
    }
  }, []);

  // -------------------------------------------------------------------------
  // Manejador de Cámara en Vivo con @zxing/browser
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || activeTab !== 'camera') {
      setIsScanning(false);
      return;
    }

    let codeReader: BrowserQRCodeReader | null = null;
    let controls: { stop: () => void } | null = null;
    let isCancelled = false;

    async function startCamera() {
      try {
        setCameraError(null);
        codeReader = new BrowserQRCodeReader();

        const devices = await BrowserQRCodeReader.listVideoInputDevices();
        if (devices.length === 0) {
          throw new Error('No se detectó ninguna cámara en este dispositivo.');
        }

        setVideoDevices(devices);
        const deviceId = selectedDeviceId || devices[0].deviceId;

        if (videoRef.current && !isCancelled) {
          setIsScanning(true);
          controls = await codeReader.decodeFromVideoDevice(
            deviceId,
            videoRef.current,
            (result) => {
              if (result && !isCancelled) {
                handleParsedUri(result.getText());
                controls?.stop();
              }
            }
          );
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const message = err instanceof Error ? err.message : 'Error al acceder a la cámara';
          setCameraError(message);
          setIsScanning(false);
        }
      }
    }

    startCamera();

    return () => {
      isCancelled = true;
      controls?.stop();
    };
  }, [isOpen, activeTab, selectedDeviceId, handleParsedUri]);

  // -------------------------------------------------------------------------
  // Procesamiento de Imágenes (Dropzone / Pegado desde portapapeles)
  // -------------------------------------------------------------------------
  const processImageFile = async (file: File) => {
    setIsProcessingImage(true);
    try {
      const imageUrl = URL.createObjectURL(file);
      const codeReader = new BrowserQRCodeReader();
      const result = await codeReader.decodeFromImageUrl(imageUrl);
      URL.revokeObjectURL(imageUrl);

      if (result) {
        handleParsedUri(result.getText());
      } else {
        toast.error('No se pudo encontrar ningún código QR en la imagen');
      }
    } catch {
      toast.error('No se detectó un código QR nítido en la imagen proporcionada');
    } finally {
      setIsProcessingImage(false);
    }
  };

  // Escuchador global para Ctrl + V de capturas de pantalla
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            processImageFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processImageFile(e.dataTransfer.files[0]);
    }
  };

  const handleAddRecoveryCode = () => {
    if (!newRecoveryInput.trim()) return;
    setRecoveryCodes((prev) => [...prev, { code: newRecoveryInput.trim(), used: false }]);
    setNewRecoveryInput('');
  };

  const handleRemoveRecoveryCode = (idx: number) => {
    setRecoveryCodes((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!issuer.trim() || !account.trim() || !secret.trim()) {
      toast.error('Por favor completa el nombre del servicio, cuenta y secreto Base32');
      return;
    }

    const cleanSecret = sanitizeBase32(secret);
    if (!isValidBase32(cleanSecret)) {
      toast.error('El secreto contiene caracteres no válidos para Base32 (alfabeto A-Z, 2-7)');
      return;
    }

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter((t) => t.length > 0);

    const newItem: VaultItem = {
      id: crypto.randomUUID(),
      type: 'totp',
      issuer: issuer.trim(),
      account: account.trim(),
      secret: cleanSecret,
      digits,
      period,
      algorithm,
      recovery_codes: recoveryCodes,
      tags: tags.length > 0 ? tags : undefined,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    try {
      await onSaveAccount(newItem);
      toast.success(`Cuenta "${newItem.issuer}" guardada exitosamente`);
      onClose();
    } catch (err) {
      toast.error('Error al persistir la cuenta en la bóveda');
    }
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
                className="fixed inset-0 bg-black/75 backdrop-blur-md z-50"
              />
            </Dialog.Overlay>

            <Dialog.Content asChild>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl z-50 text-zinc-100 max-h-[90vh] overflow-y-auto focus:outline-none"
              >
                {/* Cabecera del Modal */}
                <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-violet-600/10 border border-violet-500/20 text-violet-400">
                      <QrCode className="w-5 h-5" />
                    </div>
                    <div>
                      <Dialog.Title className="text-base font-semibold tracking-tight text-white">
                        Vincular Nueva Cuenta 2FA
                      </Dialog.Title>
                      <Dialog.Description className="text-xs text-zinc-400">
                        Escanea un código QR o introduce la clave secreta manualmente
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

                {/* Tabs de Selección de Modo */}
                <div className="mt-4 flex p-1 bg-zinc-900/80 border border-zinc-800/80 rounded-xl relative">
                  {(
                    [
                      { id: 'camera', label: 'Cámara', icon: Camera },
                      { id: 'dropzone', label: 'Arrastrar Captura', icon: UploadCloud },
                      { id: 'paste', label: 'Ctrl + V', icon: ClipboardPaste },
                      { id: 'manual', label: 'Manual / Editar', icon: Edit3 },
                    ] as const
                  ).map((tab) => {
                    const Icon = tab.icon;
                    const isSelected = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`relative flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors z-10 ${
                          isSelected ? 'text-white font-semibold' : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {isSelected && (
                          <motion.div
                            layoutId="qr-tab-active"
                            className="absolute inset-0 bg-violet-600/20 border border-violet-500/30 rounded-lg -z-10 shadow-sm"
                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                          />
                        )}
                        <Icon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Contenido de Cada Tab */}
                <div className="mt-5">
                  {/* TAB 1: Cámara en vivo */}
                  {activeTab === 'camera' && (
                    <div className="flex flex-col items-center">
                      <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-zinc-800 flex items-center justify-center">
                        <video ref={videoRef} className="w-full h-full object-cover" playsInline />
                        {isScanning && !cameraError && (
                          <div className="absolute inset-0 border-2 border-violet-500/50 rounded-xl pointer-events-none animate-pulse flex items-center justify-center">
                            <div className="w-48 h-48 border-2 border-dashed border-violet-400 rounded-lg" />
                          </div>
                        )}
                        {cameraError && (
                          <div className="p-4 text-center text-rose-400 text-xs flex flex-col items-center gap-2">
                            <AlertCircle className="w-6 h-6" />
                            <span>{cameraError}</span>
                            <button
                              type="button"
                              onClick={() => setActiveTab('manual')}
                              className="mt-2 px-3 py-1 bg-zinc-800 text-zinc-200 rounded-lg text-xs hover:bg-zinc-700"
                            >
                              Ingresar datos manualmente
                            </button>
                          </div>
                        )}
                      </div>

                      {videoDevices.length > 1 && (
                        <div className="mt-3 w-full flex items-center justify-between text-xs">
                          <label className="text-zinc-400">Seleccionar cámara:</label>
                          <select
                            value={selectedDeviceId}
                            onChange={(e) => setSelectedDeviceId(e.target.value)}
                            className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-zinc-300 text-xs"
                          >
                            {videoDevices.map((d) => (
                              <option key={d.deviceId} value={d.deviceId}>
                                {d.label || `Cámara ${d.deviceId.slice(0, 5)}`}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: Dropzone */}
                  {activeTab === 'dropzone' && (
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragActive(true);
                      }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={handleDrop}
                      className={`w-full py-12 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center p-6 transition-all ${
                        dragActive
                          ? 'border-violet-500 bg-violet-500/10'
                          : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700'
                      }`}
                    >
                      <UploadCloud className="w-10 h-10 text-violet-400 mb-3" />
                      <p className="text-sm font-medium text-white mb-1">
                        Arrastra y suelta tu captura de pantalla o imagen con el código QR
                      </p>
                      <p className="text-xs text-zinc-400 mb-4">Soporta PNG, JPEG, WEBP</p>
                      <label className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold rounded-xl cursor-pointer text-zinc-200 transition-colors">
                        Seleccionar archivo
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) processImageFile(e.target.files[0]);
                          }}
                        />
                      </label>
                      {isProcessingImage && (
                        <p className="mt-3 text-xs text-violet-400 animate-pulse">
                          Decodificando código QR...
                        </p>
                      )}
                    </div>
                  )}

                  {/* TAB 3: Direct Paste (Ctrl + V) */}
                  {activeTab === 'paste' && (
                    <div className="w-full py-12 border border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-center p-6 bg-zinc-900/20">
                      <div className="w-12 h-12 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center mb-3">
                        <ClipboardPaste className="w-6 h-6 text-violet-400" />
                      </div>
                      <h4 className="text-sm font-semibold text-white mb-1">
                        Captura de pantalla en portapapeles
                      </h4>
                      <p className="text-xs text-zinc-400 max-w-sm mb-4">
                        Toma una captura de pantalla del código QR (ej. <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300 font-mono">Win + Shift + S</kbd>) y presiona <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-300 font-mono">Ctrl + V</kbd> directamente aquí.
                      </p>
                      <div className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-500 font-mono">
                        Escuchando evento paste del portapapeles...
                      </div>
                    </div>
                  )}

                  {/* Formulario Estructurado (TAB 4 o tras escaneo exitoso) */}
                  {(activeTab === 'manual' || scanSuccess) && (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      {scanSuccess && (
                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-xs text-emerald-400">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>Código QR decodificado exitosamente. Revisa los datos y añade recovery codes si posees.</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 block">
                            Servicio / Proveedor
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="ej. GitHub, AWS, Google"
                            value={issuer}
                            onChange={(e) => setIssuer(e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 block">
                            Cuenta / Identificador
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="ej. usuario@correo.com"
                            value={account}
                            onChange={(e) => setAccount(e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-zinc-300 mb-1 block">
                          Secreto Base32
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="ej. JBSWY3DPEHPK3PXP"
                          value={secret}
                          onChange={(e) => setSecret(e.target.value)}
                          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-white focus:outline-none focus:border-violet-500 transition-colors uppercase"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-zinc-400 mb-1 block">Dígitos</label>
                          <select
                            value={digits}
                            onChange={(e) => setDigits(Number(e.target.value) as 6 | 8)}
                            className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200"
                          >
                            <option value={6}>6 Dígitos</option>
                            <option value={8}>8 Dígitos</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-xs text-zinc-400 mb-1 block">Intervalo (s)</label>
                          <select
                            value={period}
                            onChange={(e) => setPeriod(Number(e.target.value))}
                            className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200"
                          >
                            <option value={30}>30 segundos</option>
                            <option value={60}>60 segundos</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-xs text-zinc-400 mb-1 block">Algoritmo</label>
                          <select
                            value={algorithm}
                            onChange={(e) => setAlgorithm(e.target.value as TotpAlgorithm)}
                            className="w-full px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-200"
                          >
                            <option value="SHA1">SHA-1</option>
                            <option value="SHA256">SHA-256</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-zinc-300 mb-1 block">
                          Etiquetas (separadas por comas)
                        </label>
                        <input
                          type="text"
                          placeholder="ej. Infra, Trabajo, Cloud"
                          value={tagsInput}
                          onChange={(e) => setTagsInput(e.target.value)}
                          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
                        />
                      </div>

                      {/* Sección de Recovery Codes */}
                      <div className="pt-2 border-t border-zinc-800/80">
                        <label className="text-xs font-semibold text-zinc-300 mb-2 block">
                          Códigos de Recuperación (Opcional)
                        </label>
                        <div className="flex gap-2 mb-2">
                          <input
                            type="text"
                            placeholder="Nuevo código de emergencia"
                            value={newRecoveryInput}
                            onChange={(e) => setNewRecoveryInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddRecoveryCode();
                              }
                            }}
                            className="flex-1 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-200"
                          />
                          <button
                            type="button"
                            onClick={handleAddRecoveryCode}
                            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium flex items-center gap-1 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Añadir
                          </button>
                        </div>

                        {recoveryCodes.length > 0 && (
                          <div className="space-y-1.5 max-h-32 overflow-y-auto p-1 bg-zinc-900/40 rounded-xl border border-zinc-800/60">
                            {recoveryCodes.map((rc, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-zinc-900 text-xs font-mono text-zinc-300"
                              >
                                <span>{rc.code}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveRecoveryCode(idx)}
                                  className="text-zinc-500 hover:text-rose-400 p-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Botones de Acción */}
                      <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-zinc-800/80">
                        <button
                          type="button"
                          onClick={onClose}
                          className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-900 transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-600/20 transition-all active:scale-95"
                        >
                          Guardar Cuenta en Bóveda
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
