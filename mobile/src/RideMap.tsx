import React, {useMemo} from 'react';
import {Text,View} from 'react-native';
import {WebView} from 'react-native-webview';
import type {Coordinate,Location,Point,Route} from './types';
import {leafletCss,leafletJs} from './leaflet-bundle';
import {colors,styles} from './ui';

type Props = {
  pickup?: Point|null;
  destination?: Point|null;
  route?: Route|null;
  locations: Location[];
  onPick?: (coordinate:Coordinate)=>void;
};

const stationOpera:[[number,number],...Array<[number,number]>]=[
  [49.84085,23.99436],[49.83948,23.99718],[49.83870,24.00203],
  [49.83904,24.00793],[49.83943,24.01391],[49.84027,24.01810],
  [49.84212,24.02183],[49.84405,24.02626]
];
const operaUniversity:[[number,number],...Array<[number,number]>]=[
  [49.84405,24.02626],[49.84310,24.02590],[49.84188,24.02530],
  [49.84061,24.02434],[49.84032,24.02214]
];
// The self-contained map is a schematic of the known demo corridor. It is
// deliberately labelled and cannot be mistaken for verified live road tiles.
function htmlFor(props:Props):string {
  const data = JSON.stringify({
    pickup:props.pickup,destination:props.destination,
    geometry:props.route?.geometry??[],locations:props.locations,
    interactive:!!props.onPick,
  }).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
  return `<!DOCTYPE html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/><style>${leafletCss}
    html,body,#map{margin:0;width:100%;height:100%;background:#ecf2e7}
    .leaflet-container{background:#ecf2e7;font-family:system-ui,-apple-system,sans-serif}
    .leaflet-control-attribution{font-size:10px!important;background:rgba(255,255,255,.9)!important}
    .pin{height:28px;width:28px;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px #173f3d55;display:grid;place-items:center;color:white;font:bold 14px system-ui}
    .venue{background:#fff;color:#183d35;border-radius:12px;padding:4px 8px;white-space:nowrap;font:bold 11px system-ui;box-shadow:0 2px 6px #173f3d26}
    .map-caption{position:absolute;z-index:1000;left:10px;top:10px;background:#fffde9;padding:6px 9px;border-radius:8px;color:#33463c;font:bold 11px system-ui;box-shadow:0 2px 6px #173f3d22}
    </style></head><body><div id="map"></div><div class="map-caption">Схема Львова · демонстрація</div><script>${leafletJs}</script><script>
    (function(){
      const data=${data};
      const map=L.map('map',{zoomControl:true,attributionControl:true,maxZoom:17,minZoom:11,preferCanvas:true}).setView([49.841,24.013],13);
      map.attributionControl.setPrefix('Leaflet · схема Drive2U');
      map.setMaxBounds([[49.75,23.85],[49.92,24.15]]);
      // Draw approximate local orientation only. These are not routable streets.
      const corridor1=${JSON.stringify(stationOpera)},corridor2=${JSON.stringify(operaUniversity)};
      L.polyline(corridor1,{color:'#fff',weight:17,opacity:.85}).addTo(map);
      L.polyline(corridor1,{color:'#b4c7b9',weight:13,opacity:.85}).addTo(map);
      L.polyline(corridor2,{color:'#fff',weight:17,opacity:.85}).addTo(map);
      L.polyline(corridor2,{color:'#b4c7b9',weight:13,opacity:.85}).addTo(map);
      L.polyline([[49.849,24.012],[49.841,24.015],[49.834,24.017]],{color:'#d3e0d2',weight:10}).addTo(map);
      L.polyline([[49.837,23.99],[49.845,24.006],[49.849,24.029]],{color:'#d3e0d2',weight:9}).addTo(map);
      const park=L.polygon([[49.8455,24.004],[49.848,24.008],[49.8468,24.014],[49.8448,24.012]],{color:'#d8e9d0',fillColor:'#c8dfba',fillOpacity:.8,weight:0}).addTo(map);
      park.bindTooltip('Паркова зона',{permanent:true,direction:'center',className:'venue'});
      for(const place of data.locations){
        L.marker([place.latitude,place.longitude],{icon:L.divIcon({html:'<span class="venue">'+String(place.name).replace(/[&<>"']/g,'')+'</span>',iconSize:[1,1],iconAnchor:[0,0],className:''}),interactive:false}).addTo(map);
      }
      function marker(point,color,glyph){if(!point)return;
        L.marker([point.latitude,point.longitude],{icon:L.divIcon({html:'<span class="pin" style="background:'+color+'">'+glyph+'</span>',iconSize:[28,28],iconAnchor:[14,14],className:''})}).addTo(map);
      }
      marker(data.pickup,'#147d64','●');marker(data.destination,'#173d66','◆');
      if(data.geometry.length>=2){
        const points=data.geometry.map(p=>[p.latitude,p.longitude]);
        L.polyline(points,{color:'#ffffff',weight:11,opacity:.9}).addTo(map);
        L.polyline(points,{color:'#147d64',weight:7,opacity:.95}).addTo(map);
        map.fitBounds(L.latLngBounds(points),{padding:[30,30],maxZoom:15});
      }else if(data.pickup&&data.destination){map.fitBounds([[data.pickup.latitude,data.pickup.longitude],[data.destination.latitude,data.destination.longitude]],{padding:[35,35],maxZoom:15});}
      else if(data.pickup||data.destination){const p=data.pickup||data.destination;map.setView([p.latitude,p.longitude],14);}
      if(data.interactive)map.on('click',event=>window.ReactNativeWebView?.postMessage(JSON.stringify({type:'pick',latitude:event.latlng.lat,longitude:event.latlng.lng})));
    })();
    </script></body></html>`;
}

export function RideMap(props:Props){
  // The parent recreates onPick as state changes; its presence is enough to
  // configure map interactivity. Keep the WebView HTML stable during a timer tick.
  const html=useMemo(()=>htmlFor(props),[props.pickup,props.destination,props.route,props.locations,Boolean(props.onPick)]);
  return <View style={{gap:6}}>
    <View style={{height:290,borderRadius:18,overflow:'hidden',borderWidth:1,borderColor:colors.border,backgroundColor:'#ecf2e7'}}>
      <WebView originWhitelist={['*']} source={{html,baseUrl:'about:blank'}}
        javaScriptEnabled domStorageEnabled={false} scrollEnabled={false}
        mixedContentMode="never" allowsBackForwardNavigationGestures={false}
        onShouldStartLoadWithRequest={request=>request.url.startsWith('about:blank')}
        onMessage={event=>{
          if(!props.onPick)return;
          try{const value=JSON.parse(event.nativeEvent.data) as {type?:string;latitude?:number;longitude?:number};
            if(value.type==='pick'&&typeof value.latitude==='number'&&typeof value.longitude==='number'&&
              Number.isFinite(value.latitude)&&Number.isFinite(value.longitude)&&
              value.latitude>=49.75&&value.latitude<=49.92&&value.longitude>=23.85&&value.longitude<=24.15)
              props.onPick({latitude:value.latitude,longitude:value.longitude});
          }catch{/* Ignore malformed WebView messages. */}
        }}/>
    </View>
    <Text style={styles.muted}>Локальна схема для орієнтації. {props.onPick?'Натисніть на мапу, щоб вибрати точку. ':''}{props.route?.attribution??'Демонстраційні вулиці не є маршрутом для навігації.'}</Text>
  </View>;
}
