import * as ynab from 'ynab';
import dayjs from 'dayjs';

// TypeScript interfaces
export interface PaymentConstants {
  paymentQuantity: number;
  maxDailyPayment: number;
  minDailyPayment: number;
  paymentDays: readonly number[];
}

export interface DeadlineConfig {
  enabled: boolean;
  endDate: string;
  showDaysRemaining: boolean;
  description: string;
}

export interface PaymentAccounts {
  [key: string]: string;
}

export interface AccountConfig {
  accountId: string;
  name: string;
  constants: PaymentConstants;
  deadlineConfig?: DeadlineConfig;
  paymentAccounts?: PaymentAccounts;
}

export interface PaymentHistoryItem {
  date: string;
  amount: number;
  balance: number;
  cleared?: string;
  memo?: string;
}

// YNAB API client
export const ynabAPI = new ynab.API(process.env.NEXT_PUBLIC_YNAB_ACCESS_TOKEN || '');

const paymentAccounts = {
      'Efectivo': 'cdc79d30-f609-46fa-b375-a153e808a125',
      'Yappy': 'ef27071e-07b5-409d-86d2-5cbc39910713'
    }

// Account configuration mapping
export const ACCOUNT_CONFIG: Record<string, AccountConfig> = {
  // Example account configurations - replace with actual account IDs from YNAB
  'taxi': {
    accountId: '65dd34f4-7de3-45ac-8605-78a8f27de40f',
    name: 'Taxi Soluto 2020',
    constants: {
      paymentQuantity: 20.00,
      maxDailyPayment: 30.00,
      minDailyPayment: 10.00,
      paymentDays: [1, 2, 3, 4, 5, 6], // Monday to Saturday
    },
    // Configuration for deadline-based tracking
    deadlineConfig: {
      enabled: true,
      endDate: '2030-09-30', // Fecha límite para terminar los pagos
      showDaysRemaining: true, // Mostrar días restantes en lugar del monto
      description: 'Días de pago restantes'
    },
    // Payment method accounts
    paymentAccounts: paymentAccounts
  },
  'l200': {
    accountId: 'bdd91266-2ac6-42ad-992d-f90ba54a0d94',
    name: 'Mitsubishi L200 2020',
    constants: {
      paymentQuantity: 25.00,
      maxDailyPayment: 35.00,
      minDailyPayment: 10.00,
      paymentDays: [1, 2, 3, 4, 5],
    },
      deadlineConfig: {
      enabled: true,
      endDate: '2031-09-30',
      showDaysRemaining: true,
      description: 'Días de pago restantes'
    },
    paymentAccounts: paymentAccounts,
  },
      'ian': {
      accountId: 'e9833956-52e0-4659-a790-73038c056e75',
      name: 'IAN Préstamo',
      constants: {
        paymentQuantity: 25.00,
        maxDailyPayment: 50.00,
        minDailyPayment: 10.00,
        paymentDays: []
      },
    },
    'papa': {
      accountId: '082adef4-253b-4010-8f57-0cd8d6c1bc05',
      name: 'Papa Préstamo',
      constants: {
        paymentQuantity: 10.00,
        maxDailyPayment: 20.00,
        minDailyPayment: 10.00,
        paymentDays: [1, 2, 3, 4, 5, 6],
      },
      paymentAccounts: paymentAccounts,
    }
} as const;

export type AccountKey = keyof typeof ACCOUNT_CONFIG;

// Helper function to get account config from URL parameter
export function getAccountConfig(accountKey: string): AccountConfig | null {
  if (accountKey in ACCOUNT_CONFIG) {
    return ACCOUNT_CONFIG[accountKey as AccountKey];
  }
  return null;
}

// YNAB API helper functions
export async function getBudgets() {
  try {
    const budgetsResponse = await ynabAPI.budgets.getBudgets();
    return budgetsResponse.data.budgets;
  } catch (error) {
    console.error('Error fetching budgets:', error);
    throw error;
  }
}

