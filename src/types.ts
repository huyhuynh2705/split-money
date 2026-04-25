export type Expense = {
  id: string;
  date: string; // ISO YYYY-MM-DD
  payer: string;
  amount: number;
  sharedWith: string[];
  note: string;
};

export type AppData = {
  members: string[];
  expenses: Expense[];
  doneWeeks: string[];
};

export type Balance = {
  person: string;
  amount: number; // > 0: should receive, < 0: should pay
};

export type Settlement = {
  from: string;
  to: string;
  amount: number;
};
