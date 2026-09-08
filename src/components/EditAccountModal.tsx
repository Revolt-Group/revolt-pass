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
  QrCode,
  Key,
  Shield,
  CreditCard,
  Terminal,
  Eye,
  EyeOff,
  Sparkles,
  History,
  Globe,
  Hash,
  Phone,
  Mail,
  MapPin,
  Server,
  Lock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { BrandIcon } from './BrandIcon.tsx';
import { AccountQrModal } from './AccountQrModal.tsx';
import { copyToClipboardSecurely } from '../lib/security/clipboardGuard.ts';
import { resizeImageFile } from '../lib/utils/image.ts';
import { recordPasswordHistory } from '../lib/crypto/vault.ts';
import { useTranslation } from '../i18n/index.ts';
import type {
  VaultItem,
  VaultItemType,
  LoginItemData,
  RecoveryCode,
  TotpAlgorithm,
  CardBrand,
  PasswordHistoryEntry,
} from '../types/vault.ts';

interface EditAccountModalProps {
  item: VaultItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedItem: VaultItem) => Promise<void>;
  initialType?: VaultItemType;
  onOpenQrScanner?: () => void;
}

function generateQuickPassword(length = 20): string {
  const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*()_+-=[]{}|;:,.<>?';
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((x) => chars[x % chars.length]).join('');
}

function detectCardBrand(num: string): CardBrand {
  const cleaned = num.replace(/\D/g, '');
  if (/^4/.test(cleaned)) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(cleaned)) return 'mastercard';
  if (/^3[47]/.test(cleaned)) return 'amex';
  if (/^6(011|5)/.test(cleaned)) return 'discover';
  return 'other';
}

