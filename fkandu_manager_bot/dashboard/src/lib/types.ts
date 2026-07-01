export interface Lead {
  id: number;
  user_id: number;
  username: string | null;
  full_name: string;
  category: string;
  product_info: string;
  budget: string;
  timeline: string;
  lead_score: string;
  status: string;
  admin_comment: string;
  next_contact: string | null;
  deal_amount: number;
  created_at: string;
  updated_at: string;
}

export interface Stats {
  total: number;
  hot: number;
  new: number;
  revenue: number;
  by_category: { category: string; count: number }[];
  by_score: { lead_score: string; count: number }[];
  by_status: { status: string; count: number }[];
  monthly_revenue: { month: string; revenue: number }[];
  category_revenue: { category: string; revenue: number }[];
}

export type Page = 'dashboard' | 'kanban' | 'leads' | 'hot' | 'analytics';

export const STATUSES = [
  '🆕 Новая',
  '📖 Изучаю',
  '💬 В работе',
  '✅ Договорились',
  '💰 Оплачено',
  '📢 Размещено',
  '❌ Отказ',
];

export const STATUS_COLORS: Record<string, string> = {
  '🆕 Новая': '#e3f2fd',
  '📖 Изучаю': '#fff3e0',
  '💬 В работе': '#fce4ec',
  '✅ Договорились': '#e8f5e9',
  '💰 Оплачено': '#f3e5f5',
  '📢 Размещено': '#e0f7fa',
  '❌ Отказ': '#ffebee',
};

export const STATUS_BG: Record<string, string> = {
  '🆕 Новая': 'bg-blue-50',
  '📖 Изучаю': 'bg-orange-50',
  '💬 В работе': 'bg-pink-50',
  '✅ Договорились': 'bg-green-50',
  '💰 Оплачено': 'bg-purple-50',
  '📢 Размещено': 'bg-cyan-50',
  '❌ Отказ': 'bg-red-50',
};

export const STATUS_TEXT: Record<string, string> = {
  '🆕 Новая': 'text-blue-700',
  '📖 Изучаю': 'text-orange-700',
  '💬 В работе': 'text-pink-700',
  '✅ Договорились': 'text-green-700',
  '💰 Оплачено': 'text-purple-700',
  '📢 Размещено': 'text-cyan-700',
  '❌ Отказ': 'text-red-700',
};

export const PAGES = [
  { k: 'dashboard', i: '📊', l: 'Дашборд' },
  { k: 'kanban', i: '🗂', l: 'Статусы заявок' },
  { k: 'leads', i: '📋', l: 'Все заявки' },
  { k: 'hot', i: '🔥', l: 'Горячие лиды' },
  { k: 'analytics', i: '📈', l: 'Аналитика' },
];
