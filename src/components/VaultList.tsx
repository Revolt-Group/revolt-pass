import { useState, useMemo } from 'react';
import { useAutoAnimate } from '@formkit/auto-animate/react';
import {
  Search,
  Plus,
  Pin,
  ShieldOff,
  Filter,
  LayoutGrid,
  List as ListIcon,
  Shield,
  Key,
  CreditCard,
  FileText,
  Terminal,
  User,
  Trash2,
} from 'lucide-react';
import { PolymorphicItemCard } from './PolymorphicItemCard.tsx';
import { useTranslation } from '../i18n/index.ts';
import type { VaultItem, VaultItemType } from '../types/vault.ts';

type CategoryFilter = 'all' | VaultItemType | 'trash';

interface VaultListProps {
  items: VaultItem[];
  onTogglePin: (id: string) => void;
  onDelete: (id: string) => void;
  onRestore?: (id: string) => void;
  onPurge?: (id: string) => void;
  onEmptyTrash?: () => void;
  onToggleRecoveryCode: (id: string, codeIndex: number) => void;
  onOpenAddModal: () => void;
  onEditAccount: (item: VaultItem) => void;
}

export function VaultList({
  items,
  onTogglePin,
  onDelete,
  onRestore,
  onPurge,
  onEmptyTrash,
  onToggleRecoveryCode,
  onOpenAddModal,
  onEditAccount,
}: VaultListProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [parentListRef] = useAutoAnimate<HTMLDivElement>();
  const [pinnedListRef] = useAutoAnimate<HTMLDivElement>();

  // Extract all unique tags across registered accounts
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.tags && !item.deleted_at) {
        for (const tg of item.tags) {
          set.add(tg);
        }
      }
    }
    return Array.from(set).sort();
  }, [items]);

  // Counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryFilter, number> = {
      all: 0,
      totp: 0,
      login: 0,
      card: 0,
      note: 0,
      server_key: 0,
      identity: 0,
      trash: 0,
    };

    for (const item of items) {
      if (item.deleted_at) {
        counts.trash++;
      } else {
        counts.all++;
        const itemType = (item.type || 'totp') as VaultItemType;
        if (itemType in counts) {
          counts[itemType]++;
        }
      }
    }
    return counts;
  }, [items]);

  // Filter accounts by search query, selected category, and selected tag
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return items.filter((item) => {
      // 1. Category Filter
      if (selectedCategory === 'trash') {
        if (!item.deleted_at) return false;
      } else {
        if (item.deleted_at) return false;
        if (selectedCategory !== 'all') {
          const itemType = item.type || 'totp';
          if (itemType !== selectedCategory) return false;
        }
      }

      // 2. Search Query Filter
      const matchSearch =
        !q ||
        item.issuer.toLowerCase().includes(q) ||
        item.account.toLowerCase().includes(q) ||
        item.tags?.some((tg) => tg.toLowerCase().includes(q)) ||
        (item.login_data?.username && item.login_data.username.toLowerCase().includes(q)) ||
        (item.login_data?.urls && item.login_data.urls.some((u) => u.toLowerCase().includes(q))) ||
        (item.note_data?.title && item.note_data.title.toLowerCase().includes(q)) ||
        (item.server_key_data?.host && item.server_key_data.host.toLowerCase().includes(q));

      // 3. Tag Filter
      const matchTag = !selectedTag || item.tags?.includes(selectedTag);

      return matchSearch && matchTag;
    });
  }, [items, searchQuery, selectedCategory, selectedTag]);

  const pinnedItems = selectedCategory === 'trash' ? [] : filteredItems.filter((i) => i.pinned);
  const regularItems = selectedCategory === 'trash' ? filteredItems : filteredItems.filter((i) => !i.pinned);

  const categories: Array<{ id: CategoryFilter; label: string; icon: typeof Shield }> = [
    { id: 'all', label: t('common.filterAll'), icon: Shield },
    { id: 'login', label: 'Inicios', icon: Key },
    { id: 'totp', label: '2FA', icon: Shield },
    { id: 'card', label: 'Tarjetas', icon: CreditCard },
    { id: 'note', label: 'Notas', icon: FileText },
    { id: 'server_key', label: 'SSH / Servidores', icon: Terminal },
    { id: 'identity', label: 'Identidades', icon: User },
    { id: 'trash', label: 'Papelera', icon: Trash2 },
  ];

  return (
    <div className="w-full space-y-5">
      {/* Category Navigation Pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs select-none">
        {categories.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          const count = categoryCounts[cat.id] || 0;
          const IconComp = cat.icon;
          const isTrashCategory = cat.id === 'trash';

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setSelectedCategory(cat.id);
                setSelectedTag(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 shrink-0 ${
                isSelected
                  ? isTrashCategory
                    ? 'bg-red-500/20 text-red-300 border border-red-500/40 shadow-sm'
                    : 'bg-white text-black font-semibold shadow-sm'
                  : isTrashCategory
                  ? count > 0
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                    : 'bg-[#16181d] border border-white/[0.08] text-zinc-500 hover:text-zinc-400'
                  : 'bg-[#16181d] border border-white/[0.08] text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <IconComp className={`w-3.5 h-3.5 ${isSelected ? (isTrashCategory ? 'text-red-400' : 'text-black') : ''}`} />
              <span>{cat.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isSelected
                    ? isTrashCategory
                      ? 'bg-red-500/30 text-red-200'
                      : 'bg-black/10 text-black'
                    : 'bg-white/[0.06] text-zinc-400'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters, Search, and Top Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-[#0f1013] border border-white/[0.08] p-2 rounded-xl hairline-top shadow-sm">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder={selectedCategory === 'trash' ? 'Buscar en la papelera...' : t('nav.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#08090a] border border-white/[0.08] rounded-lg text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-white/30 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Switcher */}
          <div className="flex items-center bg-[#08090a] border border-white/[0.08] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-[#16181d] text-white border border-white/[0.08]'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list'
                  ? 'bg-[#16181d] text-white border border-white/[0.08]'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <ListIcon className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Action Button: Empty Trash or Add Account */}
          {selectedCategory === 'trash' ? (
            categoryCounts.trash > 0 && onEmptyTrash && (
              <button
                type="button"
                onClick={onEmptyTrash}
                className="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 text-red-300 rounded-lg text-xs font-medium shadow-sm flex items-center justify-center gap-1.5 transition-all shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                <span>Vaciar Papelera</span>
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={onOpenAddModal}
              className="px-3 py-1.5 bg-white hover:bg-zinc-200 text-black rounded-lg text-xs font-medium shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.99] shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-black" />
              <span>{t('nav.newEntry')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tag Filter Pills */}
      {allTags.length > 0 && selectedCategory !== 'trash' && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs select-none">
          <span className="text-zinc-500 flex items-center gap-1 px-1 text-[11px] font-mono uppercase">
            <Filter className="w-3 h-3" />
            {t('vault.filtersLabel')}
          </span>
          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              selectedTag === null
                ? 'bg-white text-black font-semibold shadow-sm'
                : 'bg-[#16181d] border border-white/[0.08] text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t('common.filterAll')}
          </button>
          {allTags.map((tag) => {
            const isSelected = selectedTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(isSelected ? null : tag)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  isSelected
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'bg-[#16181d] border border-white/[0.08] text-zinc-400 hover:text-zinc-200'
                }`}
              >
                #{tag}
              </button>
            );
          })}
        </div>
      )}

      {/* Trash Bin Header Notice */}
      {selectedCategory === 'trash' && (
        <div className="p-3 bg-red-950/20 border border-red-500/20 rounded-xl text-xs text-red-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-400 shrink-0" />
            <span>Los secretos en papelera se purgan permanentemente tras 30 días de antigüedad.</span>
          </div>
          <span className="text-[11px] font-mono text-zinc-400 shrink-0">
            {categoryCounts.trash} {categoryCounts.trash === 1 ? 'secreto' : 'secretos'}
          </span>
        </div>
      )}

      {/* Empty State: Empty Vault */}
      {categoryCounts.all === 0 && selectedCategory !== 'trash' && (
        <div className="py-20 flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/[0.08] rounded-2xl bg-[#0f1013]/50">
          <div className="w-12 h-12 rounded-xl bg-[#16181d] border border-white/[0.1] hairline-top flex items-center justify-center text-zinc-300 mb-3.5">
            <Plus className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-base font-semibold text-white mb-1">{t('vault.emptyTitle')}</h3>
          <p className="text-xs text-zinc-400 max-w-sm mb-5">
            {t('vault.emptySubtitle')}
          </p>
          <button
            type="button"
            onClick={onOpenAddModal}
            className="px-4 py-2 bg-white hover:bg-zinc-200 text-black rounded-lg text-xs font-medium shadow-sm flex items-center gap-1.5 transition-all active:scale-[0.99]"
          >
            <Plus className="w-3.5 h-3.5 text-black" />
            <span>{t('vault.createFirstItem')}</span>
          </button>
        </div>
      )}

      {/* Empty State: Empty Trash */}
      {selectedCategory === 'trash' && categoryCounts.trash === 0 && (
        <div className="py-16 flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/[0.08] rounded-2xl bg-[#0f1013]/50">
          <Trash2 className="w-8 h-8 text-zinc-600 mb-2.5" />
          <h4 className="text-sm font-semibold text-white mb-1">La papelera está vacía</h4>
          <p className="text-xs text-zinc-500">No hay elementos eliminados recientemente.</p>
        </div>
      )}

      {/* Empty State: No Search / Filter Results */}
      {filteredItems.length === 0 && (categoryCounts.all > 0 || categoryCounts.trash > 0) && (
        <div className="py-14 flex flex-col items-center justify-center text-center p-6 border border-white/[0.08] rounded-xl bg-[#0f1013]/50">
          <ShieldOff className="w-8 h-8 text-zinc-500 mb-2.5" />
          <h4 className="text-sm font-semibold text-white mb-1">{t('vault.noResultsTitle')}</h4>
          <p className="text-xs text-zinc-400 mb-4">
            {t('vault.noResultsSubtitle')}
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedTag(null);
              setSelectedCategory('all');
            }}
            className="px-3 py-1.5 bg-[#16181d] hover:bg-[#1c1f24] text-zinc-300 border border-white/[0.08] rounded-lg text-xs"
          >
            {t('vault.clearFilters')}
          </button>
        </div>
      )}

      {/* Section 1: Pinned Accounts */}
      {pinnedItems.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-mono font-medium text-zinc-400 uppercase tracking-wider px-1">
            <Pin className="w-3 h-3 text-zinc-300" />
            <span>{t('nav.pinnedVaults')} ({pinnedItems.length})</span>
          </div>
          <div
            ref={pinnedListRef}
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 w-full max-w-full'
                : 'flex flex-col gap-2 w-full max-w-full'
            }
          >
            {pinnedItems.map((item) => (
              <PolymorphicItemCard
                key={item.id}
                item={item}
                viewMode={viewMode}
                onTogglePin={onTogglePin}
                onDelete={onDelete}
                onRestore={onRestore}
                onPurge={onPurge}
                onToggleRecoveryCode={onToggleRecoveryCode}
                onEdit={onEditAccount}
              />
            ))}
          </div>
        </div>
      )}

      {/* Section 2: All Remaining Accounts */}
      {regularItems.length > 0 && (
        <div>
          {pinnedItems.length > 0 && (
            <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-mono font-medium text-zinc-500 uppercase tracking-wider px-1">
              <span>{t('nav.allVaults')} ({regularItems.length})</span>
            </div>
          )}
          <div
            ref={parentListRef}
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 w-full max-w-full'
                : 'flex flex-col gap-2 w-full max-w-full'
            }
          >
            {regularItems.map((item) => (
              <PolymorphicItemCard
                key={item.id}
                item={item}
                viewMode={viewMode}
                onTogglePin={onTogglePin}
                onDelete={onDelete}
                onRestore={onRestore}
                onPurge={onPurge}
                onToggleRecoveryCode={onToggleRecoveryCode}
                onEdit={onEditAccount}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

