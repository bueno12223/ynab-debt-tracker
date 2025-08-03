'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DollarSign, Info, X, Calendar as CalendarIcon, TrendingUp } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { getAccountConfig, getBudgets, getAccount, getTransactions, milliunitsToCurrency, createTransaction, createTransferTransaction, calculatePaymentDaysRemaining, getDaysUntilDeadline } from '../lib/ynab';
import dayjs from 'dayjs';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';



interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}
// --- Componente Modal Genérico ---
const Modal = ({ isOpen, onClose, title, children }: ModalProps) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 z-40 flex justify-center items-center p-4">
      <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg m-4 animate-scale-in">
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={24} />
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- Componente Principal de la App ---
const App = () => {
  const searchParams = useSearchParams();
  const accountKey = searchParams.get('account') || 'taxi-soluto';

  // --- Estado de la Aplicación ---
  const [accountName, setAccountName] = useState("Préstamo Personal");
  const [accountBalance, setAccountBalance] = useState(0); // This is the total debt from YNAB
  const [presetPaymentAmount, setPresetPaymentAmount] = useState(150.00);
  const [maxDailyPayment, setMaxDailyPayment] = useState(200.00);
  const [paymentDays, setPaymentDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [budgetId, setBudgetId] = useState<string>('');
  const [accountId, setAccountId] = useState<string>('');
  const [deadlineConfig, setDeadlineConfig] = useState<any>(null);
  const [paymentDaysRemaining, setPaymentDaysRemaining] = useState<number>(0);
  const [totalDaysUntilDeadline, setTotalDaysUntilDeadline] = useState<number>(0);
  const [paymentAccounts, setPaymentAccounts] = useState<{[key: string]: string}>({});

  const [paymentHistory, setPaymentHistory] = useState<Array<{
    date: string,
    amount: number,
    balance: number,
    cleared?: string,
    memo?: string
  }>>([]);

  // Load account configuration and YNAB data
  useEffect(() => {
    const loadAccountData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get account configuration
        const accountConfig = getAccountConfig(accountKey);
        if (!accountConfig) {
          throw new Error(`Account configuration not found for: ${accountKey}`);
        }

        // Update state with account configuration
        setAccountName(accountConfig.name);
        setPresetPaymentAmount(accountConfig.constants.paymentQuantity);
        setMaxDailyPayment(accountConfig.constants.maxDailyPayment);
        setPaymentDays(accountConfig.constants.paymentDays);

        // Fetch YNAB data
        const budgets = await getBudgets();
        if (budgets.length === 0) {
          throw new Error('No budgets found in YNAB account');
        }

        // Use the first budget (or you could let user select)
        const budget = budgets[0];
        setBudgetId(budget.id);
        setAccountId(accountConfig.accountId);

        const account = await getAccount(budget.id, accountConfig.accountId);

        // The account balance IS the total debt (for debt accounts, balance is negative)
        const totalDebt = milliunitsToCurrency(Math.abs(account.balance));
        setAccountBalance(totalDebt);

        // Fetch recent transactions for payment history
        const transactions = await getTransactions(budget.id, accountConfig.accountId);

        // Convert transactions to payment history format
        const paymentTransactions = transactions
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) // Sort by date descending (newest first)
          .slice(0, 20) // Get last 20 transactions
          .map((t) => ({
            date: t.date,
            amount: milliunitsToCurrency(Math.abs(t.amount)),
            balance: milliunitsToCurrency(Math.abs(t.amount)), // Show transaction amount
            cleared: t.cleared,
            memo: t.memo || undefined
          }));

        setPaymentHistory(paymentTransactions);

        // Set deadline configuration if available
        if (accountConfig.deadlineConfig) {
          setDeadlineConfig(accountConfig.deadlineConfig);

          // Calculate payment days remaining
          const daysRemaining = calculatePaymentDaysRemaining(
            accountConfig.deadlineConfig.endDate,
            accountConfig.constants.paymentDays,
            paymentTransactions
          );
          setPaymentDaysRemaining(daysRemaining);

          // Calculate total days until deadline
          const totalDays = getDaysUntilDeadline(accountConfig.deadlineConfig.endDate);
          setTotalDaysUntilDeadline(totalDays);
        }

        // Set payment accounts configuration
        if (accountConfig.paymentAccounts) {
          setPaymentAccounts(accountConfig.paymentAccounts);
        }

      } catch (err) {
        console.error('Error loading account data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load account data');
        toast.error('Failed to load account data. Using demo data.');
      } finally {
        setLoading(false);
      }
    };

    loadAccountData();
  }, [accountKey]);

  const [isPaymentModalOpen, setPaymentModalOpen] = useState(false);
  const [isDetailsModalOpen, setDetailsModalOpen] = useState(false);
  const [isBlankPaymentModalOpen, setBlankPaymentModalOpen] = useState(false);
  const [isInfoVisible, setInfoVisible] = useState(false);
  const [blankPaymentReason, setBlankPaymentReason] = useState('');

  // Function to get payment dates for calendar highlighting
  const getPaymentDates = () => {
    return paymentHistory
      .filter(payment => payment.amount >= 0) // Include both regular payments and blank payments
      .map(payment => payment.date);
  };

  // Function to check if a date has a payment
  const hasPaymentOnDate = (date: Date) => {
    const dateString = dayjs(date).format('YYYY-MM-DD');
    return getPaymentDates().includes(dateString);
  };

  // --- Lógica y Cálculos ---
  const debtStatus = useMemo(() => {
    const today = dayjs();
    const dayOfWeek = today.day(); // 0 = Sunday, 1 = Monday, etc.
    const todayString = today.format('YYYY-MM-DD');

    // Check if today is a payment day
    const isPaymentDay = paymentDays.includes(dayOfWeek);

    // Check if user made a payment today
    const madePaymentToday = paymentHistory.some(payment => payment.date === todayString && payment.amount >= 0);

    if (isPaymentDay && madePaymentToday) {
      return { text: "¡Pago realizado hoy!", color: "text-green-400" };
    } else if (isPaymentDay && !madePaymentToday) {
      return { text: "Pago pendiente hoy", color: "text-red-400" };
    } else if (!isPaymentDay) {
      return { text: "No es día de pago", color: "text-blue-400" };
    } else {
      return { text: "Al día", color: "text-green-400" };
    }
  }, [paymentHistory, paymentDays]);

  // Function to refresh transactions from YNAB
  const refreshTransactions = async () => {
    try {
      if (budgetId && accountId) {
        const transactions = await getTransactions(budgetId, accountId);
        const paymentTransactions = transactions
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) // Sort by date descending (newest first)
          .slice(0, 20) // Get last 20 transactions
          .map((t) => ({
            date: t.date,
            amount: milliunitsToCurrency(Math.abs(t.amount)),
            balance: milliunitsToCurrency(Math.abs(t.amount)),
            cleared: t.cleared,
            memo: t.memo || undefined
          }));
        setPaymentHistory(paymentTransactions);

        // Recalculate payment days remaining if deadline config exists
        if (deadlineConfig && deadlineConfig.enabled) {
          const daysRemaining = calculatePaymentDaysRemaining(
            deadlineConfig.endDate,
            paymentDays,
            paymentTransactions
          );
          setPaymentDaysRemaining(daysRemaining);
        }
      }
    } catch (error) {
      console.error('Error refreshing transactions:', error);
    }
  };

  const handleRegisterPayment = async (method: string) => {
    try {
      // Check if we have a specific account for this payment method
      const paymentAccountId = paymentAccounts[method];

      if (paymentAccountId) {
        // Create transfer transaction from payment account to debt account
        await createTransferTransaction(
          budgetId,
          paymentAccountId,
          accountId,
          presetPaymentAmount,
          `Pago de deuda vía ${method}`
        );
      } else {
        // Fallback to regular transaction if no specific account configured
        await createTransaction(
          budgetId,
          accountId,
          presetPaymentAmount,
          `Pago ${method}`,
          `Pago registrado vía ${method}`
        );
      }

      const newBalance = accountBalance - presetPaymentAmount;
      setAccountBalance(newBalance);

      setPaymentModalOpen(false);
      toast.success(`Pago de $${presetPaymentAmount.toFixed(2)} registrado con ${method} en YNAB.`);

      // Refresh transactions from YNAB to get the latest data
      await refreshTransactions();
    } catch (error) {
      console.error('Error creating payment:', error);
      toast.error('Error al registrar el pago en YNAB. Inténtalo de nuevo.');
    }
  };

  const handleRegisterBlankPayment = async () => {
    if (!blankPaymentReason.trim()) {
      toast.error('Debes proporcionar una razón para el pago en blanco.');
      return;
    }

    try {
      // Create $0 transaction in YNAB
      await createTransaction(
        budgetId,
        accountId,
        0,
        'No hare un pago hoy',
        blankPaymentReason
      );

      setBlankPaymentModalOpen(false);
      setBlankPaymentReason('');
      toast.success('Pago en blanco registrado en YNAB.');

      // Refresh transactions from YNAB to get the latest data
      await refreshTransactions();
    } catch (error) {
      console.error('Error creating blank payment:', error);
      toast.error('Error al registrar el pago en blanco en YNAB.');
    }
  };

  const formattedData = useMemo(() => {
    return paymentHistory.map(p => ({
      ...p,
      fecha: new Date(p.date).toLocaleDateString('es-PA', { month: 'short', day: 'numeric' }),
      saldo: p.balance,
    }));
  }, [paymentHistory]);

  const estimatedFinishDate = useMemo(() => {
    if (presetPaymentAmount <= 0) return "N/A";
    const paymentsLeft = Math.ceil(accountBalance / presetPaymentAmount);
    const today = new Date();
    // Asumimos pagos quincenales
    const daysToFinish = paymentsLeft * 15;
    const finishDate = new Date(new Date().setDate(today.getDate() + daysToFinish));
    return finishDate.toLocaleDateString('es-PA', { year: 'numeric', month: 'long', day: 'numeric' });
  }, [accountBalance, presetPaymentAmount]);

  // --- Renderizado de la UI ---
  if (loading) {
    return (
      <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center font-sans p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-400 mx-auto mb-4"></div>
          <p className="text-xl text-gray-300">Loading account data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center font-sans p-4">
        <div className="text-center max-w-md">
          <div className="text-red-400 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-red-400 mb-4">Error Loading Data</h2>
          <p className="text-gray-300 mb-6">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center font-sans p-4">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#10b981',
            color: '#fff',
          },
        }}
      />
      
      <div className="w-full max-w-md mx-auto bg-gray-800 rounded-3xl shadow-xl p-6 md:p-8 space-y-8">
        {/* --- Header --- */}
        <header className="text-center">
          <h1 className="text-2xl font-bold text-gray-200">{accountName}</h1>
          <p className="text-gray-400">Resumen de tu deuda</p>
        </header>

        {/* --- Main Display --- */}
        <main className="text-center space-y-4">
          <div className="relative inline-block">
            {deadlineConfig && deadlineConfig.enabled && deadlineConfig.showDaysRemaining ? (
              <>
                <p className="text-sm text-gray-400">{deadlineConfig.description || 'Días de pago restantes'}</p>
                <div
                  className="text-6xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-red-400"
                  style={{ textShadow: '0 0 15px rgba(251, 146, 60, 0.3)' }}
                >
                  {paymentDaysRemaining}
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  Monto: ${accountBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-gray-500">
                  Límite: {dayjs(deadlineConfig.endDate).format('DD/MM/YYYY')} ({totalDaysUntilDeadline} días)
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-400">Cantidad Restante</p>
                <div
                  className="text-6xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-teal-300"
                  style={{ textShadow: '0 0 15px rgba(72, 187, 194, 0.3)' }}
                >
                  ${accountBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </>
            )}
            <div className="absolute -top-2 -right-8">
              <button 
                onMouseEnter={() => setInfoVisible(true)}
                onMouseLeave={() => setInfoVisible(false)}
                className="p-2 rounded-full hover:bg-gray-700 transition-colors"
              >
                <Info className="text-gray-500" size={20} />
              </button>
              {isInfoVisible && (
                <div className="absolute bottom-full mb-2 right-0 w-48 bg-gray-700 text-white text-xs rounded-lg p-2 shadow-lg z-10">
                  El monto máximo de pago por transacción es de ${maxDailyPayment.toFixed(2)}.
                </div>
              )}
            </div>
          </div>
          <div className={`text-lg font-semibold ${debtStatus.color}`}>
            {debtStatus.text}
          </div>
        </main>

        {/* --- Action Buttons --- */}
        <footer className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => setPaymentModalOpen(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-transform transform hover:scale-105 shadow-lg flex items-center justify-center space-x-2"
          >
            <DollarSign size={20}/>
            <span>Registrar Pago</span>
          </button>
          <button
            onClick={() => setBlankPaymentModalOpen(true)}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-4 rounded-xl transition-transform transform hover:scale-105 shadow-lg flex items-center justify-center space-x-2"
          >
            <X size={20}/>
            <span>Pago en Blanco</span>
          </button>
          <button
            onClick={() => setDetailsModalOpen(true)}
            className="w-full bg-gray-700 hover:bg-gray-600 text-gray-200 font-bold py-3 px-4 rounded-xl transition-transform transform hover:scale-105 shadow-lg flex items-center justify-center space-x-2"
          >
            <TrendingUp size={20}/>
            <span>Ver Más Detalles</span>
          </button>
        </footer>
      </div>

      {/* --- Transaction History --- */}
      <div className="w-full max-w-md mx-auto bg-gray-800 rounded-3xl shadow-xl p-6 md:p-8 mt-6">
        <h2 className="text-xl font-bold text-gray-200 mb-4 text-center">Historial de Transacciones</h2>
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {paymentHistory.length === 0 ? (
            <p className="text-gray-400 text-center py-4">No hay transacciones registradas</p>
          ) : (
            paymentHistory.map((payment, index) => (
              <div key={index} className="bg-gray-700 rounded-lg p-4 flex justify-between items-center">
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-white font-medium">
                      {payment.amount === 0 ? 'Pago en Blanco' : `$${payment.amount.toFixed(2)}`}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      payment.cleared === 'cleared'
                        ? 'bg-green-600 text-green-100'
                        : 'bg-yellow-600 text-yellow-100'
                    }`}>
                      {payment.cleared === 'cleared' ? 'Confirmado' : 'No Confirmado'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    {payment.date ? dayjs(payment.date).format('ddd, DD MMM YYYY') : 'Fecha inválida'}
                  </div>
                  {payment.memo && (
                    <div className="text-xs text-gray-500 mt-1">{payment.memo}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400">Monto</div>
                  <div className="text-white font-medium">
                    ${payment.amount.toFixed(2)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* --- Modals --- */}
      <Modal isOpen={isPaymentModalOpen} onClose={() => setPaymentModalOpen(false)} title="Registrar un Nuevo Pago">
        <div className="space-y-6 text-white">
          <p className="text-gray-300">El monto del pago está preestablecido. Por favor, selecciona tu método de pago.</p>
          <div className="bg-gray-700 p-4 rounded-lg text-center">
            <label className="text-sm text-gray-400 block">Monto a Pagar</label>
            <div className="text-4xl font-bold text-blue-400">
              ${presetPaymentAmount.toFixed(2)}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button 
              onClick={() => handleRegisterPayment('Yappy')}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105"
            >
              Yappy
            </button>
            <button 
              onClick={() => handleRegisterPayment('Efectivo')}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105"
            >
              Efectivo
            </button>
          </div>
        </div>
      </Modal>

      {/* --- Blank Payment Modal --- */}
      <Modal isOpen={isBlankPaymentModalOpen} onClose={() => {setBlankPaymentModalOpen(false); setBlankPaymentReason('');}} title="Registrar Pago en Blanco">
        <div className="space-y-6 text-white">
          <p className="text-gray-300">Explica por qué no pudiste realizar el pago hoy:</p>
          <div className="space-y-4">
            <textarea
              value={blankPaymentReason}
              onChange={(e) => setBlankPaymentReason(e.target.value)}
              placeholder="Ej: No tenía efectivo disponible, problemas con la app de Yappy, etc."
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 resize-none"
              rows={4}
              maxLength={200}
            />
            <div className="text-xs text-gray-400 text-right">
              {blankPaymentReason.length}/200 caracteres
            </div>
          </div>
          <div className="flex space-x-4">
            <button
              onClick={() => {setBlankPaymentModalOpen(false); setBlankPaymentReason('');}}
              className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-4 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleRegisterBlankPayment}
              disabled={!blankPaymentReason.trim()}
              className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-colors"
            >
              Registrar Pago en Blanco
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isDetailsModalOpen} onClose={() => setDetailsModalOpen(false)} title="Detalles y Proyección">
        <div className="space-y-8 text-white">
          {deadlineConfig && deadlineConfig.enabled ? (
            // Calendar view for deadline mode
            <div className="bg-gray-700 p-4 rounded-lg">
              <h4 className="text-lg font-semibold text-gray-200 mb-4 flex items-center justify-center space-x-2">
                <CalendarIcon size={20} className="text-green-400"/>
                <span>Calendario de Pagos - {dayjs().format('MMMM YYYY')}</span>
              </h4>
              <div className="calendar-container">
                <Calendar
                  value={new Date()}
                  tileClassName={({ date, view }) => {
                    if (view === 'month' && hasPaymentOnDate(date)) {
                      return 'payment-day';
                    }
                    return null;
                  }}
                  tileContent={({ date, view }) => {
                    if (view === 'month' && hasPaymentOnDate(date)) {
                      return <div className="payment-indicator">✓</div>;
                    }
                    return null;
                  }}
                />
              </div>
              <div className="mt-4 text-sm text-gray-300">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 bg-green-500 rounded"></div>
                    <span>Días con pago realizado</span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  Fecha límite: {dayjs(deadlineConfig.endDate).format('DD/MM/YYYY')}
                </div>
              </div>
            </div>
          ) : (
            // Original view for non-deadline mode
            <>
              <div className="bg-gray-700 p-4 rounded-lg text-center">
                <h4 className="text-lg font-semibold text-gray-200 flex items-center justify-center space-x-2">
                  <CalendarIcon size={20} className="text-blue-400"/>
                  <span>Fecha Estimada de Finalización</span>
                </h4>
                <p className="text-2xl font-bold text-blue-400">{estimatedFinishDate}</p>
              </div>

              <div>
                <h4 className="text-lg font-semibold text-gray-200 mb-4 text-center">Historial de Saldo</h4>
                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer>
                    <LineChart data={formattedData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#4A5568" />
                      <XAxis dataKey="fecha" stroke="#A0AEC0" tick={{ fill: '#A0AEC0' }} />
                      <YAxis stroke="#A0AEC0" tick={{ fill: '#A0AEC0' }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#2D3748', border: '1px solid #4A5568', borderRadius: '0.5rem' }}
                        labelStyle={{ color: '#E2E8F0' }}
                      />
                      <Legend wrapperStyle={{ color: '#E2E8F0' }} />
                      <Line type="monotone" dataKey="saldo" stroke="#38B2AC" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 8 }} name="Saldo Restante" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default App;
