import {searchAddresses,reverseAddress} from '../src/geocoding';

const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
test('Photon result exposes readable address and correct lat/lon order',async()=>{
 globalThis.fetch=jest.fn().mockResolvedValue({ok:true,json:async()=>({features:[{geometry:{coordinates:[24.02626,49.84405]},properties:{name:'Львівська опера',city:'Львів',country:'Україна'}}]})}) as typeof fetch;
 expect(await searchAddresses('Львівська опера')).toEqual([{longitude:24.02626,latitude:49.84405,address:'Львівська опера, Львів, Україна'}]);
 expect((globalThis.fetch as jest.Mock).mock.calls[0][0]).toContain('q=%D0%9B');
});
test('unavailable geocoder rejects and reverse lookup may return no address',async()=>{
 globalThis.fetch=jest.fn().mockResolvedValueOnce({ok:false}).mockResolvedValueOnce({ok:true,json:async()=>({features:[]})}) as typeof fetch;
 await expect(searchAddresses('вулиця')).rejects.toThrow('GEOCODER_UNAVAILABLE');
 await expect(reverseAddress(49.84,24.02)).resolves.toBeNull();
});
