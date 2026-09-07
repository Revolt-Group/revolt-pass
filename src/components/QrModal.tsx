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
  ImageIcon,
  Upload,
  Link,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BrowserQRCodeReader } from '@zxing/browser';
import { toast } from 'sonner';
import { parseOtpAuthUri } from '../lib/crypto/totp.ts';
import { sanitizeBase32, isValidBase32 } from '../lib/crypto/base32.ts';
import { parseGoogleAuthMigration } from '../lib/importers/index.ts';
import { BrandIcon } from './BrandIcon.tsx';
import { resizeImageFile } from '../lib/utils/image.ts';
import { useTranslation } from '../i18n/index.ts';
import type { VaultItem, TotpAlgorithm, RecoveryCode } from '../types/vault.ts';

interface QrModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveAccount: (item: VaultItem) => Promise<void>;
}

type IngestionTab = 'camera' | 'dropzone' | 'paste' | 'manual';

export function QrModal({ isOpen, onClose, onSaveAccount }: QrModalProps) {
  const { t } = useTranslation();
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
  const [iconUrl, setIconUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const iconFileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleIconFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    try {
      const dataUrl = await resizeImageFile(file, 96);
      setIconUrl(dataUrl);
      toast.success('Foto / Logo cargado y optimizado');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al procesar la imagen';
      toast.error(msg);
    } finally {
      setIsUploadingImage(false);
      if (iconFileInputRef.current) iconFileInputRef.current.value = '';
    }
  };

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
      setIconUrl('');
      setShowUrlInput(false);
      setIsUploadingImage(false);
      setScanSuccess(false);
      setCameraError(null);
    }
  }, [isOpen]);

  const handleParsedUri = useCallback((rawUri: string) => {
    const trimmed = rawUri.trim();

    // 1. Google Authenticator Migration QR code (otpauth-migration://offline?data=...)
    if (trimmed.startsWith('otpauth-migration://offline')) {
      const migrationRes = parseGoogleAuthMigration(trimmed);
      if (migrationRes.accounts.length === 1) {
        const acc = migrationRes.accounts[0];
        if (acc.issuer) setIssuer(acc.issuer);
        if (acc.name) setAccount(acc.name);
        if (acc.secret) setSecret(sanitizeBase32(acc.secret));
        if (acc.digits) setDigits(acc.digits === 8 ? 8 : 6);
        if (acc.period) setPeriod(acc.period);
        if (acc.algorithm) setAlgorithm(acc.algorithm === 'SHA256' ? 'SHA256' : 'SHA1');

        setScanSuccess(true);
        toast.success(`Google Authenticator: ${acc.issuer || 'Cuenta'} detectada`);
        setActiveTab('manual');
        return;
      } else if (migrationRes.accounts.length > 1) {
        toast.success(
          `Google Authenticator: paquete de migración con ${migrationRes.accounts.length} cuentas detectado.`
        );
        window.dispatchEvent(
          new CustomEvent('revolt:open-import-migration', {
            detail: { rawPayload: trimmed },
          })
        );
        onClose();
        return;
      }
    }

    // 2. Standard single otpauth:// URI
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
      setActiveTab('manual'); // Transition to form for review and save
    } catch {
      toast.error('El código escaneado no es un URI de TOTP válido (otpauth://totp/...)');
    }
  }, [onClose]);

  // -------------------------------------------------------------------------
  // Live Camera Scanner with @zxing/browser
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
  // Image Processing (Dropzone / Clipboard Paste)
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

  // Global listener for Ctrl + V screenshot pasting
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
      icon_url: iconUrl.trim() || undefined,
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
    } catch {
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
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-1.5rem)] sm:w-full max-w-xl bg-[#0f1013] border border-white/[0.08] hairline-top rounded-xl p-4 sm:p-6 shadow-[0_24px_68px_rgba(0,0,0,0.8)] z-50 text-zinc-100 max-h-[90vh] overflow-y-auto focus:outline-none custom-scrollbar"
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-lg bg-[#16181d] border border-white/[0.1] hairline-top text-white">
                      <QrCode className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <Dialog.Title className="text-base font-semibold tracking-tight text-white">
                        {t('qrModal.title')}
                      </Dialog.Title>
                      <Dialog.Description className="text-xs text-zinc-400">
                        {t('qrModal.subtitle')}
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

                {/* Mode Selector Tabs */}
                <div className="mt-4 flex p-1 bg-[#08090a] border border-white/[0.06] rounded-lg relative">
                  {(
                    [
                      { id: 'camera', label: t('qrModal.tabCamera'), icon: Camera },
                      { id: 'dropzone', label: t('qrModal.tabImage'), icon: UploadCloud },
                      { id: 'paste', label: t('qrModal.tabPaste'), icon: ClipboardPaste },
                      { id: 'manual', label: t('qrModal.tabManual'), icon: Edit3 },
                    ] as const
                  ).map((tab) => {
                    const Icon = tab.icon;
                    const isSelected = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`relative flex-1 py-1.5 text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-colors z-10 ${
                          isSelected ? 'text-white font-medium' : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {isSelected && (
                          <motion.div
                            layoutId="qr-tab-active"
                            className="absolute inset-0 bg-[#16181d] border border-white/[0.08] rounded-md -z-10 shadow-sm"
                            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                          />
                        )}
                        <Icon className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Tab Content */}
                <div className="mt-5">
                  {/* TAB 1: Live Camera */}
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

                  {/* Form / Manual Entry (TAB 4 or after successful scan) */}
                  {(activeTab === 'manual' || scanSuccess) && (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      {scanSuccess && (
                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-xs text-emerald-400">
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>Código QR decodificado exitosamente. Revisa los datos y añade recovery codes si posees.</span>
                        </div>
                      )}

                      {/* Account Logo / Avatar */}
                      <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 space-y-2.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="relative group/avatar">
                              <BrandIcon issuer={issuer || 'Cuenta'} iconUrl={iconUrl} size={40} className="shrink-0 ring-1 ring-white/10" />
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
                                <ImageIcon className="w-3.5 h-3.5 text-violet-400" />
                                <span>Logo / Foto de la Cuenta (Opcional)</span>
                              </h4>
                              <p className="text-[11px] text-zinc-400">
                                {iconUrl
                                  ? 'Logo personalizado activo'
                                  : 'Subí una foto o ingresá una URL'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <input
                              ref={iconFileInputRef}
                              type="file"
                              accept="image/*"
                              onChange={handleIconFileChange}
                              className="hidden"
                            />
                            <button
                              type="button"
                              onClick={() => iconFileInputRef.current?.click()}
                              disabled={isUploadingImage}
                              className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                            >
                              <Upload className="w-3.5 h-3.5 text-zinc-400" />
                              <span>{isUploadingImage ? 'Cargando...' : 'Subir Foto'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setShowUrlInput(!showUrlInput)}
                              className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                            >
                              <Link className="w-3.5 h-3.5" />
                              <span>{showUrlInput ? 'Ocultar' : 'URL'}</span>
                            </button>
                          </div>
                        </div>

                        {showUrlInput && (
                          <div className="pt-2 border-t border-zinc-800/80">
                            <input
                              type="url"
                              value={iconUrl.startsWith('data:') ? '' : iconUrl}
                              onChange={(e) => setIconUrl(e.target.value)}
                              placeholder="https://ejemplo.com/logo.png"
                              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/50 transition-colors"
                            />
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 block">
                            {t('qrModal.issuerLabel')}
                          </label>
                          <input
                            type="text"
                            required
                            placeholder={t('qrModal.issuerPlaceholder')}
                            value={issuer}
                            onChange={(e) => setIssuer(e.target.value)}
                            className="w-full px-3 py-2 bg-[#08090a] border border-white/[0.08] rounded-lg text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/30 transition-colors"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 block">
                            {t('qrModal.accountLabel')}
                          </label>
                          <input
                            type="text"
                            required
                            placeholder={t('qrModal.accountPlaceholder')}
                            value={account}
                            onChange={(e) => setAccount(e.target.value)}
                            className="w-full px-3 py-2 bg-[#08090a] border border-white/[0.08] rounded-lg text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/30 transition-colors"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-zinc-300 mb-1 block">
                          {t('qrModal.secretLabel')}
                        </label>
                        <input
                          type="text"
                          required
                          placeholder={t('qrModal.secretPlaceholder')}
                          value={secret}
                          onChange={(e) => setSecret(e.target.value)}
                          className="w-full px-3 py-2 bg-[#08090a] border border-white/[0.08] rounded-lg text-xs font-mono text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/30 transition-colors uppercase"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-xs text-zinc-400 mb-1 block">{t('qrModal.digitsLabel')}</label>
                          <select
                            value={digits}
                            onChange={(e) => setDigits(Number(e.target.value) as 6 | 8)}
                            className="w-full px-2.5 py-1.5 bg-[#08090a] border border-white/[0.08] rounded-lg text-xs text-zinc-200"
                          >
                            <option value={6}>6</option>
                            <option value={8}>8</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-xs text-zinc-400 mb-1 block">{t('qrModal.periodLabel')}</label>
                          <select
                            value={period}
                            onChange={(e) => setPeriod(Number(e.target.value))}
                            className="w-full px-2.5 py-1.5 bg-[#08090a] border border-white/[0.08] rounded-lg text-xs text-zinc-200"
                          >
                            <option value={30}>30s</option>
                            <option value={60}>60s</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-xs text-zinc-400 mb-1 block">{t('qrModal.algorithmLabel')}</label>
                          <select
                            value={algorithm}
                            onChange={(e) => setAlgorithm(e.target.value as TotpAlgorithm)}
                            className="w-full px-2.5 py-1.5 bg-[#08090a] border border-white/[0.08] rounded-lg text-xs text-zinc-200"
                          >
                            <option value="SHA1">SHA-1</option>
                            <option value="SHA256">SHA-256</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-zinc-300 mb-1 block">
                          {t('qrModal.tagsLabel')}
                        </label>
                        <input
                          type="text"
                          placeholder={t('qrModal.tagsPlaceholder')}
                          value={tagsInput}
                          onChange={(e) => setTagsInput(e.target.value)}
                          className="w-full px-3 py-2 bg-[#08090a] border border-white/[0.08] rounded-lg text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:border-white/30 transition-colors"
                        />
                      </div>

                      {/* Recovery Codes Section */}
                      <div className="pt-2 border-t border-white/[0.08]">
                        <label className="text-xs font-semibold text-zinc-300 mb-2 block">
                          {t('itemModal.recoveryCodesTitle')}
                        </label>
                        <div className="flex gap-2 mb-2">
                          <input
                            type="text"
                            placeholder={t('itemModal.recoveryCodePlaceholder')}
                            value={newRecoveryInput}
                            onChange={(e) => setNewRecoveryInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddRecoveryCode();
                              }
                            }}
                            className="flex-1 px-3 py-1.5 bg-[#08090a] border border-white/[0.08] rounded-lg text-xs font-mono text-zinc-200 placeholder:text-zinc-600"
                          />
                          <button
                            type="button"
                            onClick={handleAddRecoveryCode}
                            className="px-3 py-1.5 bg-[#16181d] hover:bg-[#1c1f24] text-zinc-200 border border-white/[0.08] rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            {t('itemModal.addCodeButton')}
                          </button>
                        </div>

                        {recoveryCodes.length > 0 && (
                          <div className="space-y-1.5 max-h-32 overflow-y-auto p-1 bg-[#08090a] rounded-lg border border-white/[0.08]">
                            {recoveryCodes.map((rc, idx) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between px-2.5 py-1 rounded-md bg-[#16181d] text-xs font-mono text-zinc-300 border border-white/[0.04]"
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

                      {/* Action Buttons */}
                      <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-white/[0.08]">
                        <button
                          type="button"
                          onClick={onClose}
                          className="px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          type="submit"
                          className="px-4 py-1.5 text-xs font-medium rounded-lg bg-white hover:bg-zinc-200 text-black shadow-sm transition-all active:scale-[0.99]"
                        >
                          {t('qrModal.saveButton')}
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
