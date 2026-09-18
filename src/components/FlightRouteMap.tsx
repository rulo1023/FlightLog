import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { getAirport } from '../lib/airports';
import { airlineAppearance } from '../lib/flightVisuals';
import type { Flight } from '../lib/flights';
import type { ThemeColors } from '../theme';

const worldTopology = require('../data/world-110m.json') as unknown;

type MapRoute = {
  id: string;
  fromCode: string;
  fromName: string;
  toCode: string;
  toName: string;
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
  color: string;
  count: number;
  airlines: Array<{ label: string; color: string; count: number }>;
};

export function flightsWithMapCoordinates(flights: Flight[]) {
  return flights.filter((flight) => getAirport(flight.departure_airport_code) && getAirport(flight.arrival_airport_code));
}

function createRoutes(flights: Flight[], grouped: boolean): MapRoute[] {
  const routes = new Map<string, MapRoute>();

  flights.forEach((flight) => {
    const from = getAirport(flight.departure_airport_code);
    const to = getAirport(flight.arrival_airport_code);
    if (!from || !to) return;

    const routeKey = grouped
      ? [from.iata, to.iata].sort().join('-')
      : flight.id;
    const appearance = airlineAppearance(flight.flight_number, flight.airline_name);
    const airlineLabel = flight.airline_name?.trim() || flight.flight_number?.match(/^[A-Z0-9]+/)?.[0] || 'Sin aerolínea';
    const existing = routes.get(routeKey);
    if (existing) {
      existing.count += 1;
      const airline = existing.airlines.find((item) => item.label === airlineLabel);
      if (airline) airline.count += 1;
      else existing.airlines.push({ label: airlineLabel, color: appearance.background, count: 1 });
      return;
    }

    routes.set(routeKey, {
      id: flight.id,
      fromCode: from.iata,
      fromName: from.name || from.city,
      toCode: to.iata,
      toName: to.name || to.city,
      fromLatitude: from.latitude,
      fromLongitude: from.longitude,
      toLatitude: to.latitude,
      toLongitude: to.longitude,
      color: appearance.background,
      count: 1,
      airlines: [{ label: airlineLabel, color: appearance.background, count: 1 }],
    });
  });

  return [...routes.values()].map((route) => {
    route.airlines.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    route.color = route.airlines[0]?.color || route.color;
    return route;
  });
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function mapHtml(routes: MapRoute[], colors: ThemeColors, focused: boolean, interactive: boolean) {
  const payload = safeJson(routes);
  const palette = safeJson({
    water: colors.sky,
    land: colors.surfaceRaised,
    landStroke: colors.line,
    grid: colors.routeLine,
    ink: colors.ink,
    muted: colors.muted,
    halo: colors.surface,
    primary: colors.primary,
  });
  const topology = safeJson(worldTopology);

  return `<!doctype html>
<html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  *{box-sizing:border-box} html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;font-family:system-ui,-apple-system,sans-serif}
  svg{display:block;width:100%;height:100%;touch-action:${interactive ? 'none' : 'manipulation'}}.route-hit{stroke:transparent;stroke-width:18;fill:none;cursor:pointer}
  .code{font-weight:800;letter-spacing:.3px}.count{font-weight:800}
  .controls{position:absolute;right:10px;bottom:10px;display:${interactive ? 'flex' : 'none'};flex-direction:column;gap:6px}.controls button{width:36px;height:36px;border:1px solid ${colors.line};border-radius:11px;background:${colors.surface};color:${colors.ink};font-size:20px;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.12)}.controls button:last-child{font-size:15px}
</style></head><body><svg id="map" role="img" aria-label="Mapa de rutas de vuelo"></svg><div class="controls"><button id="zoom-in" aria-label="Acercar">+</button><button id="zoom-out" aria-label="Alejar">−</button><button id="reset" aria-label="Ver mapa completo">⌂</button></div>
<script>
const routes=${payload}; const colors=${palette}; const topology=${topology}; const focused=${focused ? 'true' : 'false'}; const interactive=${interactive ? 'true' : 'false'};
const svg=document.getElementById('map'), NS='http://www.w3.org/2000/svg', W=1000, H=500; let suppressClickUntil=0;
const project=(lon,lat)=>[(lon+180)/360*W,(90-lat)/180*H];
const el=(name,attrs,parent=svg)=>{const node=document.createElementNS(NS,name);Object.entries(attrs||{}).forEach(([k,v])=>node.setAttribute(k,String(v)));parent.appendChild(node);return node};
const defs=el('defs'); const grad=el('linearGradient',{id:'water',x1:'0',y1:'0',x2:'0',y2:'1'},defs);
el('stop',{offset:'0%','stop-color':colors.water,'stop-opacity':'1'},grad); el('stop',{offset:'100%','stop-color':colors.water,'stop-opacity':'.55'},grad);
el('rect',{x:-1000,y:0,width:3000,height:500,fill:'url(#water)'});
for(let lon=-180;lon<=180;lon+=30){const x=project(lon,0)[0];el('line',{x1:x,y1:0,x2:x,y2:H,stroke:colors.grid,'stroke-width':1,opacity:.2})}
for(let lat=-60;lat<=60;lat+=30){const y=project(0,lat)[1];el('line',{x1:-1000,y1:y,x2:2000,y2:y,stroke:colors.grid,'stroke-width':1,opacity:.2})}
const arcCache=new Map();
function decodeArc(index){
  const reverse=index<0,key=reverse?~index:index;if(!arcCache.has(key)){
    let x=0,y=0;const decoded=topology.arcs[key].map(point=>{x+=point[0];y+=point[1];return [x*topology.transform.scale[0]+topology.transform.translate[0],y*topology.transform.scale[1]+topology.transform.translate[1]]});arcCache.set(key,decoded);
  }
  const points=arcCache.get(key);return reverse?[...points].reverse():points;
}
function polygonsOf(geometry){
  if(geometry.type==='Polygon')return [geometry.arcs];if(geometry.type==='MultiPolygon')return geometry.arcs;
  if(geometry.type==='GeometryCollection')return geometry.geometries.flatMap(polygonsOf);return [];
}
function ringPath(ring,offset){
  const points=[];ring.forEach((arcIndex,index)=>{const arc=decodeArc(arcIndex);points.push(...(index?arc.slice(1):arc))});
  return points.map((point,index)=>{const q=project(point[0],point[1]);return (index?'L':'M')+(q[0]+offset).toFixed(1)+','+q[1].toFixed(1)}).join(' ')+'Z';
}
function polygonPath(polygon,offset){return polygon.map(ring=>ringPath(ring,offset)).join(' ')}
const landPolygons=polygonsOf(topology.objects.land),countries=topology.objects.countries.geometries;
[-1000,0,1000].forEach(offset=>{
  landPolygons.forEach(polygon=>el('path',{d:polygonPath(polygon,offset),fill:colors.land,stroke:colors.landStroke,'stroke-width':1.2,'fill-rule':'evenodd','vector-effect':'non-scaling-stroke'}));
  countries.flatMap(polygonsOf).forEach(polygon=>el('path',{d:polygonPath(polygon,offset),fill:'none',stroke:colors.landStroke,'stroke-width':.7,opacity:.7,'vector-effect':'non-scaling-stroke'}));
});
function routeGeometry(route){
  let lon1=route.fromLongitude,lon2=route.toLongitude;if(lon2-lon1>180)lon2-=360;if(lon2-lon1<-180)lon2+=360;
  const a=project(lon1,route.fromLatitude),b=project(lon2,route.toLatitude),dx=b[0]-a[0],dy=b[1]-a[1];
  const length=Math.hypot(dx,dy),lift=Math.min(105,Math.max(1.5,length*.15)); const cx=(a[0]+b[0])/2,cy=(a[1]+b[1])/2-lift;
  return {a,b,cx,cy,d:'M'+a[0]+','+a[1]+' Q'+cx+','+cy+' '+b[0]+','+b[1],mid:[.25*a[0]+.5*cx+.25*b[0],.25*a[1]+.5*cy+.25*b[1]]};
}
function focusedViewport(route){
  const g=routeGeometry(route),xs=[g.a[0],g.b[0],g.cx],ys=[g.a[1],g.b[1],g.cy],cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
  const ratio=viewportRatio(),spanX=Math.max(...xs)-Math.min(...xs),spanY=Math.max(...ys)-Math.min(...ys),height=Math.max(12,Math.max(spanY,spanX/ratio)*1.8),width=height*ratio;
  return {x:cx-width/2,y:cy-height/2,width,height};
}
function viewportRatio(){const rect=svg.getBoundingClientRect();return Math.max(.85,Math.min(2.8,rect.width/Math.max(1,rect.height)||1.45))}
function routesViewport(items){
  const rawX=items.flatMap(route=>[project(route.fromLongitude,route.fromLatitude)[0],project(route.toLongitude,route.toLatitude)[0]]).sort((a,b)=>a-b);
  const rawY=items.flatMap(route=>{const geometry=routeGeometry(route);return [geometry.a[1],geometry.b[1],geometry.cy]});
  if(!rawX.length)return {x:0,y:0,width:1000,height:500};
  let start=rawX[0],largestGap=-1;
  rawX.forEach((value,index)=>{const next=index===rawX.length-1?rawX[0]+1000:rawX[index+1],gap=next-value;if(gap>largestGap){largestGap=gap;start=next%1000}});
  const unwrapped=rawX.map(value=>value<start?value+1000:value),minX=Math.min(...unwrapped),maxX=Math.max(...unwrapped),minY=Math.min(...rawY),maxY=Math.max(...rawY);
  const ratio=viewportRatio(),spanX=Math.max(1,maxX-minX),spanY=Math.max(1,maxY-minY);let width=Math.max(115,spanX*1.3),height=Math.max(65,spanY*1.4);
  if(width/height<ratio)width=height*ratio;else height=width/ratio;
  const scale=Math.min(1,1000/width,500/height);width*=scale;height*=scale;
  let centerX=(minX+maxX)/2;if(centerX>1000)centerX-=1000;
  const centerY=(minY+maxY)/2;
  return {x:centerX-width/2,y:Math.max(-25,Math.min(525-height,centerY-height/2)),width,height};
}
const focusBox=focused&&routes.length?focusedViewport(routes[0]):null;
const initialBox=focusBox||(interactive&&routes.length?routesViewport(routes):{x:0,y:0,width:1000,height:500});
svg.setAttribute('viewBox',[initialBox.x,initialBox.y,initialBox.width,initialBox.height].join(' '));
routes.forEach((route,index)=>{
  const g=routeGeometry(route), width=Math.min(9,focused?6:2.5+Math.log2(route.count+1)*1.5);
  const markerRadius=focused&&focusBox?focusBox.width*.018:5,labelSize=focused&&focusBox?focusBox.width*.045:15,labelOffset=focused&&focusBox?focusBox.width*.055:16,outline=focused&&focusBox?focusBox.width*.012:5;
  const gradientId='route-gradient-'+index,total=Math.max(1,route.airlines.reduce((sum,item)=>sum+item.count,0));
  if(route.airlines.length>1){
    const gradient=el('linearGradient',{id:gradientId,x1:g.a[0],y1:g.a[1],x2:g.b[0],y2:g.b[1],gradientUnits:'userSpaceOnUse'},defs);let progress=0;
    route.airlines.forEach(item=>{const start=progress/total*100;progress+=item.count;const end=progress/total*100;el('stop',{offset:start+'%','stop-color':item.color},gradient);el('stop',{offset:end+'%','stop-color':item.color},gradient)});
  }
  const routePaint=route.airlines.length>1?'url(#'+gradientId+')':route.color;
  (focused?[0]:[-1000,0,1000]).forEach(offset=>{
    const group=el('g',{transform:'translate('+offset+' 0)'});
    el('path',{d:g.d,fill:'none',stroke:colors.halo,'stroke-width':width+5,'data-base-width':width+5,class:focused?'':'zoom-stroke',opacity:.78,'stroke-linecap':'round','vector-effect':'non-scaling-stroke'},group);
    el('path',{d:g.d,fill:'none',stroke:routePaint,'stroke-width':width,'data-base-width':width,class:focused?'':'zoom-stroke',opacity:focused?1:.9,'stroke-linecap':'round','vector-effect':'non-scaling-stroke'},group);
    const hit=el('path',{d:g.d,class:'route-hit','vector-effect':'non-scaling-stroke'},group);hit.onclick=()=>{if(Date.now()<suppressClickUntil)return;window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify({type:'route',id:route.id}))};
    if(focused&&focusBox&&Math.hypot(g.b[0]-g.a[0],g.b[1]-g.a[1])/focusBox.width>.12){
      const angle=Math.atan2(g.b[1]-g.a[1],g.b[0]-g.a[0])*180/Math.PI;
      const planeSize=focusBox.width*.06;
      el('circle',{cx:g.mid[0],cy:g.mid[1],r:planeSize*.63,fill:colors.halo,opacity:.96},group);
      const plane=el('text',{x:g.mid[0],y:g.mid[1]+planeSize*.28,fill:route.color,stroke:colors.halo,'stroke-width':focusBox.width*.008,'paint-order':'stroke','font-size':planeSize,'text-anchor':'middle',transform:'rotate('+angle+' '+g.mid[0]+' '+g.mid[1]+')'},group);plane.textContent='✈';
    } else if(route.count>1){
      el('rect',{x:g.mid[0]-15,y:g.mid[1]-10,width:30,height:20,rx:10,'data-center-x':g.mid[0],'data-center-y':g.mid[1],class:'route-badge',fill:colors.halo,stroke:route.color,'stroke-width':2,'vector-effect':'non-scaling-stroke','pointer-events':'none'},group);
      const t=el('text',{x:g.mid[0],y:g.mid[1],fill:route.color,'font-size':11,'text-anchor':'middle','dominant-baseline':'central',class:'count route-badge-text','data-center-x':g.mid[0],'data-center-y':g.mid[1],'pointer-events':'none'},group);t.textContent=route.count+'×';
    }
    [[g.a,route.fromCode],[g.b,route.toCode]].forEach(([point,code])=>{
      const p=point;
      if(focused){
        el('circle',{cx:p[0],cy:p[1],r:markerRadius,fill:route.color,stroke:colors.halo,'stroke-width':4,'vector-effect':'non-scaling-stroke'},group);
        const center=[(g.a[0]+g.b[0])/2,(g.a[1]+g.b[1])/2],vx=p[0]-center[0],vy=p[1]-center[1],vertical=Math.abs(vy)>Math.abs(vx);
        const labelX=vertical?p[0]:p[0]+(vx<0?-labelOffset:labelOffset),labelY=vertical?p[1]+(vy<0?-labelOffset:labelOffset*.85):p[1]-labelOffset*.45,anchor=vertical?'middle':(vx<0?'end':'start');
        const label=el('text',{x:labelX,y:labelY,fill:colors.ink,'font-size':labelSize,'font-weight':800,'text-anchor':anchor,stroke:colors.halo,'stroke-width':outline,'paint-order':'stroke'},group);label.textContent=code;
      }
    });
  });
});
if(!focused){
  const airports=new Map();
  routes.forEach(route=>[
    {code:route.fromCode,name:route.fromName,latitude:route.fromLatitude,longitude:route.fromLongitude},
    {code:route.toCode,name:route.toName,latitude:route.toLatitude,longitude:route.toLongitude},
  ].forEach(airport=>{const current=airports.get(airport.code);if(current)current.count+=route.count;else airports.set(airport.code,{...airport,count:route.count})}));
  [...airports.values()].forEach(airport=>{
    const point=project(airport.longitude,airport.latitude);
    [-1000,0,1000].forEach(offset=>{
      const x=point[0]+offset,y=point[1];
      el('circle',{cx:x,cy:y,r:4,'data-base-radius':4,class:'zoom-symbol airport-point',fill:colors.primary,stroke:colors.halo,'stroke-width':2,'data-base-stroke':2,'data-count':airport.count,'vector-effect':'non-scaling-stroke','pointer-events':'none'});
      const label=el('text',{x:x+7,y:y-5,'data-point-x':x,'data-point-y':y,'data-count':airport.count,fill:colors.ink,stroke:colors.halo,'stroke-width':3,'paint-order':'stroke','font-weight':750,'font-size':12,class:'airport-label','text-anchor':'start',opacity:0,'pointer-events':'none'});label.textContent=airport.code;
    });
  });
}
svg.setAttribute('preserveAspectRatio','xMidYMid meet');
if(interactive){
  let home={...initialBox},view={...home},userMoved=false;const pointers=new Map();let previousPoints=[];let gestureActive=false;
  const send=message=>window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(message));
  const setGestureActive=active=>{if(gestureActive===active)return;gestureActive=active;send({type:'gesture',active})};
  function updateVisualScale(){
    const relative=Math.max(.02,Math.min(1,view.width/home.width)),strokeScale=Math.max(.22,Math.pow(relative,.58)),symbolScale=Math.max(.025,Math.pow(relative,1.22)),rect=svg.getBoundingClientRect(),unit=Math.max(.01,view.width/Math.max(1,rect.width));
    svg.querySelectorAll('.zoom-stroke').forEach(node=>node.setAttribute('stroke-width',Number(node.getAttribute('data-base-width'))*strokeScale));
    svg.querySelectorAll('.zoom-symbol').forEach(node=>{node.setAttribute('r',Number(node.getAttribute('data-base-radius'))*symbolScale);node.setAttribute('stroke-width',Number(node.getAttribute('data-base-stroke'))*strokeScale)});
    const badgeScale=Math.max(.68,Math.pow(relative,.16));
    svg.querySelectorAll('.route-badge').forEach(node=>{const cx=Number(node.getAttribute('data-center-x')),cy=Number(node.getAttribute('data-center-y')),width=29*unit*badgeScale,height=19*unit*badgeScale;node.setAttribute('x',cx-width/2);node.setAttribute('y',cy-height/2);node.setAttribute('width',width);node.setAttribute('height',height);node.setAttribute('rx',height/2);node.setAttribute('stroke-width',1.7*badgeScale)});
    svg.querySelectorAll('.route-badge-text').forEach(node=>node.setAttribute('font-size',10.5*unit*badgeScale));
    const labels=[...svg.querySelectorAll('.airport-label')].sort((a,b)=>Number(b.getAttribute('data-count'))-Number(a.getAttribute('data-count'))),placed=[],showLabels=relative<.7;
    labels.forEach(node=>{const x=Number(node.getAttribute('data-point-x')),y=Number(node.getAttribute('data-point-y')),sx=(x-view.x)/view.width*rect.width,sy=(y-view.y)/view.height*rect.height,text=node.textContent||'',labelWidth=Math.max(30,text.length*7.5),visible=showLabels&&sx>-10&&sx<rect.width+10&&sy>-10&&sy<rect.height+10&&!placed.some(item=>Math.abs(item.y-sy)<18&&sx<item.x+item.width&&sx+labelWidth>item.x);if(visible)placed.push({x:sx,y:sy,width:labelWidth});node.setAttribute('opacity',visible?1:0);node.setAttribute('x',x+7*unit);node.setAttribute('y',y-5*unit);node.setAttribute('font-size',11*unit);node.setAttribute('stroke-width',2.8*unit)});
  }
  const apply=()=>{svg.setAttribute('viewBox',[view.x,view.y,view.width,view.height].join(' '));updateVisualScale()};
  const clamp=()=>{const ratio=view.width/Math.max(1,view.height),maxWidth=Math.min(1000,500*ratio);view.width=Math.max(14,Math.min(maxWidth,view.width));view.height=view.width/ratio;view.x=Math.max(-1000,Math.min(2000-view.width,view.x));view.y=Math.max(-40,Math.min(540-view.height,view.y))};
  function zoom(factor,clientX,clientY){const rect=svg.getBoundingClientRect(),px=clientX == null ? 0.5 : (clientX-rect.left)/rect.width,py=clientY == null ? 0.5 : (clientY-rect.top)/rect.height,nw=view.width*factor,nh=view.height*factor;view.x+=view.width*px-nw*px;view.y+=view.height*py-nh*py;view.width=nw;view.height=nh;clamp();apply()}
  document.getElementById('zoom-in').onclick=()=>{userMoved=true;zoom(.78)};document.getElementById('zoom-out').onclick=()=>{userMoved=true;zoom(1.28)};document.getElementById('reset').onclick=()=>{userMoved=false;home=routesViewport(routes);view={...home};apply()};
  svg.addEventListener('wheel',event=>{event.preventDefault();userMoved=true;zoom(Math.exp(Math.max(-150,Math.min(150,event.deltaY))*.0018),event.clientX,event.clientY)},{passive:false});
  const points=()=>[...pointers.entries()].map(([id,value])=>({id,x:value.x,y:value.y}));
  const midpoint=list=>({x:(list[0].x+list[1].x)/2,y:(list[0].y+list[1].y)/2});
  const distance=list=>Math.hypot(list[0].x-list[1].x,list[0].y-list[1].y);
  svg.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();svg.setPointerCapture&&svg.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});previousPoints=points();setGestureActive(true)},{passive:false});
  svg.addEventListener('pointermove',event=>{if(!pointers.has(event.pointerId))return;event.preventDefault();event.stopPropagation();const before=previousPoints;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});const after=points(),rect=svg.getBoundingClientRect();if(before.length===1&&after.length===1&&before[0].id===after[0].id){const dx=after[0].x-before[0].x,dy=after[0].y-before[0].y;if(Math.abs(dx)+Math.abs(dy)>1){userMoved=true;suppressClickUntil=Date.now()+250}view.x-=dx/rect.width*view.width;view.y-=dy/rect.height*view.height;clamp();apply()}else if(before.length===2&&after.length===2){const oldMid=midpoint(before),newMid=midpoint(after),oldDistance=distance(before),newDistance=distance(after);userMoved=true;suppressClickUntil=Date.now()+250;view.x-=(newMid.x-oldMid.x)/rect.width*view.width;view.y-=(newMid.y-oldMid.y)/rect.height*view.height;if(oldDistance>0&&newDistance>0)zoom(Math.max(.82,Math.min(1.22,oldDistance/newDistance)),newMid.x,newMid.y);else{clamp();apply()}}previousPoints=after},{passive:false});
  const release=event=>{event.preventDefault();event.stopPropagation();pointers.delete(event.pointerId);previousPoints=points();if(!pointers.size)setGestureActive(false)};
  svg.addEventListener('pointerup',release,{passive:false});svg.addEventListener('pointercancel',release,{passive:false});svg.addEventListener('lostpointercapture',event=>{pointers.delete(event.pointerId);previousPoints=points();if(!pointers.size)setGestureActive(false)});
  const fitToContainer=()=>{if(userMoved)return;home=routesViewport(routes);view={...home};apply()};
  apply();requestAnimationFrame(()=>requestAnimationFrame(fitToContainer));
  if(typeof ResizeObserver!=='undefined')new ResizeObserver(fitToContainer).observe(svg);
}
</script></body></html>`;
}

export function FlightRouteMap({
  flights,
  colors,
  focused = false,
  interactive = false,
  height = 260,
  onSelectFlight,
  onGestureActive,
}: {
  flights: Flight[];
  colors: ThemeColors;
  focused?: boolean;
  interactive?: boolean;
  height?: number;
  onSelectFlight?: (flight: Flight) => void;
  onGestureActive?: (active: boolean) => void;
}) {
  const routes = useMemo(() => createRoutes(flights, !focused), [flights, focused]);
  const html = useMemo(() => mapHtml(routes, colors, focused, interactive), [routes, colors, focused, interactive]);
  const source = useMemo(() => ({ html }), [html]);

  return (
    <View style={[styles.frame, { height, backgroundColor: colors.sky }]}>
      <WebView
        source={source}
        originWhitelist={['*']}
        style={styles.webView}
        containerStyle={styles.webViewContainer}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={(event) => {
          try {
            const message = JSON.parse(event.nativeEvent.data) as { type?: string; id?: string; active?: boolean };
            if (message.type === 'gesture') {
              onGestureActive?.(Boolean(message.active));
              return;
            }
            if (message.type === 'route' && message.id) {
              const flight = flights.find((item) => item.id === message.id);
              if (flight) onSelectFlight?.(flight);
            }
          } catch {
            const flight = flights.find((item) => item.id === event.nativeEvent.data);
            if (flight) onSelectFlight?.(flight);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  webView: { backgroundColor: 'transparent' },
  webViewContainer: { backgroundColor: 'transparent' },
});