export function EditAccountModal({
  item,
  isOpen,
  onClose,
  onSave,
  initialType = 'login',
  onOpenQrScanner,
}: EditAccountModalProps) {
  const { t } = useTranslation();
  const isEditing = Boolean(item);

  // Core Type & Common Fields
  const [itemType, setItemType] = useState<VaultItemType>(initialType);
  const [issuer, setIssuer] = useState('');
  const [account, setAccount] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  // Login Secret State
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [totpSeed, setTotpSeed] = useState('');
  const [showPasswordHistory, setShowPasswordHistory] = useState(false);
  const [passwordHistory, setPasswordHistory] = useState<PasswordHistoryEntry[]>([]);

  // Card Secret State
  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardBrand, setCardBrand] = useState<CardBrand>('visa');
  const [expMonth, setExpMonth] = useState('');
  const [expYear, setExpYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [showCvv, setShowCvv] = useState(false);
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  // Note Secret State
  const [contentMarkdown, setContentMarkdown] = useState('');

  // Server Key State
  const [serverHost, setServerHost] = useState('');
  const [serverPort, setServerPort] = useState('22');
  const [serverUsername, setServerUsername] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [apiToken, setApiToken] = useState('');

  // Identity State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [address, setAddress] = useState('');

  // TOTP State
  const [secret, setSecret] = useState('');
  const [digits, setDigits] = useState<6 | 8>(6);
  const [period, setPeriod] = useState(30);
  const [algorithm, setAlgorithm] = useState<TotpAlgorithm>('SHA1');
  const [recoveryCodes, setRecoveryCodes] = useState<RecoveryCode[]>([]);
  const [codeInput, setCodeInput] = useState('');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Synchronize state on open / item change
  useEffect(() => {
    if (isOpen) {
      if (item) {
        setItemType(item.type || 'totp');
        setIssuer(item.issuer || '');
        setAccount(item.account || '');
        setIconUrl(item.icon_url || '');
        setShowUrlInput(false);
        setNotes(item.notes || '');
        setTagsInput(item.tags?.join(', ') || '');

        // Login
        setPassword(item.login_data?.password || '');
        setShowPassword(false);
        setWebsiteUrl(item.login_data?.urls?.[0] || '');
        setTotpSeed(item.login_data?.totp_seed || '');
        setPasswordHistory(item.login_data?.password_history ? [...item.login_data.password_history] : []);
        setShowPasswordHistory(false);

        // Card
        setCardholderName(item.card_data?.cardholder_name || '');
        setCardNumber(item.card_data?.card_number || '');
        setCardBrand(item.card_data?.brand || 'visa');
        setExpMonth(item.card_data?.exp_month || '');
        setExpYear(item.card_data?.exp_year || '');
        setCvv(item.card_data?.cvv || '');
        setShowCvv(false);
        setPin(item.card_data?.pin || '');
        setShowPin(false);

        // Note
        setContentMarkdown(item.note_data?.content_markdown || '');

        // Server Key
        setServerHost(item.server_key_data?.host || '');
        setServerPort(String(item.server_key_data?.port ?? 22));
        setServerUsername(item.server_key_data?.username || '');
        setPublicKey(item.server_key_data?.public_key || '');
        setPrivateKey(item.server_key_data?.private_key || '');
        setShowPrivateKey(false);
        setPassphrase(item.server_key_data?.passphrase || '');
        setShowPassphrase(false);
        setApiToken(item.server_key_data?.api_token || '');

        // Identity
        setFirstName(item.identity_data?.first_name || '');
        setLastName(item.identity_data?.last_name || '');
        setEmail(item.identity_data?.email || '');
        setPhone(item.identity_data?.phone || '');
        setIdNumber(item.identity_data?.id_number || '');
        setAddress(item.identity_data?.address || '');

        // TOTP
        setSecret(item.secret || '');
        setDigits(item.digits || 6);
        setPeriod(item.period || 30);
        setAlgorithm(item.algorithm || 'SHA1');
        setRecoveryCodes(item.recovery_codes ? [...item.recovery_codes] : []);
        setCodeInput('');
        setCopiedIndex(null);
      } else {
        // Creation Mode
        setItemType(initialType);
        setIssuer('');
        setAccount('');
        setIconUrl('');
        setShowUrlInput(false);
        setNotes('');
        setTagsInput('');

        setPassword('');
        setShowPassword(false);
        setWebsiteUrl('');
        setTotpSeed('');
        setPasswordHistory([]);
        setShowPasswordHistory(false);

        setCardholderName('');
        setCardNumber('');
        setCardBrand('visa');
        setExpMonth('');
        setExpYear('');
        setCvv('');
        setShowCvv(false);
        setPin('');
        setShowPin(false);

        setContentMarkdown('');

        setServerHost('');
        setServerPort('22');
        setServerUsername('');
        setPublicKey('');
        setPrivateKey('');
        setShowPrivateKey(false);
        setPassphrase('');
        setShowPassphrase(false);
        setApiToken('');

        setFirstName('');
        setLastName('');
        setEmail('');
        setPhone('');
        setIdNumber('');
        setAddress('');

        setSecret('');
        setDigits(6);
        setPeriod(30);
        setAlgorithm('SHA1');
        setRecoveryCodes([]);
        setCodeInput('');
        setCopiedIndex(null);
      }
    }
  }, [item, isOpen, initialType]);

  const handleCardNumberChange = (val: string) => {
    setCardNumber(val);
    const detected = detectCardBrand(val);
    if (detected !== 'other') {
      setCardBrand(detected);
    }
  };

  const handleGeneratePassword = () => {
    const newPass = generateQuickPassword(20);
    setPassword(newPass);
    setShowPassword(true);
    toast.success('Contraseña generada con 20 caracteres (CSPRNG)');
  };

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

    if (!issuer.trim()) {
      toast.error('El nombre del servicio o título es obligatorio');
      return;
    }

    if (itemType === 'totp' && !secret.trim()) {
      toast.error('El secreto Base32 es obligatorio para tokens 2FA');
      return;
    }

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter((t) => t.length > 0);

    const now = Date.now();
    const itemId = item ? item.id : (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `item_${now}_${Math.random().toString(36).slice(2, 9)}`);

    const finalItem: VaultItem = {
      id: itemId,
      type: itemType,
      issuer: issuer.trim(),
      account: account.trim(),
      secret: itemType === 'totp' ? secret.trim() : (totpSeed.trim() || ''),
      digits: digits === 8 ? 8 : 6,
      period: period > 0 ? period : 30,
      algorithm: algorithm === 'SHA256' ? 'SHA256' : 'SHA1',
      icon_url: iconUrl.trim() || undefined,
      notes: notes.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      pinned: item?.pinned || false,
      folder_id: item?.folder_id,
      deleted_at: item?.deleted_at ?? null,
      encrypted_key: item?.encrypted_key,
      created_at: item?.created_at || now,
      updated_at: now,
    };

    // Populate type-specific payloads
    if (itemType === 'login') {
      let updatedLoginData: LoginItemData = {
        username: account.trim() || undefined,
        password: password || undefined,
        urls: websiteUrl.trim() ? [websiteUrl.trim()] : undefined,
        totp_seed: totpSeed.trim() || undefined,
        password_history: passwordHistory,
      };

      // Auto-record previous password into password_history if changed
      if (item?.login_data?.password && item.login_data.password !== password) {
        updatedLoginData = recordPasswordHistory(updatedLoginData, item.login_data.password);
      }

      finalItem.login_data = updatedLoginData;
    } else if (itemType === 'card') {
      finalItem.card_data = {
        cardholder_name: cardholderName.trim() || undefined,
        card_number: cardNumber.trim() || undefined,
        brand: cardBrand,
        exp_month: expMonth.trim() || undefined,
        exp_year: expYear.trim() || undefined,
        cvv: cvv.trim() || undefined,
        pin: pin.trim() || undefined,
      };
      if (!finalItem.account) {
        const cleanDigits = cardNumber.replace(/\D/g, '');
        finalItem.account = cleanDigits.length >= 4 ? `•••• ${cleanDigits.slice(-4)}` : cardBrand.toUpperCase();
      }
    } else if (itemType === 'note') {
      finalItem.note_data = {
        title: issuer.trim(),
        content_markdown: contentMarkdown,
      };
      if (!finalItem.account) {
        finalItem.account = 'Nota Segura';
      }
    } else if (itemType === 'server_key') {
      finalItem.server_key_data = {
        host: serverHost.trim() || undefined,
        port: parseInt(serverPort, 10) || 22,
        username: serverUsername.trim() || undefined,
        public_key: publicKey.trim() || undefined,
        private_key: privateKey.trim() || undefined,
        passphrase: passphrase.trim() || undefined,
        api_token: apiToken.trim() || undefined,
      };
      if (!finalItem.account) {
        finalItem.account = serverHost ? `${serverUsername ? `${serverUsername}@` : ''}${serverHost}` : 'SSH / API';
      }
    } else if (itemType === 'identity') {
      finalItem.identity_data = {
        first_name: firstName.trim() || undefined,
        last_name: lastName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        id_number: idNumber.trim() || undefined,
        address: address.trim() || undefined,
      };
      if (!finalItem.account) {
        finalItem.account = email.trim() || phone.trim() || `${firstName} ${lastName}`.trim() || 'Identidad';
      }
    } else if (itemType === 'totp') {
      finalItem.recovery_codes = recoveryCodes.length > 0 ? recoveryCodes : undefined;
    }

    setIsSaving(true);
    try {
      await onSave(finalItem);
      onClose();
    } catch {
      toast.error('Error al guardar en la bóveda');
    } finally {
      setIsSaving(false);
    }
  };

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
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-1.5rem)] sm:w-full max-w-xl bg-[#0f1013] border border-white/[0.08] hairline-top shadow-[0_24px_68px_rgba(0,0,0,0.8)] rounded-xl p-4 sm:p-6 z-50 text-zinc-100 max-h-[92vh] overflow-y-auto focus:outline-none custom-scrollbar"
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                  <div className="flex items-center gap-3">
                    <BrandIcon issuer={issuer || item?.issuer || 'Revolt'} iconUrl={iconUrl} size={36} className="shrink-0" />
                    <div>
                      <Dialog.Title className="text-sm sm:text-base font-semibold tracking-tight text-white flex items-center gap-2">
                        <span>{isEditing ? t('itemModal.editTitle') : 'Nuevo Secreto'}</span>
                      </Dialog.Title>
                      <Dialog.Description className="text-xs text-zinc-400 font-mono">
                        {isEditing ? t('itemModal.editSubtitle') : 'Almacenamiento Zero-Knowledge AES-GCM 256-bit'}
                      </Dialog.Description>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isEditing && itemType === 'totp' && item?.secret && (
                      <button
                        type="button"
                        onClick={() => setShowQrModal(true)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 hover:text-blue-200 border border-blue-500/20 transition-all"
                      >
                        <QrCode className="w-3.5 h-3.5 text-blue-400" />
                        <span>Ver QR</span>
                      </button>
                    )}
                    <Dialog.Close asChild>
                      <button
                        type="button"
                        className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </Dialog.Close>
                  </div>
                </div>

                {/* TYPE SELECTOR TABS (Only shown in creation mode) */}
                {!isEditing && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mt-4 p-1 rounded-xl bg-[#08090a] border border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => setItemType('login')}
                      className={`py-2 px-1.5 rounded-lg text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                        itemType === 'login'
                          ? 'bg-[#16181d] text-white border border-white/[0.1] shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Key className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-[11px]">Login</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemType('totp')}
                      className={`py-2 px-1.5 rounded-lg text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                        itemType === 'totp'
                          ? 'bg-[#16181d] text-white border border-white/[0.1] shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Shield className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[11px]">2FA / TOTP</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemType('card')}
                      className={`py-2 px-1.5 rounded-lg text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                        itemType === 'card'
                          ? 'bg-[#16181d] text-white border border-white/[0.1] shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-[11px]">Tarjeta</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemType('note')}
                      className={`py-2 px-1.5 rounded-lg text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                        itemType === 'note'
                          ? 'bg-[#16181d] text-white border border-white/[0.1] shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-purple-400" />
                      <span className="text-[11px]">Nota</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemType('server_key')}
                      className={`py-2 px-1.5 rounded-lg text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                        itemType === 'server_key'
                          ? 'bg-[#16181d] text-white border border-white/[0.1] shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-[11px]">Servidor</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemType('identity')}
                      className={`py-2 px-1.5 rounded-lg text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                        itemType === 'identity'
                          ? 'bg-[#16181d] text-white border border-white/[0.1] shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      <User className="w-3.5 h-3.5 text-rose-400" />
                      <span className="text-[11px]">Identidad</span>
                    </button>
                  </div>
                )}

                {/* Quick QR Scanner button for TOTP in creation mode */}
                {!isEditing && itemType === 'totp' && onOpenQrScanner && (
                  <div className="mt-3 p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 text-emerald-300 text-xs">
                      <QrCode className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>¿Tienes un código QR de 2FA? Puedes escanearlo directamente con la cámara.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenQrScanner();
                      }}
                      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold rounded-lg text-xs shrink-0 transition-colors"
                    >
                      Escanear QR
                    </button>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                  {/* COMMON: TITLE / SERVICE NAME */}
                  <div>
                    <label className="text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{itemType === 'note' ? 'Título de la Nota' : itemType === 'identity' ? 'Nombre de la Identidad' : itemType === 'card' ? 'Nombre de la Tarjeta' : itemType === 'server_key' ? 'Nombre del Servidor' : t('itemModal.issuerLabel')}</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={issuer}
                      onChange={(e) => setIssuer(e.target.value)}
                      placeholder={itemType === 'note' ? 'ej. Frase de recuperación Ledger' : itemType === 'card' ? 'ej. Visa Santander Platinum' : itemType === 'server_key' ? 'ej. Bastion Producción AWS' : itemType === 'identity' ? 'ej. Documento Nacional / Pasaporte' : t('itemModal.issuerPlaceholder')}
                      className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30 transition-colors"
                    />
                  </div>

                  {/* -------------------------------------------------------- */}
                  {/* TYPE-SPECIFIC FIELDS                                     */}
                  {/* -------------------------------------------------------- */}

                  {/* 1. LOGIN TYPE */}
                  {itemType === 'login' && (
                    <div className="space-y-3 p-3.5 rounded-xl bg-[#121419] border border-white/[0.06]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-zinc-500" />
                            <span>Usuario o Correo</span>
                          </label>
                          <input
                            type="text"
                            value={account}
                            onChange={(e) => setAccount(e.target.value)}
                            placeholder="usuario@dominio.com"
                            className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30 transition-colors"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                              <Lock className="w-3.5 h-3.5 text-zinc-500" />
                              <span>Contraseña</span>
                            </label>
                            <button
                              type="button"
                              onClick={handleGeneratePassword}
                              className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                            >
                              <Sparkles className="w-3 h-3" />
                              <span>Generar</span>
                            </button>
                          </div>
                          <div className="relative">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="••••••••••••"
                              className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg pl-3 pr-8 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30 transition-colors"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1"
                            >
                              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                            <Globe className="w-3.5 h-3.5 text-zinc-500" />
                            <span>URL del Sitio Web</span>
                          </label>
                          <input
                            type="url"
                            value={websiteUrl}
                            onChange={(e) => setWebsiteUrl(e.target.value)}
                            placeholder="https://app.ejemplo.com"
                            className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30 transition-colors"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-zinc-500" />
                            <span>Clave 2FA / TOTP Integrada (Opcional)</span>
                          </label>
                          <input
                            type="text"
                            value={totpSeed}
                            onChange={(e) => setTotpSeed(e.target.value)}
                            placeholder="JBSWY3DPEHPK3PXP..."
                            className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30 transition-colors"
                          />
                        </div>
                      </div>

                      {/* Password History Drawer (If present) */}
                      {passwordHistory.length > 0 && (
                        <div className="pt-2 border-t border-white/[0.04]">
                          <button
                            type="button"
                            onClick={() => setShowPasswordHistory(!showPasswordHistory)}
                            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>Historial de Contraseñas ({passwordHistory.length})</span>
                          </button>

                          {showPasswordHistory && (
                            <div className="mt-2 space-y-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                              {passwordHistory.map((ph, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center justify-between p-2 rounded-lg bg-[#08090a] border border-white/[0.06] text-xs font-mono"
                                >
                                  <span className="truncate text-zinc-300">{ph.password}</span>
                                  <div className="flex items-center gap-2 shrink-0 text-zinc-500 text-[10px]">
                                    <span>{new Date(ph.changed_at).toLocaleDateString()}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        copyToClipboardSecurely(ph.password, 45000);
                                        toast.success('Contraseña copiada');
                                      }}
                                      className="p-1 hover:text-zinc-300"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 2. CARD TYPE */}
                  {itemType === 'card' && (
                    <div className="space-y-3 p-3.5 rounded-xl bg-[#121419] border border-white/[0.06]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-zinc-500" />
                            <span>Titular de la Tarjeta</span>
                          </label>
                          <input
                            type="text"
                            value={cardholderName}
                            onChange={(e) => setCardholderName(e.target.value)}
                            placeholder="NOMBRE APELLIDO"
                            className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30 transition-colors uppercase"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                            <CreditCard className="w-3.5 h-3.5 text-zinc-500" />
                            <span>Número de Tarjeta</span>
                          </label>
                          <input
                            type="text"
                            value={cardNumber}
                            onChange={(e) => handleCardNumberChange(e.target.value)}
                            placeholder="4532 •••• •••• ••••"
                            className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30 transition-colors"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 pt-1">
                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 block">Marca</label>
                          <select
                            value={cardBrand}
                            onChange={(e) => setCardBrand(e.target.value as CardBrand)}
                            className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-white/30 transition-colors"
                          >
                            <option value="visa">Visa</option>
                            <option value="mastercard">Mastercard</option>
                            <option value="amex">Amex</option>
                            <option value="discover">Discover</option>
                            <option value="other">Otra</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 block">Vencimiento</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              maxLength={2}
                              value={expMonth}
                              onChange={(e) => setExpMonth(e.target.value)}
                              placeholder="MM"
                              className="w-1/2 bg-[#08090a] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs font-mono text-center text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30"
                            />
                            <span className="text-zinc-600">/</span>
                            <input
                              type="text"
                              maxLength={4}
                              value={expYear}
                              onChange={(e) => setExpYear(e.target.value)}
                              placeholder="AA"
                              className="w-1/2 bg-[#08090a] border border-white/[0.08] rounded-lg px-2 py-1.5 text-xs font-mono text-center text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 block">CVV</label>
                          <div className="relative">
                            <input
                              type={showCvv ? 'text' : 'password'}
                              maxLength={4}
                              value={cvv}
                              onChange={(e) => setCvv(e.target.value)}
                              placeholder="123"
                              className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg pl-2 pr-7 py-1.5 text-xs font-mono text-center text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30"
                            />
                            <button
                              type="button"
                              onClick={() => setShowCvv(!showCvv)}
                              className="absolute right-1 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1"
                            >
                              {showCvv ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 block">PIN (Cajero)</label>
                          <div className="relative">
                            <input
                              type={showPin ? 'text' : 'password'}
                              maxLength={6}
                              value={pin}
                              onChange={(e) => setPin(e.target.value)}
                              placeholder="••••"
                              className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg pl-2 pr-7 py-1.5 text-xs font-mono text-center text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPin(!showPin)}
                              className="absolute right-1 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1"
                            >
                              {showPin ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3. NOTE TYPE */}
                  {itemType === 'note' && (
                    <div className="space-y-2 p-3.5 rounded-xl bg-[#121419] border border-white/[0.06]">
                      <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Contenido Seguro (Cifrado de Extremo a Extremo)</span>
                      </label>
                      <textarea
                        rows={6}
                        value={contentMarkdown}
                        onChange={(e) => setContentMarkdown(e.target.value)}
                        placeholder="Escribe aquí tu información confidencial, claves mnemónicas, códigos o notas privadas..."
                        className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-2 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30 resize-y transition-colors"
                      />
                    </div>
                  )}

                  {/* 4. SERVER KEY TYPE */}
                  {itemType === 'server_key' && (
                    <div className="space-y-3 p-3.5 rounded-xl bg-[#121419] border border-white/[0.06]">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2">
                          <label className="text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                            <Server className="w-3.5 h-3.5 text-zinc-500" />
                            <span>Servidor / Host IP</span>
                          </label>
                          <input
                            type="text"
                            value={serverHost}
                            onChange={(e) => setServerHost(e.target.value)}
                            placeholder="192.168.1.100 o bastion.revolt.internal"
                            className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                            <Hash className="w-3.5 h-3.5 text-zinc-500" />
                            <span>Puerto</span>
                          </label>
                          <input
                            type="number"
                            value={serverPort}
                            onChange={(e) => setServerPort(e.target.value)}
                            placeholder="22"
                            className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-zinc-500" />
                          <span>Usuario SSH</span>
                        </label>
                        <input
                          type="text"
                          value={serverUsername}
                          onChange={(e) => setServerUsername(e.target.value)}
                          placeholder="root o ubuntu"
                          className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-zinc-300 mb-1 block">Clave Pública (ssh-rsa / ssh-ed25519)</label>
                        <textarea
                          rows={2}
                          value={publicKey}
                          onChange={(e) => setPublicKey(e.target.value)}
                          placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5..."
                          className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30 resize-none"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-medium text-zinc-300 block">Clave Privada (RSA / OpenSSH)</label>
                          <button
                            type="button"
                            onClick={() => setShowPrivateKey(!showPrivateKey)}
                            className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                          >
                            {showPrivateKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            <span>{showPrivateKey ? 'Ocultar' : 'Revelar'}</span>
                          </button>
                        </div>
                        <textarea
                          rows={3}
                          value={privateKey}
                          onChange={(e) => setPrivateKey(e.target.value)}
                          placeholder="-----BEGIN OPENSSH PRIVATE KEY-----\n..."
                          className={`w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30 resize-none ${
                            !showPrivateKey ? 'blur-sm select-none' : ''
                          }`}
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-medium text-zinc-300 block">Frase de Contraseña (Passphrase)</label>
                          <button
                            type="button"
                            onClick={() => setShowPassphrase(!showPassphrase)}
                            className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                          >
                            {showPassphrase ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                            <span>{showPassphrase ? 'Ocultar' : 'Revelar'}</span>
                          </button>
                        </div>
                        <input
                          type={showPassphrase ? 'text' : 'password'}
                          value={passphrase}
                          onChange={(e) => setPassphrase(e.target.value)}
                          placeholder="Passphrase opcional para la clave"
                          className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30"
                        />
                      </div>
                    </div>
                  )}

                  {/* 5. IDENTITY TYPE */}
                  {itemType === 'identity' && (
                    <div className="space-y-3 p-3.5 rounded-xl bg-[#121419] border border-white/[0.06]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 block">Nombre</label>
                          <input
                            type="text"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                            placeholder="Juan"
                            className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 block">Apellido</label>
                          <input
                            type="text"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                            placeholder="Pérez"
                            className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1">
                            <Mail className="w-3 h-3 text-zinc-500" />
                            <span>Email</span>
                          </label>
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="juan@ejemplo.com"
                            className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1">
                            <Phone className="w-3 h-3 text-zinc-500" />
                            <span>Teléfono</span>
                          </label>
                          <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="+54 9 11 ..."
                            className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1">
                            <Hash className="w-3 h-3 text-zinc-500" />
                            <span>DNI / Pasaporte</span>
                          </label>
                          <input
                            type="text"
                            value={idNumber}
                            onChange={(e) => setIdNumber(e.target.value)}
                            placeholder="12345678"
                            className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-zinc-500" />
                          <span>Dirección Completa</span>
                        </label>
                        <input
                          type="text"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="Calle 123, Ciudad, Provincia, Código Postal"
                          className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30"
                        />
                      </div>
                    </div>
                  )}

                  {/* 6. TOTP TYPE */}
                  {itemType === 'totp' && (
                    <div className="space-y-3 p-3.5 rounded-xl bg-[#121419] border border-white/[0.06]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-zinc-500" />
                            <span>{t('itemModal.accountLabel')}</span>
                          </label>
                          <input
                            type="text"
                            value={account}
                            onChange={(e) => setAccount(e.target.value)}
                            placeholder={t('itemModal.accountPlaceholder')}
                            className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                            <Key className="w-3.5 h-3.5 text-zinc-500" />
                            <span>Secreto Base32</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={secret}
                            onChange={(e) => setSecret(e.target.value)}
                            placeholder="JBSWY3DPEHPK3PXP..."
                            className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <div>
                          <label className="text-[11px] text-zinc-400 block mb-1">Dígitos</label>
                          <select
                            value={digits}
                            onChange={(e) => setDigits(Number(e.target.value) as 6 | 8)}
                            className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-white/30"
                          >
                            <option value={6}>6 dígitos</option>
                            <option value={8}>8 dígitos</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400 block mb-1">Período</label>
                          <input
                            type="number"
                            value={period}
                            onChange={(e) => setPeriod(Number(e.target.value))}
                            placeholder="30"
                            className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-white/30"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-zinc-400 block mb-1">Algoritmo</label>
                          <select
                            value={algorithm}
                            onChange={(e) => setAlgorithm(e.target.value as TotpAlgorithm)}
                            className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-white/30"
                          >
                            <option value="SHA1">SHA-1</option>
                            <option value="SHA256">SHA-256</option>
                          </select>
                        </div>
                      </div>

                      {/* RECOVERY CODES MANAGER */}
                      <div className="pt-3 border-t border-white/[0.06] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white">
                            {t('itemModal.recoveryCodesTitle')}
                          </span>
                          {recoveryCodes.length > 0 && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                              {availableCount} · {usedCount}
                            </span>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <textarea
                            rows={2}
                            placeholder={t('itemModal.recoveryCodePlaceholder')}
                            value={codeInput}
                            onChange={(e) => setCodeInput(e.target.value)}
                            className="flex-1 bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30 resize-none transition-colors"
                          />
                          <button
                            type="button"
                            onClick={handleAddCodes}
                            disabled={!codeInput.trim()}
                            className="px-3.5 bg-[#16181d] hover:bg-[#1c1f24] text-zinc-200 border border-white/[0.08] rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition-all active:scale-[0.99] disabled:opacity-40 shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{t('itemModal.addCodeButton')}</span>
                          </button>
                        </div>

                        {recoveryCodes.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1 pt-1 custom-scrollbar">
                            {recoveryCodes.map((rc, idx) => (
                              <div
                                key={idx}
                                className={`flex items-center justify-between p-2 rounded-lg text-xs font-mono transition-colors border ${
                                  rc.used
                                    ? 'bg-transparent border-white/[0.04] text-zinc-600 line-through'
                                    : 'bg-[#08090a] border-white/[0.08] text-zinc-200'
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
                                    >
                                      {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                    </button>
                                  )}
                                  <input
                                    type="checkbox"
                                    checked={rc.used}
                                    onChange={() => handleToggleCodeUsed(idx)}
                                    className="rounded bg-[#08090a] border-white/20 text-white focus:ring-0 cursor-pointer"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveCode(idx)}
                                    className="p-1 text-zinc-500 hover:text-rose-400 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* COMMON: LOGO / PHOTO CUSTOMIZATION */}
                  {itemType !== 'note' && (
                    <div className="p-3 rounded-lg bg-[#16181d]/40 border border-white/[0.06] space-y-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-3">
                          <div className="relative group/avatar">
                            <BrandIcon issuer={issuer || item?.issuer || 'Revolt'} iconUrl={iconUrl} size={38} className="shrink-0 ring-1 ring-white/10" />
                            {iconUrl && (
                              <button
                                type="button"
                                onClick={() => setIconUrl('')}
                                className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-zinc-800 border border-white/20 text-zinc-400 hover:text-rose-400 shadow-md transition-colors"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-white flex items-center gap-1">
                              <ImageIcon className="w-3 h-3 text-indigo-400" />
                              <span>{t('itemModal.iconLabel')}</span>
                            </h4>
                            <p className="text-[10px] text-zinc-400">
                              {iconUrl ? 'Logo personalizado' : 'Subir imagen o URL'}
                            </p>
                          </div>
                        </div>

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
                            className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                          >
                            <Upload className="w-3 h-3 text-zinc-400" />
                            <span>{isUploadingImage ? 'Cargando...' : 'Subir'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowUrlInput(!showUrlInput)}
                            className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-white/10 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
                          >
                            <Link className="w-3 h-3" />
                            <span>URL</span>
                          </button>
                        </div>
                      </div>

                      {showUrlInput && (
                        <div className="pt-2 border-t border-white/[0.06] flex gap-2">
                          <input
                            type="url"
                            value={iconUrl.startsWith('data:') ? '' : iconUrl}
                            onChange={(e) => setIconUrl(e.target.value)}
                            placeholder="https://ejemplo.com/logo.png"
                            className="flex-1 bg-zinc-950 border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* COMMON: TAGS */}
                  <div>
                    <label className="text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{t('itemModal.tagsLabel')}</span>
                    </label>
                    <input
                      type="text"
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      placeholder={t('itemModal.tagsPlaceholder')}
                      className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30 transition-colors"
                    />
                  </div>

                  {/* COMMON: NOTES (If not note type) */}
                  {itemType !== 'note' && (
                    <div>
                      <label className="text-xs font-medium text-zinc-300 mb-1 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{t('itemModal.notesLabel')}</span>
                      </label>
                      <textarea
                        rows={2}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={t('itemModal.notesPlaceholder')}
                        className="w-full bg-[#08090a] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-white/30 resize-none transition-colors"
                      />
                    </div>
                  )}

                  {/* BOTTOM ACTION BUTTONS */}
                  <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/[0.08]">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3.5 py-1.5 text-xs font-medium text-zinc-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-1.5 bg-white text-black font-semibold hover:bg-zinc-200 active:scale-[0.99] rounded-lg text-xs shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-black" />
                      <span>{isSaving ? t('common.loading') : (isEditing ? t('itemModal.saveChangesButton') : 'Crear Secreto')}</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>

      {item && (
        <AccountQrModal
          isOpen={showQrModal}
          onClose={() => setShowQrModal(false)}
          item={item}
        />
      )}
    </Dialog.Root>
  );
}
