# YNAB Debt Tracker

A Next.js application that integrates with YNAB (You Need A Budget) to track debt payments and visualize payment progress.

## Features

- 🔗 **YNAB Integration**: Connects to your YNAB account to fetch real debt account data
- 📊 **Payment Visualization**: Interactive charts showing payment history and debt reduction
- 🎯 **Payment Tracking**: Register payments with different methods (Yappy, Cash, etc.)
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🎨 **Modern UI**: Dark theme with smooth animations and toast notifications

## Setup Instructions

### 1. YNAB API Setup

1. Go to [YNAB Account Settings](https://app.ynab.com/settings)
2. Navigate to "Developer Settings"
3. Click "New Token" under "Personal Access Tokens"
4. Enter your password and generate a new token
5. Copy the access token (you won't be able to see it again!)

### 2. Environment Configuration

1. Copy the `.env.local` file and update it with your YNAB access token:

```bash
# YNAB API Configuration
NEXT_PUBLIC_YNAB_ACCESS_TOKEN=your_actual_ynab_access_token_here
```

### 3. Account Configuration

1. Open `src/lib/ynab.ts`
2. Update the `ACCOUNT_CONFIG` object with your actual YNAB account IDs:

```typescript
export const ACCOUNT_CONFIG = {
  "personal-loan": {
    accountId: "your-actual-ynab-account-id-here", // Replace with real account ID
    name: "Préstamo Personal",
    constants: {
      paymentQuantity: 150.0,
      maxDailyPayment: 200.0,
      minDailyPayment: 150.0,
      paymentDays: [1, 2, 3, 4, 5], // Monday to Friday
    },
  },
  // Add more accounts as needed
};
```

To find your account IDs:

- Use the YNAB API endpoint: `https://api.ynab.com/v1/budgets/{budget_id}/accounts`
- Or check the browser network tab when viewing accounts in YNAB web app

### 4. Installation and Development

```bash
# Install dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### 5. Usage

- **Default Account**: Visit `http://localhost:3000` to use the default account
- **Specific Account**: Visit `http://localhost:3000?account=personal-loan` to load a specific account
- **Available Accounts**: Based on your `ACCOUNT_CONFIG` keys (e.g., `personal-loan`, `credit-card`)

## Project Structure

```
src/
├── app/
│   ├── page.tsx          # Main application component
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Global styles
├── lib/
│   └── ynab.ts          # YNAB API integration and utilities
└── ...
```

## Technologies Used

- **Next.js 15** - React framework
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **YNAB SDK** - YNAB API integration
- **Recharts** - Data visualization
- **React Hot Toast** - Notifications
- **Lucide React** - Icons

## API Integration

The app integrates with YNAB API to:

- Fetch budget and account information
- Get current account balance (debt remaining)
- Retrieve transaction history for payment tracking
- Convert YNAB milliunits to regular currency amounts

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with your YNAB account
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
