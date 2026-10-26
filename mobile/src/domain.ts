import type { Ride, RideStatus, User } from './types';
export const statusText: Record<RideStatus,string> = { Waiting:'Шукаємо водія', Accepted:'Водій їде до вас', Arrived:'Водій на місці', InProgress:'Поїздка триває', Completed:'Поїздку завершено', Cancelled:'Поїздку скасовано' };
export const terminal = (ride:Ride) => ride.status === 'Completed' || ride.status === 'Cancelled';
export function canCancel(ride:Ride, user:User) { return user.role === 'Passenger' ? ['Waiting','Accepted'].includes(ride.status) : ['Accepted','Arrived'].includes(ride.status); }
export function nextStatus(status:RideStatus):{status:RideStatus;label:string}|null {
  return status === 'Accepted' ? {status:'Arrived',label:'Я прибув'} : status === 'Arrived' ? {status:'InProgress',label:'Почати поїздку'} : status === 'InProgress' ? {status:'Completed',label:'Завершити поїздку'} : null;
}
export const money = (amount:number) => `${amount.toFixed(2)} ₴`;
