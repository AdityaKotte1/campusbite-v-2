'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  Plus,
  Pencil,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  RefreshCw,
  PackageCheck,
  PackageX,
  Infinity,
  ImageIcon,
  Upload,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/formatting';
import { useAuthStore } from '@/store/auth-store';
import { useScopeStore } from '@/store/scope-store';
import type { MenuItem, Category, Canteen } from '@/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const ADMIN_ONLY_ROLES = ['super_admin', 'canteen_admin'];

// ─── Zod schemas ──────────────────────────────────────────────────────────────
const menuItemSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  description: z.string().optional(),
  price_paise: z.coerce.number().min(1, 'Price is required'),
  category_id: z.string().optional(),
  canteen_id: z.string().min(1, 'Canteen is required'),
  image_url: z.string().optional(),
  is_veg: z.boolean().default(true),
  prep_time_minutes: z.coerce.number().min(1).default(15),
  is_available: z.boolean().default(true),
  stock_enabled: z.boolean().default(false),
  stock_count: z.coerce.number().min(0).optional().nullable(),
});

type MenuItemForm = z.infer<typeof menuItemSchema>;

const categorySchema = z.object({
  canteen_id: z.string().min(1, 'Canteen is required'),
  name: z.string().min(1, 'Category name is required'),
  icon: z.string().optional(),
  description: z.string().optional(),
  sort_order: z.coerce.number().default(0),
  separate_billing: z.boolean().default(false),
});

type CategoryForm = z.infer<typeof categorySchema>;

// ─── Extended types ───────────────────────────────────────────────────────────
type MenuItemWithStock = MenuItem & {
  stock_enabled?: boolean;
  stock_count?: number | null;
  canteen?: Canteen;
};

type CategoryWithCanteen = Category & {
  canteens?: { id: string; name: string } | null;
  item_count?: number;
};