export async function getAccount(budgetId: string, accountId: string) {
  try {
    const accountResponse = await ynabAPI.accounts.getAccountById(budgetId, accountId);
    return accountResponse.data.account;
  } catch (error) {
    console.error('Error fetching account:', error);
    throw error;
  }
}

export async function getTransactions(budgetId: string, accountId: string, sinceDate?: string) {
  try {
    const transactionsResponse = await ynabAPI.transactions.getTransactionsByAccount(
      budgetId, 
      accountId, 
      sinceDate
    );
    return transactionsResponse.data.transactions;
  } catch (error) {
    console.error('Error fetching transactions:', error);
    throw error;
  }
}

// Helper function to convert YNAB milliunits to regular currency
export function milliunitsToCurrency(milliunits: number): number {
  return milliunits / 1000;
}

// Helper function to convert currency to YNAB milliunits
export function currencyToMilliunits(amount: number): number {
  return Math.round(amount * 1000);
}

// Helper function to calculate payment days remaining until deadline
export function calculatePaymentDaysRemaining(
  endDate: string,
  paymentDays: readonly number[],
  paymentHistory: PaymentHistoryItem[]
): number {
  const today = dayjs();
  const deadline = dayjs(endDate);

  // Count all payment days from today until deadline
  let paymentDaysCount = 0;
  let currentDate = today;

  while (currentDate.isBefore(deadline) || currentDate.isSame(deadline, 'day')) {
    const dayOfWeek = currentDate.day(); // 0 = Sunday, 1 = Monday, etc.
    if (paymentDays.includes(dayOfWeek)) {
      paymentDaysCount++;
    }
    currentDate = currentDate.add(1, 'day');
  }

  // Subtract days where payments were already made
  const paidDays = paymentHistory.filter(payment => {
    const paymentDate = dayjs(payment.date);
    const dayOfWeek = paymentDate.day();
    return paymentDate.isAfter(today.subtract(1, 'day')) && // Include today
           paymentDate.isBefore(deadline.add(1, 'day')) && // Include deadline
           paymentDays.includes(dayOfWeek) &&
           payment.amount >= 0; // Count both regular payments and blank payments
  }).length;

  return Math.max(0, paymentDaysCount - paidDays);
}

// Helper function to get days until deadline
export function getDaysUntilDeadline(endDate: string): number {
  const today = dayjs();
  const deadline = dayjs(endDate);
  const diffDays = deadline.diff(today, 'day');
  return Math.max(0, diffDays);
}

// Create a new transaction in YNAB
export async function createTransaction(
  budgetId: string,
  accountId: string,
  amount: number,
  payeeName: string,
  memo?: string
) {
  try {
    const transactionData = {
      account_id: accountId,
      payee_name: payeeName,
      amount: currencyToMilliunits(-Math.abs(amount)), // Negative for payments (reduces debt)
      memo: memo || '',
      cleared: 'uncleared' as const,
      date: dayjs().format('YYYY-MM-DD')
    };

    const response = await ynabAPI.transactions.createTransaction(budgetId, {
      transaction: transactionData
    });

    return response.data.transaction;
  } catch (error) {
    console.error('Error creating transaction:', error);
    throw error;
  }
}

// Create a transfer transaction between accounts
export async function createTransferTransaction(
  budgetId: string,
  fromAccountId: string,
  toAccountId: string,
  amount: number,
  memo?: string
) {
  try {
    // Create the outflow transaction (from payment account)
    const outflowTransaction = {
      account_id: fromAccountId,
      transfer_account_id: toAccountId,
      amount: currencyToMilliunits(-Math.abs(amount)), // Negative (money leaving account)
      memo: memo || '',
      cleared: 'uncleared' as const,
      date: dayjs().format('YYYY-MM-DD')
    };

    const response = await ynabAPI.transactions.createTransaction(budgetId, {
      transaction: outflowTransaction
    });

    return response.data.transaction;
  } catch (error) {
    console.error('Error creating transfer transaction:', error);
    throw error;
  }
}
