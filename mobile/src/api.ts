import type { History, Location, Point, Quote, Ride, RoutingMode, Session, User } from './types';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:5187').replace(/\/$/, '');
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Немає зв’язку із сервером. Перевірте мережу та спробуйте ще раз.';
}
const messages: Record<number,string> = {
  400:'Перевірте введені дані. Для демомаршруту виберіть відомі місця зі списку.',
  401:'Сесія закінчилася або дані входу неправильні. Увійдіть знову.',
  403:'Ця дія недоступна для вашого облікового запису.',
  404:'Поїздка недоступна або вже не існує.',
  409:'Стан змінився: пропозиція застаріла або замовлення вже прийняте. Оновіть дані.',
  429:'Забагато запитів. Зачекайте хвилину.',
  503:'Маршрутизація зараз недоступна. Спробуйте пізніше або явно виберіть деморежим.',
};
export class Api {
  constructor(private token: () => string | null, private unauthorized: () => void = () => {}) {}
  async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (!__DEV__ && !API_URL.startsWith('https://')) throw new ApiError(400, 'Для production потрібне HTTPS-з’єднання.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const token = this.token();
      const response = await fetch(API_URL + path, { method, signal: controller.signal,
        headers: { Accept:'application/json', ...(body !== undefined ? {'Content-Type':'application/json'} : {}), ...(token ? {Authorization:`Bearer ${token}`} : {}) },
        ...(body !== undefined ? {body:JSON.stringify(body)} : {}) });
      if (!response.ok) {
        if (response.status === 401 && token) this.unauthorized();
        // Never present raw provider/stack text returned by a misconfigured server.
        throw new ApiError(response.status, messages[response.status] || 'Не вдалося виконати дію. Спробуйте ще раз.');
      }
      if (response.status === 204) return undefined as T;
      return await response.json() as T;
    } finally { clearTimeout(timer); }
  }
  login(email:string,password:string) { return this.request<Session>('/api/auth/login','POST',{email,password}); }
  register(name:string,email:string,password:string) { return this.request<Session>('/api/auth/register','POST',{name,email,password}); }
  me() { return this.request<User>('/api/me'); }
  logout() { return this.request<void>('/api/auth/logout','POST'); }
  locations() { return this.request<Location[]>('/api/locations'); }
  config() { return this.request<{routingMode:RoutingMode;quoteLifetimeSeconds:number}>('/api/config'); }
  quote(pickup:Point,destination:Point,routingMode:RoutingMode) { return this.request<Quote>('/api/quotes','POST',{pickup,destination,routingMode}); }
  confirm(quoteId:string,idempotencyKey:string) { return this.request<Ride>('/api/rides','POST',{quoteId,idempotencyKey}); }
  active() { return this.request<Ride|null>('/api/rides/active'); }
  history(page=1) { return this.request<History>(`/api/rides/history?page=${page}&pageSize=20`); }
  ride(id:string) { return this.request<Ride>(`/api/rides/${encodeURIComponent(id)}`); }
  orders() { return this.request<Ride[]>('/api/driver/orders'); }
  availability(available:boolean) { return this.request<User>('/api/driver/availability','PUT',{available}); }
  accept(id:string) { return this.request<Ride>(`/api/rides/${encodeURIComponent(id)}/accept`,'POST',{}); }
  status(id:string,status:string) { return this.request<Ride>(`/api/rides/${encodeURIComponent(id)}/status`,'POST',{status}); }
  cancel(id:string,reason:string) { return this.request<Ride>(`/api/rides/${encodeURIComponent(id)}/cancel`,'POST',{reason}); }
}