// ─── Stock badge ──────────────────────────────────────────────────────────────
function StockBadge({ item }: { item: MenuItemWithStock }) {
  if (!item.stock_enabled) {
    return (
      <span className="text-xs text-text-3 flex items-center gap-1">
        <Infinity className="w-3 h-3" /> Unlimited
      </span>
    );
  }
  if (item.stock_count === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
        <PackageX className="w-3 h-3" /> Sold out
      </span>
    );
  }
  const isLow = (item.stock_count ?? 0) <= 5;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums ${
        isLow ? 'text-amber-dark bg-amber-pale' : 'text-green-dark bg-green-light'
      }`}
    >
      <PackageCheck className="w-3 h-3" />
      {item.stock_count} {isLow ? 'Low' : 'units'}
    </span>
  );
}

// ─── Refill popover ───────────────────────────────────────────────────────────
function RefillPopover({
  item,
  onDone,
}: {
  item: MenuItemWithStock;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCount(String(item.stock_count ?? ''));
      setErr('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, item.stock_count]);

  const save = async () => {
    const n = parseInt(count, 10);
    if (isNaN(n) || n < 0) {
      setErr('Enter 0 or more');
      return;
    }
    setSaving(true);
    try {
      await axios.patch(`/api/v1/admin/menu-items/${item.id}/stock`, {
        action: 'refill',
        count: n,
      });
      setOpen(false);
      onDone();
    } catch {
      setErr('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen((o) => !o)}
        title="Set stock / Refill"
        className="text-text-2 hover:text-brand"
      >
        <RefreshCw className="w-3.5 h-3.5" />
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 bg-surface border border-border rounded-xl shadow-lg p-3 w-52">
            <p className="text-xs font-semibold text-text mb-2 truncate">{item.name}</p>
            <p className="text-xs text-text-3 mb-2">Set new stock count (0 = sold out)</p>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="number"
                min="0"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                placeholder="e.g. 50"
                className="flex-1 h-8 px-2 text-sm tabular-nums border border-border-2 rounded-lg focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
              />
              <button
                onClick={save}
                disabled={saving}
                className="h-8 px-3 bg-brand text-white text-xs font-semibold rounded-lg disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
              </button>
            </div>
            {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
            {item.stock_enabled && (
              <button
                onClick={async () => {
                  await axios.patch(`/api/v1/admin/menu-items/${item.id}/stock`, {
                    action: 'disable',
                  });
                  setOpen(false);
                  onDone();
                }}
                className="mt-2 text-xs text-text-3 hover:text-text underline w-full text-left"
              >
                Remove stock limit (unlimited)
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function MenuPage() {
  const [tab, setTab] = useState<'items' | 'categories'>('items');
  const [showItemDialog, setShowItemDialog] = useState(false);
  const [editItem, setEditItem] = useState<MenuItemWithStock | null>(null);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [editCategory, setEditCategory] = useState<CategoryWithCanteen | null>(null);

  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { instituteId, canteenId } = useScopeStore();
  const userRole = (user as { role?: string })?.role ?? '';
  const isAdminOnly = ADMIN_ONLY_ROLES.includes(userRole);

  const { data: canteensData } = useQuery<{ data: Canteen[] }>({
    queryKey: ['canteens', instituteId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (instituteId) params.institute_id = instituteId;
      const { data } = await axios.get('/api/v1/admin/canteens', { params });
      return data;
    },
  });

  const { data: itemsData, isLoading: itemsLoading } = useQuery<{
    data: MenuItemWithStock[];
  }>({
    queryKey: ['menu-items', instituteId, canteenId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (instituteId) params.institute_id = instituteId;
      if (canteenId) params.canteen_id = canteenId;
      const { data } = await axios.get('/api/v1/admin/menu-items', { params });
      return data;
    },
    enabled: tab === 'items',
    refetchInterval: 30_000,
  });

  const { data: categoriesData, isLoading: catLoading } = useQuery<{
    data: CategoryWithCanteen[];
  }>({
    queryKey: ['categories'],
    queryFn: () => axios.get('/api/v1/admin/categories').then((r) => r.data),
  });

  const canteens = canteensData?.data ?? [];
  const items = itemsData?.data ?? [];
  const categories = categoriesData?.data ?? [];

  const toggleAvailability = async (item: MenuItemWithStock) => {
    await axios.patch(`/api/v1/admin/menu-items/${item.id}/stock`, {
      action: 'toggle_available',
      is_available: !item.is_available,
    });
    queryClient.invalidateQueries({ queryKey: ['menu-items'] });
  };

  const deleteItem = async (id: string) => {
    if (!confirm('Delete this menu item? This cannot be undone.')) return;
    await axios.delete(`/api/v1/admin/menu-items/${id}`);
    queryClient.invalidateQueries({ queryKey: ['menu-items'] });
  };

  const deleteCategory = async (id: string) => {
    if (!confirm('Delete this category? This cannot be undone.')) return;
    await axios.delete(`/api/v1/admin/categories/${id}`);
    queryClient.invalidateQueries({ queryKey: ['categories'] });
  };

  // Build item count per category
  const itemCountByCategory: Record<string, number> = {};
  items.forEach((item) => {
    if (item.category_id) {
      itemCountByCategory[item.category_id] =
        (itemCountByCategory[item.category_id] ?? 0) + 1;
    }
  });

  const itemTableHeaders = isAdminOnly
    ? ['Item', 'Category', 'Canteen', 'Price', 'Type', 'Stock', 'Availability', 'Actions']
    : ['Item', 'Category', 'Canteen', 'Price', 'Type', 'Stock', 'Availability', 'Refill'];

  return (
    <div className="space-y-5">
      {/* Tabs + action button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 bg-bg-2 border border-border rounded-lg p-1">
          {(['items', 'categories'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                tab === t
                  ? 'bg-surface shadow-sm text-brand'
                  : 'text-text-2 hover:text-text'
              }`}
            >
              {t === 'items' ? 'Menu Items' : 'Categories'}
            </button>
          ))}
        </div>

        {tab === 'items' && isAdminOnly && (
          <Button
            onClick={() => {
              setEditItem(null);
              setShowItemDialog(true);
            }}
          >
            <Plus className="w-4 h-4" /> Add Item
          </Button>
        )}

        {tab === 'categories' && isAdminOnly && (
          <Button
            onClick={() => {
              setEditCategory(null);
              setShowCategoryDialog(true);
            }}
          >
            <Plus className="w-4 h-4" /> Add Category
          </Button>
        )}
      </div>

      {/* Staff info banner */}
      {tab === 'items' && !isAdminOnly && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700 flex items-center gap-2">
          <PackageCheck className="w-4 h-4 flex-shrink-0" />
          You can toggle item availability and set stock counts. Contact your canteen admin to add
          or remove items.
        </div>
      )}

      {/* ── Items Tab ── */}
      {tab === 'items' && (
        <div className="bg-surface rounded-xl border border-border overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr>
                {itemTableHeaders.map((h) => (
                  <th
                    key={h}
                    className="h-10 px-4 text-left text-xs font-semibold text-text-3 uppercase tracking-wide bg-bg-2 border-b border-border whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itemsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array(itemTableHeaders.length)
                      .fill(0)
                      .map((_, j) => (
                        <td key={j} className="px-4 py-3 border-b border-border">
                          <div className="h-4 bg-bg-2 rounded animate-pulse" />
                        </td>
                      ))}
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={itemTableHeaders.length}
                    className="px-4 py-16 text-center"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-amber-pale flex items-center justify-center">
                        <UtensilsCrossed className="w-6 h-6 text-amber-dark" />
                      </div>
                      <p className="font-display text-lg font-semibold tracking-tight text-text">No menu items yet</p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-border last:border-0 hover:bg-bg-2 transition-colors ${
                      !item.is_available ? 'opacity-60' : ''
                    }`}
                  >
                    {/* Item (photo + name + desc) */}
                    <td className="px-4 py-3 min-w-[200px]">
                      <div className="flex items-center gap-3">
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image_url}
                            alt={item.name}
                            width={40}
                            height={40}
                            className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-border"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-brand-pale border border-border flex items-center justify-center flex-shrink-0">
                            <UtensilsCrossed className="w-4 h-4 text-brand" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-text truncate">{item.name}</p>
                          {item.description && (
                            <p className="text-xs text-text-3 mt-0.5 line-clamp-1">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3 text-text-2 whitespace-nowrap">
                      {item.category?.name ?? '—'}
                    </td>

                    {/* Canteen */}
                    <td className="px-4 py-3 text-text-2 whitespace-nowrap">
                      {item.canteen?.name ?? '—'}
                    </td>

                    {/* Price */}
                    <td className="px-4 py-3 font-display font-semibold tracking-tight text-text whitespace-nowrap tabular-nums">
                      {formatCurrency(item.price_paise)}
                    </td>

                    {/* Veg / Non-Veg */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                          item.is_veg
                            ? 'bg-green-light text-green-dark'
                            : 'bg-red-50 text-red-600'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${item.is_veg ? 'bg-green' : 'bg-red-500'}`}
                        />
                        {item.is_veg ? 'Veg' : 'Non-Veg'}
                      </span>
                    </td>

                    {/* Stock */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StockBadge item={item} />
                    </td>

                    {/* Availability toggle */}
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleAvailability(item)}
                        title={
                          item.is_available
                            ? 'Click to mark as unavailable'
                            : 'Click to mark as available'
                        }
                        className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                          item.is_available
                            ? 'text-green-dark hover:text-green'
                            : 'text-text-3 hover:text-text'
                        }`}
                      >
                        {item.is_available ? (
                          <ToggleRight className="w-5 h-5 text-green" />
                        ) : (
                          <ToggleLeft className="w-5 h-5 text-text-3" />
                        )}
                        {item.is_available ? 'Available' : 'Unavailable'}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <RefillPopover
                          item={item}
                          onDone={() =>
                            queryClient.invalidateQueries({ queryKey: ['menu-items'] })
                          }
                        />
                        {isAdminOnly && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => {
                                setEditItem(item);
                                setShowItemDialog(true);
                              }}
                              title="Edit item"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => deleteItem(item.id)}
                              className="text-red-400 hover:text-red-600 hover:bg-red-50"
                              title="Delete item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Categories Tab ── */}
      {tab === 'categories' && (
        <div className="bg-surface rounded-xl border border-border overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr>
                {['Icon', 'Name', 'Canteen', 'Items', 'Sort Order', 'Active', 'Actions'].map(
                  (h) => (
                    <th
                      key={h}
                      className="h-10 px-4 text-left text-xs font-semibold text-text-3 uppercase tracking-wide bg-bg-2 border-b border-border whitespace-nowrap"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {catLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center">
                    <Loader2 className="w-5 h-5 animate-spin text-text-3 mx-auto" />
                  </td>
                </tr>
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-full bg-amber-pale flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-amber-dark" />
                      </div>
                      <p className="font-display text-lg font-semibold tracking-tight text-text">No categories yet</p>
                    </div>
                  </td>
                </tr>
              ) : (
                categories.map((cat) => (
                  <tr
                    key={cat.id}
                    className="border-b border-border last:border-0 hover:bg-bg-2 transition-colors"
                  >
                    {/* Icon */}
                    <td className="px-4 py-3 text-2xl leading-none">
                      {cat.icon ?? (
                        <ImageIcon className="w-5 h-5 text-text-3" />
                      )}
                    </td>

                    {/* Name */}
                    <td className="px-4 py-3 font-medium text-text">{cat.name}</td>

                    {/* Canteen */}
                    <td className="px-4 py-3 text-text-2 whitespace-nowrap">
                      {cat.canteens?.name ?? '—'}
                    </td>

                    {/* Items count */}
                    <td className="px-4 py-3 text-text-2 tabular-nums">
                      {itemCountByCategory[cat.id] ?? 0}
                    </td>

                    {/* Sort Order */}
                    <td className="px-4 py-3 text-text-2 tabular-nums">{cat.sort_order}</td>

                    {/* Active */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={cat.is_active ? 'success' : 'default'} className="gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${cat.is_active ? 'bg-green' : 'bg-text-3'}`} />
                          {cat.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        {cat.separate_billing && (
                          <Badge variant="warning" title="Items in this category must be ordered on their own">
                            Separate billing
                          </Badge>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      {isAdminOnly && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              setEditCategory(cat);
                              setShowCategoryDialog(true);
                            }}
                            title="Edit category"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => deleteCategory(cat.id)}
                            className="text-red-400 hover:text-red-600 hover:bg-red-50"
                            title="Delete category"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Menu Item Dialog */}
      {showItemDialog && isAdminOnly && (
        <MenuItemDialog
          item={editItem}
          categories={categories}
          canteens={canteens}
          onClose={() => setShowItemDialog(false)}
          onSuccess={() => {
            setShowItemDialog(false);
            queryClient.invalidateQueries({ queryKey: ['menu-items'] });
          }}
        />
      )}

      {/* Add/Edit Category Dialog */}
      {showCategoryDialog && isAdminOnly && (
        <CategoryDialog
          category={editCategory}
          canteens={canteens}
          onClose={() => setShowCategoryDialog(false)}
          onSuccess={() => {
            setShowCategoryDialog(false);
            queryClient.invalidateQueries({ queryKey: ['categories'] });
          }}
        />
      )}
    </div>
  );
}

