export type TransactionType = 'give' | 'take';

export type TransactionRecord = {
  date: string;
  user: string;
  amount: number;
  description: string;
  type: TransactionType;
};

export type UserState = 'idle' | 'waiting_for_amount' | 'waiting_for_description';

export type User = {
  telegramId: number;
  username?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  isAdmin: boolean;
  notificationsEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Поля для пошагового добавления транзакций
  state?: UserState;
  tempTransactionType?: TransactionType;
  tempAmount?: number;
};

export type BotConfig = {
  token: string;
  adminUserId: number;
  googleCredentialsPath: string;
  spreadsheetId: string;
  sheetName: string;
  notificationInterval: string;
  debug: boolean;
  allowedUsers: number[];
  participants: {
    dmitry: string;
    alexander: string;
  };
  participantsDative: {
    dmitry: string;
    alexander: string;
  };
  currency: {
    code: string;
    symbol: string;
  };
};

export type NotificationData = {
  lastRowCount: number;
  lastChecked: Date;
};

export type SheetData = {
  values: string[][];
  range: string;
};

export type Balance = {
  debtor: string;
  creditor: string;
  amount: number;
  description: string;
};

export type ParsedTransaction = {
  amount: number;
  description: string;
  type: TransactionType;
}; 