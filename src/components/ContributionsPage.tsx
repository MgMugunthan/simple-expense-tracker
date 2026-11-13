import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import {
  formatMoney,
  resizeImageToDataUrl,
  validateImageDataUrl,
} from '../utils/image';
import type { Contributor } from '../utils/sheetsApi';

interface ContributionsPageProps {
  contributors: Contributor[];
  isAdmin: boolean;
  isSaving: boolean;
  onAddContributor: (entry: Omit<Contributor, 'id'>) => Promise<void>;
  onUpdateContributor: (entry: {
    id: string;
    name: string;
    amount: number;
  }) => Promise<void>;
  onDeleteContributor: (id: string) => Promise<void>;
  onClearAll: () => Promise<void>;
}

export default function ContributionsPage({
  contributors,
  isAdmin,
  isSaving,
  onAddContributor,
  onUpdateContributor,
  onDeleteContributor,
  onClearAll,
}: ContributionsPageProps) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState('');
  const [formError, setFormError] = useState('');
  const [failedPhotos, setFailedPhotos] = useState<Record<string, boolean>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editError, setEditError] = useState('');
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const [previewModal, setPreviewModal] = useState<{
    src: string;
    title: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setEditingId(null);
      setEditName('');
      setEditAmount('');
      setEditError('');
      setConfirmClearAll(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!previewModal) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setPreviewModal(null);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewModal]);

  const totalGiven = contributors.reduce((sum, person) => sum + person.amount, 0);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPhotoError('');
    const file = e.target.files?.[0];
    if (!file) {
      setPhoto(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please select a valid image file.');
      return;
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      const sizeError = validateImageDataUrl(dataUrl);
      if (sizeError) {
        setPhotoError(sizeError);
        return;
      }
      setPhoto(dataUrl);
    } catch (err) {
      setPhotoError(
        err instanceof Error ? err.message : 'Could not load the selected photo.'
      );
    }
  }

  function handleClearPhoto() {
    setPhoto(null);
    setPhotoError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleAddContributor(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin || isSaving) return;
    setFormError('');

    const trimmedName = name.trim();
    const parsedAmount = parseFloat(amount);

    if (!trimmedName) {
      setFormError('Please enter a name.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError('Please enter a valid total amount greater than 0.');
      return;
    }

    const imageValidationError = validateImageDataUrl(photo);
    if (imageValidationError) {
      setFormError(imageValidationError);
      return;
    }

    try {
      await onAddContributor({
        name: trimmedName,
        amount: parsedAmount,
        photo,
      });
      setName('');
      setAmount('');
      handleClearPhoto();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to save contribution.'
      );
    }
  }

  function handleStartEdit(person: Contributor) {
    if (!isAdmin || isSaving) return;
    setEditingId(person.id);
    setEditName(person.name);
    setEditAmount(String(person.amount));
    setEditError('');
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditAmount('');
    setEditError('');
  }

  async function handleSaveEdit(id: string) {
    if (!isAdmin || isSaving) return;
    const trimmed = editName.trim();
    const parsed = parseFloat(editAmount);
    if (!trimmed) {
      setEditError('Name cannot be empty.');
      return;
    }
    if (!Number.isFinite(parsed) || parsed < 0) {
      setEditError('Enter a valid amount.');
      return;
    }

    try {
      setEditError('');
      await onUpdateContributor({ id, name: trimmed, amount: parsed });
      handleCancelEdit();
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'Failed to update entry.'
      );
    }
  }

  async function handleDeleteContributor(id: string) {
    if (!isAdmin || isSaving) return;
    try {
      await onDeleteContributor(id);
      if (editingId === id) {
        handleCancelEdit();
      }
    } catch {
      // Error surfaced by parent banner
    }
  }

  async function handleConfirmClearAll() {
    if (!isAdmin || isSaving) return;
    try {
      await onClearAll();
      setConfirmClearAll(false);
      handleCancelEdit();
      setFormError('');
      handleClearPhoto();
    } catch {
      // Error surfaced by parent banner
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Summary Strip */}
      <section className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid grid-cols-2 gap-6 sm:gap-12 flex-1">
            <div>
              <div className="text-xs font-medium text-slate-500">
                Total Contributors
              </div>
              <div className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900 font-mono tabular-nums tracking-tight">
                {contributors.length}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">
                Total Amount Given
              </div>
              <div className="mt-1 text-2xl sm:text-3xl font-bold text-teal-700 font-mono tabular-nums tracking-tight">
                {formatMoney(totalGiven)}
              </div>
            </div>
          </div>

          {isAdmin && contributors.length > 0 && (
            <div className="flex items-center gap-2 shrink-0">
              {confirmClearAll ? (
                <>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleConfirmClearAll}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    Confirm Clear
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setConfirmClearAll(false)}
                    className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setConfirmClearAll(true)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  Clear All
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Add Person Form (Admin Only) */}
        {isAdmin && (
          <section className="lg:col-span-5 bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 sm:p-6">
            <h2 className="text-base font-semibold text-slate-900">
              Add Person &amp; Given Amount
            </h2>
            <p className="text-xs text-slate-500 mt-1 mb-5">
              Record who contributed, how much they gave, and attach their photo.
            </p>

            <form onSubmit={handleAddContributor} className="space-y-4">
              <div>
                <label
                  htmlFor="person-name"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Person Name
                </label>
                <input
                  id="person-name"
                  type="text"
                  disabled={isSaving}
                  placeholder="e.g. Alex, Priya, Sam"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50/60 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 disabled:opacity-60 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="person-amount"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Total Amount Given
                </label>
                <input
                  id="person-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  disabled={isSaving}
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50/60 border border-slate-200 rounded-lg text-sm font-mono tabular-nums text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 disabled:opacity-60 transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="person-photo"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Photo
                </label>
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="person-photo"
                    className={`flex-1 flex items-center justify-center gap-2 px-3.5 py-2.5 border border-dashed border-slate-300 rounded-lg bg-slate-50/70 hover:bg-teal-50/40 hover:border-teal-600 text-xs font-medium text-slate-600 hover:text-teal-800 transition-colors ${
                      isSaving ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
                    }`}
                  >
                    <ImagePlus className="w-4 h-4 shrink-0" />
                    <span className="truncate">
                      {photo ? 'Change photo' : 'Upload person photo'}
                    </span>
                  </label>
                  <input
                    ref={fileInputRef}
                    id="person-photo"
                    type="file"
                    accept="image/*"
                    disabled={isSaving}
                    onChange={handlePhotoChange}
                    className="sr-only"
                  />
                  {photo && (
                    <div className="relative shrink-0">
                      <img
                        src={photo}
                        alt="Selected person preview"
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 object-cover rounded-lg border border-slate-200"
                      />
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={handleClearPhoto}
                        aria-label="Remove photo"
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-rose-600 disabled:opacity-50 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
                {photoError && (
                  <p className="text-xs text-rose-600 mt-1.5" role="alert">
                    {photoError}
                  </p>
                )}
              </div>

              {formError && (
                <p
                  className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"
                  role="alert"
                >
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSaving}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 active:scale-[0.99] disabled:opacity-60 transition-all whitespace-nowrap"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Add Entry
                  </>
                )}
              </button>
            </form>
          </section>
        )}

        {/* Right: Contributors List */}
        <section
          className={`${
            isAdmin ? 'lg:col-span-7' : 'lg:col-span-12'
          } bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 sm:p-6`}
        >
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">
              Given Amounts
            </h2>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              {contributors.length} {contributors.length === 1 ? 'person' : 'people'}
            </span>
          </div>

          {contributors.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <div className="w-11 h-11 mx-auto rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                <Users className="w-5 h-5" />
              </div>
              <p className="text-sm font-medium text-slate-700">
                No entries added yet
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {isAdmin
                  ? "Enter a person's name, the amount they gave, and their photo on the left."
                  : 'Contributions recorded by the admin will appear here.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 mt-1">
              {contributors.map((person) => {
                const showFallback = !person.photo || failedPhotos[person.id];
                const isEditing = isAdmin && editingId === person.id;

                return (
                  <li
                    key={person.id}
                    className="py-3.5 flex flex-wrap items-center justify-between gap-3 group"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      {showFallback ? (
                        <div
                          className="w-12 h-12 shrink-0 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-400"
                          aria-label="No photo"
                        >
                          <User className="w-5 h-5" />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewModal({ src: person.photo!, title: person.name })
                          }
                          className="shrink-0 rounded-lg overflow-hidden border border-slate-200 hover:border-teal-600 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-600/30"
                          title="Click to view photo"
                        >
                          <img
                            src={person.photo!}
                            alt={person.name}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setFailedPhotos((prev) => ({
                                ...prev,
                                [person.id]: true,
                              }))
                            }
                            className="w-12 h-12 object-cover"
                          />
                        </button>
                      )}

                      {isEditing ? (
                        <div className="flex flex-wrap items-center gap-2 flex-1">
                          <input
                            type="text"
                            disabled={isSaving}
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            aria-label="Edit person name"
                            className="px-2.5 py-1.5 border border-slate-300 rounded-md text-sm w-36 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 disabled:opacity-60"
                          />
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            disabled={isSaving}
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            aria-label="Edit total amount given"
                            className="px-2.5 py-1.5 border border-slate-300 rounded-md text-sm font-mono tabular-nums w-28 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 disabled:opacity-60"
                          />
                          {editError && (
                            <span className="text-xs text-rose-600">{editError}</span>
                          )}
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {person.name}
                          </div>
                          <div className="text-xs text-slate-500">Given amount</div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleSaveEdit(person.id)}
                            aria-label="Save changes"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-teal-700 rounded-md hover:bg-teal-800 disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Save
                          </button>
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={handleCancelEdit}
                            aria-label="Cancel editing"
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-md hover:bg-slate-200 disabled:opacity-50 transition-colors whitespace-nowrap"
                          >
                            <X className="w-3.5 h-3.5" />
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-sm font-semibold text-teal-700 font-mono tabular-nums mr-1">
                            {formatMoney(person.amount)}
                          </span>
                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => handleStartEdit(person)}
                                aria-label={`Edit ${person.name}`}
                                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md disabled:opacity-50 transition-colors"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => handleDeleteContributor(person.id)}
                                aria-label={`Delete ${person.name}`}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md disabled:opacity-50 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Image Lightbox Modal */}
      {previewModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4"
          onClick={() => setPreviewModal(null)}
          role="dialog"
          aria-modal="true"
          aria-label={previewModal.title}
        >
          <div
            className="bg-white rounded-xl max-w-md w-full overflow-hidden shadow-lg border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-900 truncate">
                {previewModal.title}
              </span>
              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                aria-label="Close preview"
                className="p-1 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-slate-50 flex justify-center">
              <img
                src={previewModal.src}
                alt={previewModal.title}
                referrerPolicy="no-referrer"
                className="max-h-[70vh] w-auto rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