// ─── Menu Item Dialog ─────────────────────────────────────────────────────────
function MenuItemDialog({
  item,
  categories,
  canteens,
  onClose,
  onSuccess,
}: {
  item: MenuItemWithStock | null;
  categories: CategoryWithCanteen[];
  canteens: Canteen[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!item;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState<string>(item?.image_url ?? '');
  const [imageUploading, setImageUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<MenuItemForm>({
    resolver: zodResolver(menuItemSchema),
    defaultValues: item
      ? {
          name: item.name,
          description: item.description ?? '',
          price_paise: item.price_paise / 100,
          category_id: item.category_id ?? '',
          canteen_id: item.canteen_id,
          image_url: item.image_url ?? '',
          is_veg: item.is_veg,
          prep_time_minutes: item.prep_time_minutes,
          is_available: item.is_available,
          stock_enabled: item.stock_enabled ?? false,
          stock_count: item.stock_count ?? null,
        }
      : {
          is_veg: true,
          prep_time_minutes: 15,
          is_available: true,
          stock_enabled: false,
          image_url: '',
        },
  });

  const stockEnabled = watch('stock_enabled');
  const selectedCanteenId = watch('canteen_id');

  // Filter categories by selected canteen
  const filteredCategories = selectedCanteenId
    ? categories.filter((c) => c.canteen_id === selectedCanteenId)
    : [];

  // When canteen changes, reset category selection
  const handleCanteenChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setValue('canteen_id', e.target.value);
    setValue('category_id', '');
  };

  const handleImageUpload = async (file: File) => {
    setImageUploading(true);
    setUploadError('');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/v1/admin/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (json.url) {
        setImageUrl(json.url);
        setValue('image_url', json.url);
      } else {
        setUploadError(json.error?.message ?? 'Upload failed');
      }
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setImageUploading(false);
    }
  };

  const onSubmit = async (values: MenuItemForm) => {
    const payload = {
      ...values,
      price_paise: Math.round(Number(values.price_paise) * 100),
      image_url: imageUrl || null,
      stock_count: values.stock_enabled ? (values.stock_count ?? null) : null,
      category_id: values.category_id || null,
    };

    if (isEdit) {
      await axios.put(`/api/v1/admin/menu-items/${item.id}`, payload);
    } else {
      await axios.post('/api/v1/admin/menu-items', payload);
    }
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-surface rounded-2xl border border-border shadow-lg w-full max-w-lg my-4 max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between">
          <div>
            <p className="eyebrow">Menu</p>
            <h2 className="font-display text-lg font-semibold tracking-tight text-text">
              {isEdit ? 'Edit Menu Item' : 'Add Menu Item'}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-text-3 hover:text-text transition rounded-lg p-1 hover:bg-bg-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          {/* Item Name */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Item Name *</label>
            <Input {...register('name')} placeholder="e.g. Masala Dosa" error={!!errors.name} />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Description</label>
            <textarea
              {...register('description')}
              rows={2}
              placeholder="Short description…"
              className="w-full px-3 py-2 rounded-lg border border-border-2 bg-surface text-sm text-text placeholder:text-text-3 hover:border-text-3 focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand resize-none transition-all"
            />
          </div>

          {/* Canteen */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Canteen *</label>
            <select
              value={selectedCanteenId ?? ''}
              onChange={handleCanteenChange}
              className="w-full h-9 px-3 rounded-lg border border-border-2 bg-surface text-sm text-text hover:border-text-3 focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
            >
              <option value="">Select canteen…</option>
              {canteens.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.canteen_id && (
              <p className="text-xs text-red-500 mt-1">{errors.canteen_id.message}</p>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Category</label>
            <select
              {...register('category_id')}
              className="w-full h-9 px-3 rounded-lg border border-border-2 bg-surface text-sm text-text hover:border-text-3 focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
              disabled={!selectedCanteenId}
            >
              <option value="">
                {selectedCanteenId ? 'No category' : 'Select a canteen first'}
              </option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon ? `${c.icon} ` : ''}{c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Price + Prep Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Price (₹) *</label>
              <Input
                {...register('price_paise')}
                type="number"
                step="0.50"
                min="1"
                placeholder="0.00"
                error={!!errors.price_paise}
              />
              {errors.price_paise && (
                <p className="text-xs text-red-500 mt-1">{errors.price_paise.message}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Prep Time (min)</label>
              <Input {...register('prep_time_minutes')} type="number" min="1" defaultValue={15} />
            </div>
          </div>

          {/* Checkboxes */}
          <div className="flex items-center gap-5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input {...register('is_veg')} type="checkbox" className="accent-green w-4 h-4" />
              <span className="text-sm text-text">Vegetarian</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                {...register('is_available')}
                type="checkbox"
                className="accent-brand w-4 h-4"
              />
              <span className="text-sm text-text">Available</span>
            </label>
          </div>

          {/* Photo Upload */}
          <div className="border border-border rounded-xl p-4 space-y-3">
            <p className="eyebrow">Photo</p>

            {imageUrl && (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt="Preview"
                  className="w-10 h-10 rounded-lg object-cover border border-border"
                />
                <span className="text-xs text-text-2 truncate flex-1">Image uploaded</span>
                <button
                  type="button"
                  onClick={() => {
                    setImageUrl('');
                    setValue('image_url', '');
                  }}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={imageUploading}
              >
                {imageUploading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" /> Upload Photo
                  </>
                )}
              </Button>
              <span className="text-xs text-text-3">Max 5 MB. JPG, PNG or WebP.</span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageUpload(file);
                e.target.value = '';
              }}
            />

            {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
          </div>

          {/* Stock Management */}
          <div className="border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow">Stock Management</p>
                <p className="text-xs text-text-3 mt-0.5">
                  Track units — item auto-disables when stock hits 0
                </p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  {...register('stock_enabled')}
                  type="checkbox"
                  className="accent-brand w-4 h-4"
                />
                <span className="text-sm text-text font-medium">Enable</span>
              </label>
            </div>

            {stockEnabled && (
              <div>
                <label className="block text-xs font-medium text-text-2 mb-1.5">
                  Units available right now
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    {...register('stock_count')}
                    type="number"
                    min="0"
                    placeholder="e.g. 50"
                    className="max-w-[120px]"
                  />
                  <span className="text-xs text-text-3">units (0 = sold out immediately)</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Add Item'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Category Dialog ──────────────────────────────────────────────────────────
function CategoryDialog({
  category,
  canteens,
  onClose,
  onSuccess,
}: {
  category: CategoryWithCanteen | null;
  canteens: Canteen[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = !!category;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
    defaultValues: category
      ? {
          canteen_id: category.canteen_id,
          name: category.name,
          icon: category.icon ?? '',
          description: category.description ?? '',
          sort_order: category.sort_order,
          separate_billing: category.separate_billing ?? false,
        }
      : { sort_order: 0, separate_billing: false },
  });

  const onSubmit = async (values: CategoryForm) => {
    const payload = {
      ...values,
      icon: values.icon || null,
      description: values.description || null,
    };

    if (isEdit) {
      await axios.put(`/api/v1/admin/categories/${category.id}`, payload);
    } else {
      await axios.post('/api/v1/admin/categories', payload);
    }
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 overflow-y-auto">
      <div className="bg-surface rounded-2xl border border-border shadow-lg w-full max-w-md my-4 max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-border flex items-start justify-between">
          <div>
            <p className="eyebrow">Menu</p>
            <h2 className="font-display text-lg font-semibold tracking-tight text-text">
              {isEdit ? 'Edit Category' : 'Add Category'}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-text-3 hover:text-text transition rounded-lg p-1 hover:bg-bg-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          {/* Canteen */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Canteen *</label>
            <select
              {...register('canteen_id')}
              className="w-full h-9 px-3 rounded-lg border border-border-2 bg-surface text-sm text-text hover:border-text-3 focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand transition-all"
            >
              <option value="">Select canteen…</option>
              {canteens.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.canteen_id && (
              <p className="text-xs text-red-500 mt-1">{errors.canteen_id.message}</p>
            )}
          </div>

          {/* Category Name */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Category Name *</label>
            <Input
              {...register('name')}
              placeholder="e.g. Beverages"
              error={!!errors.name}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
          </div>

          {/* Icon */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Icon (emoji)</label>
            <Input {...register('icon')} placeholder="🍕" className="max-w-[80px] text-center text-lg" />
            <p className="text-xs text-text-3 mt-1">Type or paste any emoji</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">
              Description (optional)
            </label>
            <textarea
              {...register('description')}
              rows={2}
              placeholder="Short description…"
              className="w-full px-3 py-2 rounded-lg border border-border-2 bg-surface text-sm text-text placeholder:text-text-3 hover:border-text-3 focus:outline-none focus:ring-4 focus:ring-brand/15 focus:border-brand resize-none transition-all"
            />
          </div>

          {/* Sort Order */}
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Sort Order</label>
            <Input
              {...register('sort_order')}
              type="number"
              min="0"
              defaultValue={0}
              className="max-w-[100px]"
            />
            <p className="text-xs text-text-3 mt-1">Lower numbers appear first</p>
          </div>

          {/* Separate billing */}
          <div className="rounded-lg border border-border-2 bg-bg-2/40 p-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                {...register('separate_billing')}
                className="mt-0.5 h-4 w-4 rounded border-border-2 text-brand focus:ring-brand/30"
              />
              <span>
                <span className="block text-sm font-medium text-text">
                  Bill separately (must be ordered on its own)
                </span>
                <span className="block text-xs text-text-3 mt-0.5">
                  Items in this category can&apos;t be combined with items from other
                  categories in the same order.
                </span>
              </span>
            </label>
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Add Category'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
