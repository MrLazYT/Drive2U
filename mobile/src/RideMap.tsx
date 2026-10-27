import React, {useMemo,useState} from 'react';
import {Linking,Text,View} from 'react-native';
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
  fullScreen?: boolean;
  insets?: {top:number;bottom:number};
};

const tiles='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
function htmlFor(props:Props):string {
  const data = JSON.stringify({
    pickup:props.pickup,destination:props.destination,
    geometry:props.route?.geometry??[],locations:props.locations,
    interactive:!!props.onPick,panel:!!props.fullScreen&&!props.onPick,insets:props.insets,
  }).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
  return `<!DOCTYPE html><html lang="uk"><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/><style>${leafletCss}
    html,body,#map{margin:0;width:100%;height:100%;background:#ecf2e7}
    .leaflet-container{background:#ecf2e7;font-family:system-ui,-apple-system,sans-serif}
    .leaflet-control-attribution{font-size:11px!important;background:rgba(255,255,255,.96)!important}
    .pin{height:28px;width:28px;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px #173f3d55;display:grid;place-items:center;color:white;font:bold 14px system-ui}
    </style></head><body><div id="map"></div><script>${leafletJs}</script><script>
    (function(){
      const data=${data};
      const map=L.map('map',{zoomControl:false,attributionControl:true,touchZoom:true,dragging:true,maxZoom:19,minZoom:2}).setView([49.841,24.013],13);
      map.attributionControl.setPrefix('Leaflet');
      const send=value=>window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(value));
      const layer=L.tileLayer('${tiles}',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'});
      let loaded=false;
      layer.on('tileload',()=>{if(!loaded){loaded=true;send({type:'tiles-ready'});}});
      layer.on('tileerror',()=>send({type:'tiles-error'}));
      layer.addTo(map);
      function marker(point,color,glyph){if(!point)return;
        L.marker([point.latitude,point.longitude],{icon:L.divIcon({html:'<span class="pin" style="background:'+color+'">'+glyph+'</span>',iconSize:[28,28],iconAnchor:[14,14],className:''})}).addTo(map);
      }
      marker(data.pickup,'#147d64','●');marker(data.destination,'#173d66','◆');
      const viewportHeight=map.getSize().y;
      const fitOptions=data.panel?{
        paddingTopLeft:[24,Math.min(data.insets?.top??170,Math.floor(viewportHeight*0.42))],
        paddingBottomRight:[24,Math.min(data.insets?.bottom??230,Math.floor(viewportHeight*0.42))],
        maxZoom:15
      }:{padding:[30,30],maxZoom:15};
      if(data.geometry.length>=2){
        const points=data.geometry.map(p=>[p.latitude,p.longitude]);
        L.polyline(points,{color:'#ffffff',weight:11,opacity:.9}).addTo(map);
        L.polyline(points,{color:'#147d64',weight:7,opacity:.95}).addTo(map);
        map.fitBounds(L.latLngBounds(points),fitOptions);
      }else if(data.pickup&&data.destination){map.fitBounds([[data.pickup.latitude,data.pickup.longitude],[data.destination.latitude,data.destination.longitude]],fitOptions);}
      else if(data.pickup||data.destination){const p=data.pickup||data.destination;map.setView([p.latitude,p.longitude],14);}
      if(data.interactive)map.on('click',event=>window.ReactNativeWebView?.postMessage(JSON.stringify({type:'pick',latitude:event.latlng.lat,longitude:event.latlng.lng})));
    })();
    </script></body></html>`;
}

export function RideMap(props:Props){
  const[tilesError,setTilesError]=useState(false);
  // The parent recreates onPick as state changes; its presence is enough to
  // configure map interactivity. Keep the WebView HTML stable during a timer tick.
  const html=useMemo(()=>htmlFor(props),[props.pickup,props.destination,props.route,props.locations,Boolean(props.onPick),props.fullScreen,props.insets?.top,props.insets?.bottom]);
  return <View style={props.fullScreen?{flex:1}:{gap:6}}>
    <View style={props.fullScreen?{flex:1,backgroundColor:'#ecf2e7'}:{height:290,borderRadius:18,overflow:'hidden',borderWidth:1,borderColor:colors.border,backgroundColor:'#ecf2e7'}}>
      <WebView originWhitelist={['*']} source={{html,baseUrl:'about:blank'}}
        userAgent="Drive2U/1.0 (+https://github.com/MrLazYT/Drive2U)"
        javaScriptEnabled domStorageEnabled={false} scrollEnabled={false}
        mixedContentMode="never" allowsBackForwardNavigationGestures={false}
        onShouldStartLoadWithRequest={request=>{
          if(request.url.startsWith('https://www.openstreetmap.org/copyright')){void Linking.openURL(request.url);return false;}
          return request.url.startsWith('about:blank');
        }}
        onError={()=>setTilesError(true)}
        onMessage={event=>{
          try{const value=JSON.parse(event.nativeEvent.data) as {type?:string;latitude?:number;longitude?:number};
            if(value.type==='tiles-error'){setTilesError(true);return;}
            if(value.type==='tiles-ready'){setTilesError(false);return;}
            if(value.type==='pick'&&props.onPick&&typeof value.latitude==='number'&&typeof value.longitude==='number'&&
              Number.isFinite(value.latitude)&&Number.isFinite(value.longitude)&&
              value.latitude>=-90&&value.latitude<=90&&value.longitude>=-180&&value.longitude<=180)
              props.onPick({latitude:value.latitude,longitude:value.longitude});
          }catch{/* Ignore malformed WebView messages. */}
        }}/>
    </View>
    {tilesError&&<Text style={styles.muted}>Мапа зараз недоступна. Перевірте інтернет.</Text>}
    {!props.fullScreen&&<Text style={styles.muted}>{props.onPick?'Натисніть на мапу, щоб вибрати точку. ':''}{props.route?.attribution??'© OpenStreetMap contributors'}</Text>}
  </View>;
}
