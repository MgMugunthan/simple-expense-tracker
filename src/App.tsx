import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ImagePlus,
  Loader2,
  Lock,
  LogOut,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  RotateCcw,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import ContributionsPage from './components/ContributionsPage';
import {
  formatMoney,
  resizeImageToDataUrl,
  validateImageDataUrl,
} from './utils/image';
import {
  addContributionToSheet,
  addExpenseToSheet,
  clearContributionsInSheet,
  createUniqueId,
  deleteContributionFromSheet,
  deleteExpenseFromSheet,
  fetchSharedSheetData,
  resetExpensesInSheet,
  saveTotalBudget,
  updateContributionInSheet,
  updateExpenseInSheet,
  verifyAdminPassword,
  type Contributor,
  type Expense,
  type SharedSheetData,
} from './utils/sheetsApi';

type PageTab = 'expenses' | 'given';

export default function App() {
  const [activePage, setActivePage] = useState<PageTab>('expenses');

  // Shared Google Sheets state
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [totalInput, setTotalInput] = useState<string>('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [contributors, setContributors] = useState<Contributor[]>([]);

  // Loading, saving & feedback state
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Admin auth state (kept strictly in application memory)
  const [adminPassword, setAdminPassword] = useState<string | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [loginPasswordInput, setLoginPasswordInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [isVerifyingLogin, setIsVerifyingLogin] = useState<boolean>(false);

  // Expense form & edit state
  const [expenseName, setExpenseName] = useState('');
  const [expensePrice, setExpensePrice] = useState('');
  const [expenseImage, setExpenseImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState('');
  const [formError, setFormError] = useState('');
  const [totalError, setTotalError] = useState('');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [confirmReset, setConfirmReset] = useState<boolean>(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editError, setEditError] = useState('');

  const [previewModal, setPreviewModal] = useState<{
    src: string;
    title: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isAdmin = adminPassword !== null;

  const applySharedData = useCallback((data: SharedSheetData) => {
    setExpenses(data.expenses);
    setContributors(data.contributions);
    setTotalAmount(data.totalAmount);
    setTotalInput(data.totalAmount > 0 ? String(data.totalAmount) : '');
    setFailedImages({});
  }, []);

  const loadSharedData = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await fetchSharedSheetData();
      applySharedData(data);
      setHasLoadedOnce(true);
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Could not load shared data from Google Sheets.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [applySharedData]);

  useEffect(() => {
    void loadSharedData();
  }, [loadSharedData]);

  useEffect(() => {
    if (!statusMessage || statusMessage.type !== 'success') return;
    const timer = window.setTimeout(() => setStatusMessage(null), 4000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  useEffect(() => {
    if (!previewModal && !isLoginModalOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPreviewModal(null);
        if (!isVerifyingLogin) {
          setIsLoginModalOpen(false);
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [previewModal, isLoginModalOpen, isVerifyingLogin]);

  const totalSpent = expenses.reduce((sum, item) => sum + item.amount, 0);
  const remainingAmount = totalAmount - totalSpent;
  const spentPercentage =
    totalAmount > 0 ? Math.min(100, Math.round((totalSpent / totalAmount) * 100)) : 0;

  function handleOpenLoginModal() {
    setLoginPasswordInput('');
    setLoginError('');
    setIsLoginModalOpen(true);
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isVerifyingLogin) return;

    const trimmed = loginPasswordInput.trim();
    if (!trimmed) {
      setLoginError('Please enter the admin password.');
      return;
    }

    setIsVerifyingLogin(true);
    setLoginError('');
    try {
      await verifyAdminPassword(trimmed);
      setAdminPassword(trimmed);
      setIsLoginModalOpen(false);
      setLoginPasswordInput('');
      setStatusMessage({
        type: 'success',
        text: 'Admin login successful.',
      });
    } catch (err) {
      setLoginError(
        err instanceof Error ? err.message : 'Admin verification failed.'
      );
    } finally {
      setIsVerifyingLogin(false);
    }
  }

  function handleLogout() {
    setAdminPassword(null);
    setEditingId(null);
    setEditName('');
    setEditAmount('');
    setEditError('');
    setConfirmReset(false);
    setStatusMessage({
      type: 'success',
      text: 'Logged out of admin mode.',
    });
  }

  async function runAdminWrite(
    operation: (password: string) => Promise<SharedSheetData>,
    successText: string
  ): Promise<void> {
    if (!adminPassword || isSaving) {
      throw new Error('Admin login is required.');
    }

    setIsSaving(true);
    setStatusMessage(null);
    try {
      const latest = await operation(adminPassword);
      applySharedData(latest);
      setStatusMessage({ type: 'success', text: successText });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to save changes.';
      setStatusMessage({ type: 'error', text: message });
      throw err;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSetTotal(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin || isSaving) return;

    const parsed = parseFloat(totalInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setTotalError('Please enter a valid total amount (0 or greater).');
      return;
    }
    setTotalError('');
    try {
      await runAdminWrite(
        (password) => saveTotalBudget(password, parsed),
        'Total budget updated.'
      );
    } catch {
      // Preserves totalInput and displays error banner
    }
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    setImageError('');
    const file = e.target.files?.[0];
    if (!file) {
      setExpenseImage(null);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setImageError('Please select a valid image file.');
      return;
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      const sizeError = validateImageDataUrl(dataUrl);
      if (sizeError) {
        setImageError(sizeError);
        return;
      }
      setExpenseImage(dataUrl);
    } catch (err) {
      setImageError(
        err instanceof Error ? err.message : 'Could not load the selected image.'
      );
    }
  }

  function handleClearSelectedImage() {
    setExpenseImage(null);
    setImageError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin || isSaving) return;
    setFormError('');

    const trimmedName = expenseName.trim();
    const parsedPrice = parseFloat(expensePrice);

    if (!trimmedName) {
      setFormError('Please enter an expense name.');
      return;
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setFormError('Please enter a valid price greater than 0.');
      return;
    }

    const imageValidationError = validateImageDataUrl(expenseImage);
    if (imageValidationError) {
      setFormError(imageValidationError);
      return;
    }

    const newExpense: Expense = {
      id: createUniqueId('exp'),
      name: trimmedName,
      amount: parsedPrice,
      image: expenseImage,
    };

    try {
      await runAdminWrite(
        (password) => addExpenseToSheet(password, newExpense),
        'Expense added.'
      );
      setExpenseName('');
      setExpensePrice('');
      handleClearSelectedImage();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Failed to save expense.'
      );
    }
  }

  function handleStartEdit(expense: Expense) {
    if (!isAdmin || isSaving) return;
    setEditingId(expense.id);
    setEditName(expense.name);
    setEditAmount(String(expense.amount));
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
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setEditError('Enter a valid price.');
      return;
    }
    setEditError('');

    try {
      await runAdminWrite(
        (password) =>
          updateExpenseInSheet(password, { id, name: trimmed, amount: parsed }),
        'Expense updated.'
      );
      handleCancelEdit();
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'Failed to update expense.'
      );
    }
  }

  async function handleDeleteExpense(id: string) {
    if (!isAdmin || isSaving) return;
    try {
      await runAdminWrite(
        (password) => deleteExpenseFromSheet(password, id),
        'Expense deleted.'
      );
      if (editingId === id) {
        handleCancelEdit();
      }
    } catch {
      // Error surfaced via status banner
    }
  }

  async function handleConfirmResetExpenses() {
    if (!isAdmin || isSaving) return;
    try {
      await runAdminWrite(
        (password) => resetExpensesInSheet(password),
        'Expenses and total budget reset.'
      );
      setConfirmReset(false);
      setTotalError('');
      setFormError('');
      handleCancelEdit();
      handleClearSelectedImage();
    } catch {
      // Error surfaced via status banner
    }
  }

  // Contribution handlers passed to ContributionsPage
  async function handleAddContributor(entry: Omit<Contributor, 'id'>) {
    const newContributor: Contributor = {
      id: createUniqueId('con'),
      ...entry,
    };
    await runAdminWrite(
      (password) => addContributionToSheet(password, newContributor),
      'Contribution added.'
    );
  }

  async function handleUpdateContributor(entry: {
    id: string;
    name: string;
    amount: number;
  }) {
    await runAdminWrite(
      (password) => updateContributionInSheet(password, entry),
      'Contribution updated.'
    );
  }

  async function handleDeleteContributor(id: string) {
    await runAdminWrite(
      (password) => deleteContributionFromSheet(password, id),
      'Contribution deleted.'
    );
  }

  async function handleClearContributions() {
    await runAdminWrite(
      (password) => clearContributionsInSheet(password),
      'All contributions cleared.'
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-0 sm:h-16 flex flex-wrap items-center justify-between gap-3 sm:gap-6">
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
            <h1 className="text-base font-bold tracking-tight text-slate-900">
              Arvind weds Dharani
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <nav
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0"
              aria-label="Pages"
            >
              <button
                type="button"
                onClick={() => setActivePage('expenses')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap shrink-0 ${
                  activePage === 'expenses'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Expenses
              </button>
              <button
                type="button"
                onClick={() => setActivePage('given')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap shrink-0 ${
                  activePage === 'given'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Given Amounts
              </button>
            </nav>

            <button
              type="button"
              onClick={() => void loadSharedData()}
              disabled={isLoading || isSaving}
              title="Refresh shared data"
              aria-label="Refresh shared data"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`}
              />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {isAdmin ? (
              <button
                type="button"
                onClick={handleLogout}
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-lg hover:bg-teal-100 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                Logout
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenLoginModal}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <Lock className="w-3.5 h-3.5" />
                Admin Login
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        {/* Global Status / Error Feedback */}
        {statusMessage && (
          <div
            role="status"
            className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-xs font-medium ${
              statusMessage.type === 'success'
                ? 'bg-teal-50 border-teal-200 text-teal-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              aria-label="Dismiss notification"
              className="p-1 rounded hover:bg-black/5 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {loadError && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-sm"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="text-xs font-medium">{loadError}</span>
            </div>
            <button
              type="button"
              onClick={() => void loadSharedData()}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-700 rounded-lg hover:bg-rose-800 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              Try Again
            </button>
          </div>
        )}

        {isLoading && !hasLoadedOnce ? (
          <div className="bg-white border border-slate-200/90 rounded-xl shadow-xs py-16 px-4 text-center">
            <Loader2 className="w-7 h-7 mx-auto text-teal-700 animate-spin mb-3" />
            <p className="text-sm font-medium text-slate-800">
              Loading shared data...
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Fetching latest expenses, contributions, and total budget.
            </p>
          </div>
        ) : activePage === 'given' ? (
          <ContributionsPage
            contributors={contributors}
            isAdmin={isAdmin}
            isSaving={isSaving}
            onAddContributor={handleAddContributor}
            onUpdateContributor={handleUpdateContributor}
            onDeleteContributor={handleDeleteContributor}
            onClearAll={handleClearContributions}
          />
        ) : (
          <div className="space-y-6">
            {/* Budget Summary & Admin Total Amount Setter */}
            <section className="bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 sm:p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Total Amount
                  </div>
                  <div className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900 font-mono tabular-nums tracking-tight">
                    {formatMoney(totalAmount)}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Total Spent
                  </div>
                  <div className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900 font-mono tabular-nums tracking-tight">
                    {formatMoney(totalSpent)}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-slate-500">
                    Remaining Amount
                  </div>
                  <div
                    className={`mt-1 text-2xl sm:text-3xl font-bold font-mono tabular-nums tracking-tight ${
                      remainingAmount < 0 ? 'text-rose-600' : 'text-teal-700'
                    }`}
                  >
                    {formatMoney(remainingAmount)}
                  </div>
                  {remainingAmount < 0 && (
                    <div className="text-xs font-medium text-rose-600 mt-1">
                      Over budget by {formatMoney(Math.abs(remainingAmount))}
                    </div>
                  )}
                </div>
              </div>

              {/* Clean Progress Indicator */}
              {totalAmount > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>Budget used</span>
                    <span className="font-mono tabular-nums font-medium text-slate-700">
                      {spentPercentage}%
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-200 ${
                        remainingAmount < 0 ? 'bg-rose-600' : 'bg-teal-600'
                      }`}
                      style={{ width: `${spentPercentage}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Set / Update Total Amount Bar (Admin Only) */}
              {isAdmin && (
                <>
                  <form
                    onSubmit={handleSetTotal}
                    className="pt-4 border-t border-slate-100 flex flex-wrap items-end gap-3"
                  >
                    <div className="flex-1 min-w-[210px]">
                      <label
                        htmlFor="total-amount"
                        className="block text-xs font-medium text-slate-700 mb-1.5"
                      >
                        Set or Update Total Amount
                      </label>
                      <input
                        id="total-amount"
                        type="number"
                        step="0.01"
                        min="0"
                        disabled={isSaving}
                        placeholder="Enter total amount (e.g. 1000)"
                        value={totalInput}
                        onChange={(e) => setTotalInput(e.target.value)}
                        className="w-full px-3.5 py-2 bg-slate-50/60 border border-slate-200 rounded-lg text-sm font-mono tabular-nums text-slate-900 placeholder:text-slate-400 placeholder:font-sans focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 disabled:opacity-60 transition-colors"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                    >
                      {isSaving ? 'Saving...' : 'Set Total'}
                    </button>
                    {(totalAmount > 0 || expenses.length > 0) &&
                      (confirmReset ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={handleConfirmResetExpenses}
                            className="px-3.5 py-2 text-sm font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-700 disabled:opacity-60 transition-colors whitespace-nowrap"
                          >
                            Confirm Reset
                          </button>
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => setConfirmReset(false)}
                            className="px-3 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-60 transition-colors whitespace-nowrap"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => setConfirmReset(true)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:text-slate-900 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Reset
                        </button>
                      ))}
                  </form>

                  {totalError && (
                    <p className="text-xs text-rose-600" role="alert">
                      {totalError}
                    </p>
                  )}
                </>
              )}
            </section>

            {/* Workspace Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left: Add Expense Form (Admin Only) */}
              {isAdmin && (
                <section className="lg:col-span-5 bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 sm:p-6">
                  <h2 className="text-base font-semibold text-slate-900">
                    Add Expense
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 mb-5">
                    Log an expense name, price, and photo to reduce your remaining total.
                  </p>

                  <form onSubmit={handleAddExpense} className="space-y-4">
                    <div>
                      <label
                        htmlFor="expense-name"
                        className="block text-xs font-medium text-slate-700 mb-1.5"
                      >
                        Expense Name
                      </label>
                      <input
                        id="expense-name"
                        type="text"
                        disabled={isSaving}
                        placeholder="e.g. Catering, Flowers, Hall"
                        value={expenseName}
                        onChange={(e) => setExpenseName(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50/60 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 disabled:opacity-60 transition-colors"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="expense-price"
                        className="block text-xs font-medium text-slate-700 mb-1.5"
                      >
                        Price
                      </label>
                      <input
                        id="expense-price"
                        type="number"
                        step="0.01"
                        min="0.01"
                        disabled={isSaving}
                        placeholder="0.00"
                        value={expensePrice}
                        onChange={(e) => setExpensePrice(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-slate-50/60 border border-slate-200 rounded-lg text-sm font-mono tabular-nums text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 disabled:opacity-60 transition-colors"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="expense-image"
                        className="block text-xs font-medium text-slate-700 mb-1.5"
                      >
                        Image of the Expense
                      </label>
                      <div className="flex items-center gap-3">
                        <label
                          htmlFor="expense-image"
                          className={`flex-1 flex items-center justify-center gap-2 px-3.5 py-2.5 border border-dashed border-slate-300 rounded-lg bg-slate-50/70 hover:bg-teal-50/40 hover:border-teal-600 text-xs font-medium text-slate-600 hover:text-teal-800 transition-colors ${
                            isSaving
                              ? 'opacity-60 pointer-events-none'
                              : 'cursor-pointer'
                          }`}
                        >
                          <ImagePlus className="w-4 h-4 shrink-0" />
                          <span className="truncate">
                            {expenseImage ? 'Change image' : 'Upload expense image'}
                          </span>
                        </label>
                        <input
                          ref={fileInputRef}
                          id="expense-image"
                          type="file"
                          accept="image/*"
                          disabled={isSaving}
                          onChange={handleImageChange}
                          className="sr-only"
                        />
                        {expenseImage && (
                          <div className="relative shrink-0">
                            <img
                              src={expenseImage}
                              alt="Selected expense preview"
                              referrerPolicy="no-referrer"
                              className="w-11 h-11 object-cover rounded-lg border border-slate-200"
                            />
                            <button
                              type="button"
                              disabled={isSaving}
                              onClick={handleClearSelectedImage}
                              aria-label="Remove selected image"
                              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center hover:bg-rose-600 disabled:opacity-50 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                      {imageError && (
                        <p className="text-xs text-rose-600 mt-1.5" role="alert">
                          {imageError}
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
                          Add Expense
                        </>
                      )}
                    </button>
                  </form>
                </section>
              )}

              {/* Right: Expenses List */}
              <section
                className={`${
                  isAdmin ? 'lg:col-span-7' : 'lg:col-span-12'
                } bg-white border border-slate-200/90 rounded-xl shadow-xs p-5 sm:p-6`}
              >
                <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  <h2 className="text-base font-semibold text-slate-900">
                    Expenses
                  </h2>
                  <span className="text-xs font-medium text-slate-500 tabular-nums">
                    {expenses.length} {expenses.length === 1 ? 'item' : 'items'}
                  </span>
                </div>

                {expenses.length === 0 ? (
                  <div className="py-12 px-4 text-center">
                    <div className="w-11 h-11 mx-auto rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">
                      No expenses added yet
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {isAdmin
                        ? 'Add your first expense on the left to start reducing your total amount.'
                        : 'Expenses recorded by the admin will appear here.'}
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 mt-1">
                    {expenses.map((expense) => {
                      const showFallback = !expense.image || failedImages[expense.id];
                      const isEditing = isAdmin && editingId === expense.id;

                      return (
                        <li
                          key={expense.id}
                          className="py-3.5 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3.5 min-w-0 flex-1">
                            {showFallback ? (
                              <div
                                className="w-12 h-12 shrink-0 rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-400"
                                aria-label="No expense image"
                              >
                                <Receipt className="w-5 h-5" />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewModal({
                                    src: expense.image!,
                                    title: expense.name,
                                  })
                                }
                                className="shrink-0 rounded-lg overflow-hidden border border-slate-200 hover:border-teal-600 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-600/30"
                                title="Click to view image"
                              >
                                <img
                                  src={expense.image!}
                                  alt={expense.name}
                                  referrerPolicy="no-referrer"
                                  onError={() =>
                                    setFailedImages((prev) => ({
                                      ...prev,
                                      [expense.id]: true,
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
                                  aria-label="Edit expense name"
                                  className="px-2.5 py-1.5 border border-slate-300 rounded-md text-sm w-36 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 disabled:opacity-60"
                                />
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  disabled={isSaving}
                                  value={editAmount}
                                  onChange={(e) => setEditAmount(e.target.value)}
                                  aria-label="Edit expense price"
                                  className="px-2.5 py-1.5 border border-slate-300 rounded-md text-sm font-mono tabular-nums w-28 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 disabled:opacity-60"
                                />
                                {editError && (
                                  <span className="text-xs text-rose-600">
                                    {editError}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-900 truncate">
                                  {expense.name}
                                </div>
                                <div className="text-xs text-slate-500">Expense</div>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isEditing ? (
                              <>
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => handleSaveEdit(expense.id)}
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
                                <span className="text-sm font-semibold text-slate-900 font-mono tabular-nums mr-1">
                                  -{formatMoney(expense.amount)}
                                </span>
                                {isAdmin && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={isSaving}
                                      onClick={() => handleStartEdit(expense)}
                                      aria-label={`Edit ${expense.name}`}
                                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md disabled:opacity-50 transition-colors"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isSaving}
                                      onClick={() => handleDeleteExpense(expense.id)}
                                      aria-label={`Delete ${expense.name}`}
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
          </div>
        )}
      </main>

      {/* Admin Login Modal */}
      {isLoginModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/70 flex items-center justify-center p-4"
          onClick={() => {
            if (!isVerifyingLogin) setIsLoginModalOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Admin Login"
        >
          <div
            className="bg-white rounded-xl max-w-sm w-full overflow-hidden shadow-lg border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-700" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Admin Login
                </h2>
              </div>
              <button
                type="button"
                disabled={isVerifyingLogin}
                onClick={() => setIsLoginModalOpen(false)}
                aria-label="Close login modal"
                className="p-1 text-slate-500 hover:text-slate-900 rounded-md hover:bg-slate-100 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleLoginSubmit} className="p-5 space-y-4">
              <div>
                <label
                  htmlFor="admin-password-input"
                  className="block text-xs font-medium text-slate-700 mb-1.5"
                >
                  Admin Password
                </label>
                <input
                  id="admin-password-input"
                  type="password"
                  autoFocus
                  disabled={isVerifyingLogin}
                  placeholder="Enter admin password"
                  value={loginPasswordInput}
                  onChange={(e) => setLoginPasswordInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50/60 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 disabled:opacity-60 transition-colors"
                />
              </div>

              {loginError && (
                <p
                  className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"
                  role="alert"
                >
                  {loginError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={isVerifyingLogin}
                  onClick={() => setIsLoginModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isVerifyingLogin}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors"
                >
                  {isVerifyingLogin ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Login'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
