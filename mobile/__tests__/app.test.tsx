import React from 'react';
import {cleanup,fireEvent,render,waitFor} from '@testing-library/react-native';
import App from '../App';
import {Api} from '../src/api';

jest.mock('expo-secure-store',()=>({WHEN_UNLOCKED_THIS_DEVICE_ONLY:1,getItemAsync:jest.fn().mockResolvedValue(null),setItemAsync:jest.fn().mockResolvedValue(undefined),deleteItemAsync:jest.fn().mockResolvedValue(undefined)}));
jest.mock('@react-native-async-storage/async-storage',()=>({__esModule:true,default:{getItem:jest.fn().mockResolvedValue(null),setItem:jest.fn(),removeItem:jest.fn()}}));
jest.mock('expo-location',()=>({requestForegroundPermissionsAsync:jest.fn(),getCurrentPositionAsync:jest.fn(),Accuracy:{Balanced:3}}));
jest.mock('react-native-safe-area-context',()=>{const React=require('react');const {View}=require('react-native');return {SafeAreaProvider:({children}:any)=>React.createElement(View,null,children),SafeAreaView:({children,style}:any)=>React.createElement(View,{style},children)};});
jest.mock('react-native-webview',()=>{const React=require('react');const {View}=require('react-native');return {WebView:(props:unknown)=>React.createElement(View,{testID:'map',...(props as object)})};});
jest.mock('@microsoft/signalr',()=>({LogLevel:{None:0},HubConnectionBuilder:jest.fn().mockImplementation(()=>({withUrl(){return this;},configureLogging(){return this;},withAutomaticReconnect(){return this;},build(){return {state:'Disconnected',on:jest.fn(),onreconnecting:jest.fn(),onreconnected:jest.fn(),onclose:jest.fn(),start:jest.fn().mockRejectedValue(new Error('offline')),stop:jest.fn().mockResolvedValue(undefined)};}}))}));
const passenger={id:'p',name:'Олена Демо',email:'passenger@drive2u.test',role:'Passenger' as const,driverProfile:null};
beforeEach(()=>{
 jest.spyOn(Api.prototype,'login').mockResolvedValue({accessToken:'sample',expiresAt:new Date(Date.now()+3600000).toISOString(),user:passenger});
 jest.spyOn(Api.prototype,'me').mockResolvedValue(passenger);
 jest.spyOn(Api.prototype,'active').mockResolvedValue(null);
 jest.spyOn(Api.prototype,'history').mockResolvedValue({items:[],page:1,pageSize:20,total:0});
 jest.spyOn(Api.prototype,'locations').mockResolvedValue([]);
});
afterEach(async()=>{await cleanup();jest.restoreAllMocks();});
test('passenger opens the full map and finds history through profile',async()=>{
 const ui=await render(<App/>);
 await waitFor(()=>expect(ui.getByLabelText('Електронна пошта')).toBeTruthy());
 await fireEvent.changeText(ui.getByLabelText('Електронна пошта'),'passenger@drive2u.test');
 await fireEvent.changeText(ui.getByLabelText('Пароль'),'Drive2U!Demo2026');
 await fireEvent.press(ui.getByRole('button',{name:'Увійти'}));
 await waitFor(()=>expect(ui.getByRole('button',{name:'Звідки'})).toBeTruthy());
 expect(ui.getByTestId('map')).toBeTruthy();
 await fireEvent.press(ui.getByRole('button',{name:'Профіль'}));
 await waitFor(()=>expect(ui.getByRole('button',{name:'Історія поїздок'})).toBeTruthy());
 await fireEvent.press(ui.getByRole('button',{name:'Історія поїздок'}));
 await waitFor(()=>expect(ui.getByText('Історія поїздок')).toBeTruthy());
});
