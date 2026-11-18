import * as T from './three.mjs';
import { LocalTerrain } from './terrain.mjs';
import { destination, measure, validateView } from './navigation.mjs';

const $ = id => document.getElementById(id);
const rad = Math.PI / 180;
const radius = 1737.4;
const au = 149597870.7;
const vec = (x,y,z) => new T.Vector3(x,y,z);
const point = (lat,lon) => vec(Math.cos(lat*rad)*Math.cos(lon*rad),Math.sin(lat*rad),-Math.cos(lat*rad)*Math.sin(lon*rad));
const clamp = T.MathUtils.clamp;
const wrap = x => ((x+180)%360+360)%360-180;
const sites = [
  ['Tycho',-43.31,-11.36],['Copernicus',9.62,-20.08],
  ['Mare Imbrium',32.8,-15.6],['Mare Crisium',17,59.1],['Aristarchus',23.73,-47.49],
  ['Shackleton',-89.9,0],
  ['Mare Tranquillitatis',8.5,31.4],['Tsiolkovskiy',-20.4,129.1],
  ['Von Kármán',-44.45,176.28],['Orientale',-19.4,-92.8]
];
const scene = new T.Scene();
scene.background = new T.Color(0x050810);
const camera = new T.PerspectiveCamera(45,1,0.0001,240000000);
let renderer;
try {
  renderer = new T.WebGLRenderer({antialias:false,logarithmicDepthBuffer:true,powerPreference:"low-power"});
} catch (error) {
  $('status').textContent = 'WebGL is unavailable in this browser.';
  throw error;
}
$('scene').append(renderer.domElement);
renderer.setPixelRatio(Math.min(devicePixelRatio,1));
new ResizeObserver(() => {
  const {clientWidth:w,clientHeight:h} = $('scene');
  if (!w || !h) return;
  renderer.setSize(w,h,false);
  camera.aspect=w/h;
  camera.updateProjectionMatrix();
}).observe($('scene'));

const base = new T.TextureLoader().load('./moon.jpg',undefined,undefined,() => {
  $('status').textContent = 'Lunar imagery unavailable';
});
base.colorSpace = T.SRGBColorSpace;
let detailRequested=false;
function loadCloseupImagery(){
  if(detailRequested || renderer.capabilities.maxTextureSize<4096)return;
  detailRequested=true;
  new T.TextureLoader().load('./moon-detail.webp',texture=>{
    texture.colorSpace=T.SRGBColorSpace;
    texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    globe.material.map=texture;
    globe.material.needsUpdate=true;
    base.dispose();
  });
}
const shape = new T.SphereGeometry(radius,360,180);
const positions=shape.attributes.position;
const uvs=shape.attributes.uv;
const units=new Float32Array(positions.count*3);
const heights=new Float32Array(positions.count);
for (let i=0;i<positions.count;i++) {
  const p=point((uvs.getY(i)-0.5)*180,clamp(uvs.getX(i),0,1)*360-180);
  units.set(p.toArray(),i*3);
}
const colors = new Float32Array(positions.count*3).fill(1);
shape.setAttribute('color',new T.BufferAttribute(colors,3));
const globe = new T.Mesh(shape,new T.MeshLambertMaterial({map:base,vertexColors:true,side:T.DoubleSide}));
scene.add(globe);
const ambient = new T.AmbientLight(0xffffff,1.5);
const sunlight = new T.DirectionalLight(0xfff1dc,2.1);
scene.add(ambient,sunlight);

let dem, terrainReady=false;
let localTerrain;
function updateTerrain() {
  for(let i=0;i<positions.count;i++){
    const r=radius+($('relief').checked?heights[i]:0);
    const j=i*3;
    positions.setXYZ(i,units[j]*r,units[j+1]*r,units[j+2]*r);
  }
  positions.needsUpdate=true;
  shape.computeVertexNormals();
  shape.computeBoundingSphere();
  if(localTerrain)localTerrain.key="";
  resetSurfaceHeight();
}
function elevation(lat,lon){
  if (!dem) return 0;
  const x=(wrap(lon)+180)*4-0.5;
  const y=clamp((90-lat)*4-0.5,0,719);
  const col=Math.floor(x),row=Math.floor(y);
  const sample=(dx,dy)=>dem[Math.min(row+dy,719)*1440+((col+dx+1440)%1440)];
  return T.MathUtils.lerp(T.MathUtils.lerp(sample(0,0),sample(1,0),x-col),
    T.MathUtils.lerp(sample(0,1),sample(1,1),x-col),y-row);
}
function updateResources(){
  const layers=[
    ['ice',point(-84.6796,-48.7093),1.5,[0.12,1.7,3]],
    ['metal',point(8.5,31.4),8,[3,0.85,0.2]],
    ['metal',point(25,-52),7,[3,0.85,0.2]]
  ].filter(([id])=>$(id).checked);
  for(let j=0;j<colors.length;j+=3){
    colors.set([1,1,1],j);
    for(const [,p,width,color] of layers){
      const dot=p.x*units[j]+p.y*units[j+1]+p.z*units[j+2];
      const blend=clamp((dot-Math.cos(width*rad))/(1-Math.cos(width*rad)),0,1);
      if(blend) for(let k=0;k<3;k++) colors[j+k]=T.MathUtils.lerp(colors[j+k],color[k],blend);
    }
  }
  shape.attributes.color.needsUpdate=true;
}
const markers = sites.map(([name,lat,lon],i)=>{
  $('site').add(new Option(name,i));
  const label=document.createElement('span');
  label.className='feature';
  label.textContent=name;
  label.dataset.feature=name;
  $('annotations').append(label);
  return {label,lat,lon,normal:point(lat,lon)};
});

const missionFlags={
  'United States':'us.png',
  'Soviet Union':'su.svg',
  'Russia':'ru.png',
  'China':'cn.png',
  'India':'in.png',
  'Japan':'jp.png',
  'Israel':'il.png',
  'ESA (Europe)':'eu.png'
};
const missionMarkers=[];
let missionCatalog=[];
let restoredCountry="";
function openMissionMedia(mission){
  $('mission-media-title').textContent=mission.name+' — Pictures and videos';
  $('mission-media-intro').textContent='Explore mission imagery and videos using these sources. Search results may include related missions or artist illustrations.';
  const container=$('mission-media-links');
  container.replaceChildren();
  const missionName=mission.name.split(': ').slice(1).join(': ');
  const query=encodeURIComponent(missionName+' Moon');
  const sources=[
    ['Mission website / record',mission.source],
    ['Search NASA Image and Video Library','https://images.nasa.gov/search?q='+query],
    ['Search mission videos on YouTube','https://www.youtube.com/results?search_query='+encodeURIComponent(mission.name+' Moon mission')]
  ];
  if(mission.taskOrder==='TO19D'){
    sources.unshift(
      ['Firefly mission pictures and videos','https://fireflyspace.com/missions/blue-ghost-mission-1/'],
      ['Firefly photo and video album','https://www.flickr.com/photos/fireflyspace/albums/72177720313239766/'],
      ['Firefly lunar sunset video','https://www.youtube.com/watch?v=IpA9DORDkeE']
    );
  }
  for(const [title,url] of sources){
    const link=document.createElement('a');
    link.textContent=title+' ↗';
    link.href=url;
    link.target='_blank';
    link.rel='noopener noreferrer';
    container.append(link);
  }
  $('mission-media').showModal();
}

function showMission(index,center=true){
  const mission=missionCatalog[index];
  if(!mission)return;
  $('missions').checked=true;
  $('mission-panel').hidden=false;
  for(const marker of missionMarkers){
    const selected=marker.mission===mission;
    marker.label.classList.toggle('selected',selected);
    marker.label.style.zIndex=selected?'5':'';
  }
  $('mission-select').value=String(index);
  const info=$('mission-info');
  info.replaceChildren();
  const title=document.createElement('strong');
  title.textContent=mission.name;
  const description=document.createElement('p');
  description.textContent=mission.country+' · '+(mission.clps?'CLPS'+(mission.taskOrder?' '+mission.taskOrder:'')+' · ':'')+mission.status+' · '+mission.type+' · '+mission.date+' · '+mission.accuracy;
  const coordinates=document.createElement('p');
  coordinates.textContent=mission.lat===null?(mission.destination || 'Location unknown'):mission.lat.toFixed(5)+'° N, '+mission.lon.toFixed(5)+'° E';
  const summary=document.createElement('dl');
  summary.className='mission-summary';
  for(const [label,text] of [['Goals',mission.goals],['Outcome',mission.outcome]]){
    const term=document.createElement('dt');
    term.textContent=label;
    const detail=document.createElement('dd');
    detail.textContent=text;
    summary.append(term,detail);
  }
  const summaryLink=document.createElement('a');
  summaryLink.href=mission.summarySource;
  summaryLink.textContent='Goals and outcome source';
  summaryLink.target='_blank';
  summaryLink.rel='noopener';
  const link=document.createElement('a');
  link.href=mission.source;
  link.textContent='Mission source';
  link.target='_blank';
  link.rel='noopener';
  const notes=document.createElement('a');
  notes.href=mission.note;
  notes.textContent='Location notes';
  notes.target='_blank';
  notes.rel='noopener';
  const mediaButton=document.createElement('button');
  mediaButton.type='button';
  mediaButton.className='mission-media-button';
  mediaButton.textContent='Pictures, videos and websites';
  mediaButton.onclick=()=>openMissionMedia(mission);
  info.append(title,description,mediaButton,summary,coordinates,summaryLink,document.createElement('br'),link,document.createTextNode(' · '),notes);
  if(center && mission.lat!==null){
    selectLocation(mission.lat,mission.lon);
    fly=false;
    toggle('fly',false);
  }
}
$('blue-ghost-focus').onclick=()=>{
  $('mission-country').value='';
  $('mission-clps').checked=false;
  filterMissions();
  document.querySelector('[data-mode="orbit"]').click();
  const index=missionCatalog.findIndex(mission=>mission.taskOrder==='TO19D');
  showMission(index);
  altitude=300;
  camera.fov=45;
  camera.updateProjectionMatrix();
  loadCloseupImagery();
};
$('mission-filters').onchange=()=>{
  $('mission-filter-controls').hidden=!$('mission-filters').checked;
  if(!$('mission-filters').checked){
    $('mission-country').value='';
    $('mission-clps').checked=false;
    filterMissions();
  }
};
$('missions').onchange=()=>{
  $('mission-panel').hidden=!$('missions').checked;
  for(const marker of missionMarkers)marker.label.hidden=true;
};
function matchesMission(mission){
  const query=$('mission-search').value.trim().toLowerCase();
  const text=[mission.name,mission.country,mission.date,mission.outcome,mission.status].join(' ').toLowerCase();
  return (!query || query.split(/\s+/).every(word=>text.includes(word))) && (!$('mission-country').value || mission.country===$('mission-country').value) &&
    (!$('mission-clps').checked || mission.clps);
}
function filterMissions(){
  const previous=$('mission-select').value;
  $('mission-select').replaceChildren(new Option('Choose a mission',''));
  let total=0,mapped=0;
  for(const [index,mission] of missionCatalog.entries()){
    if(!matchesMission(mission))continue;
    total++;
    if(mission.lat!==null)mapped++;
    const suffix=mission.status==='Planned'?' · planned':mission.status==='Did not reach Moon'?' · no lunar arrival':mission.lat===null?' · location unknown':'';
    $('mission-select').add(new Option(mission.name+' · '+mission.country+(mission.clps?' · CLPS':'')+suffix,index));
  }
  const retained=Array.from($('mission-select').options).some(option=>option.value===previous);
  $('mission-select').value=retained?previous:'';
  if(!retained)$('mission-info').replaceChildren();
  $('mission-count').textContent=total+' entries · '+mapped+' mapped · '+(total-mapped)+' listed without coordinates';
}
$('mission-search').oninput=filterMissions;
$('mission-country').onchange=$('mission-clps').onchange=filterMissions;
$('mission-flags').onchange=()=>{
  for(const marker of missionMarkers)marker.flag.hidden=!$('mission-flags').checked;
};
$('mission-select').onchange=()=>{
  if($('mission-select').value!=='')showMission(Number($('mission-select').value));
};
fetch('./missions.json?v=missions-8').then(response=>{
  if(!response.ok)throw Error('Mission catalog unavailable');
  return response.json();
}).then(catalog=>{
  missionCatalog=catalog.missions;
  $('catalog-date').textContent='Catalog checked '+catalog.checked;
  for(const [index,mission] of missionCatalog.entries()){
    const located=mission.lat!==null;

    if(!located)continue;
    const label=document.createElement('button');
    label.type='button';
    const impact=mission.type.includes('Impact');
    label.className='feature mission-marker'+(impact?' impact':'')+(mission.clps?' clps':'');
    label.setAttribute('aria-label',mission.country+' · '+mission.name);
    const flag=document.createElement('img');
    flag.className='mission-flag';
    flag.src='./flags/'+missionFlags[mission.country];
    flag.alt=mission.country==='ESA (Europe)'?'European flag (ESA)':mission.country+' flag';
    flag.width=20;
    flag.height=14;
    flag.hidden=!$('mission-flags').checked;
    const name=document.createElement('span');
    name.textContent=(mission.accuracy==='Approximate location'?'≈ ':'')+mission.name;
    label.append(flag,name);
    label.title=mission.type+' · '+mission.date+' · '+mission.accuracy;
    label.hidden=true;
    label.onclick=()=>showMission(index);
    $('annotations').append(label);
    missionMarkers.push({label,flag,mission,lat:mission.lat,lon:mission.lon,normal:point(mission.lat,mission.lon)});
  }
  for(const country of [...new Set(missionCatalog.map(m=>m.country))].sort()){
    $('mission-country').add(new Option(country,country));
  }
  if(restoredCountry)$('mission-country').value=restoredCountry;
  filterMissions();
}).catch(()=>{
  $('mission-count').textContent='Mission catalog unavailable. Reload to retry.';
});

// J2000 right ascension (hours), declination (degrees) and visual magnitude.
const stars=[
  [6.752,-16.716,-1.46],[6.399,-52.696,-0.74],[14.261,19.182,-0.05],[18.615,38.784,0.03],
  [5.279,45.998,0.08],[5.243,-8.202,0.13],[7.655,5.225,0.34],[5.919,7.407,0.42],
  [1.628,-57.237,0.46],[14.064,-60.373,0.61],[19.846,8.868,0.76],[12.443,-63.099,0.77],
  [4.599,16.509,0.85],[16.490,-26.432,0.96],[13.420,-11.161,0.97],[7.755,28.026,1.14],
  [22.961,-29.622,1.16],[20.691,45.280,1.25],[12.795,-59.689,1.25],[10.139,11.967,1.35],
  [6.977,-28.972,1.50],[7.577,31.888,1.58],[17.560,-37.104,1.62],[5.438,28.608,1.65],
  [5.604,-1.202,1.69],[22.137,-46.961,1.74],[12.900,55.960,1.76],[2.530,89.264,1.98]
].map(([ra,dec,mag])=>{
  const geometry=new T.BufferGeometry().setFromPoints([vec(0,0,0)]);
  const star=new T.Points(geometry,new T.PointsMaterial({color:0xdce9ff,size:clamp(2.7-mag*0.5,1,3.2),sizeAttenuation:false}));
  scene.add(star);
  return {star,j2000:vec(Math.cos(dec*rad)*Math.cos(ra*15*rad),Math.cos(dec*rad)*Math.sin(ra*15*rad),Math.sin(dec*rad))};
});
let catalogSky;
fetch('./stars.json').then(response=>{
  if(!response.ok)throw Error('Star catalog unavailable');
  return response.json();
}).then(rows=>{
  const coordinates=[],magnitudes=[];
  for(const [ra,dec,magnitude] of rows){
    coordinates.push(Math.cos(dec*rad)*Math.cos(ra*rad)*210000000,
      Math.cos(dec*rad)*Math.sin(ra*rad)*210000000,Math.sin(dec*rad)*210000000);
    magnitudes.push(magnitude);
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(coordinates,3));
  geometry.setAttribute('magnitude',new T.Float32BufferAttribute(magnitudes,1));
  const material=new T.PointsMaterial({color:0xe4edff,size:2,sizeAttenuation:false});
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float magnitude;\n'+shader.vertexShader.replace(
      'gl_PointSize = size;','gl_PointSize = clamp(3.2 - 0.4 * magnitude, 0.8, 4.0);');
  };
  catalogSky=new T.Points(geometry,material);
  catalogSky.matrixAutoUpdate=false;
  catalogSky.frustumCulled=false;
  scene.add(catalogSky);
  for(const {star} of stars){scene.remove(star);star.geometry.dispose();star.material.dispose();}
  $('sky-quality').textContent=rows.length.toLocaleString()+' catalogued stars · J2000 positions; proper motion omitted';
  skyTime=undefined;
}).catch(()=>{$('sky-quality').textContent='Small bright-star fallback active; catalog could not load';});

const earth = new T.Mesh(new T.SphereGeometry(6371,32,24),new T.MeshLambertMaterial({color:0x458bd5}));
const sun = new T.Mesh(new T.SphereGeometry(696340,32,24),new T.MeshBasicMaterial({color:0xffecc1}));
scene.add(earth,sun);
let time=Date.now(),live=false,map=true,fly=false,skyTime;
let mode='orbit',latitude=0.674,longitude=23.473,orbitLat=13,orbitLon=14;
let orbitAxis;
let eyeHeight=1.7;
let altitude=3500,heading=90,pitch=1,roll=0,surfaceHeight=radius+0.0017;
const raycaster = new T.Raycaster();
function resetSurfaceHeight(){
  if(mode!=='surface')return;
  const normal=point(latitude,longitude);
  globe.updateMatrixWorld(true);
  raycaster.set(normal.clone().multiplyScalar(radius+30),normal.clone().negate());
  const hit=(localTerrain?localTerrain.hits(raycaster):raycaster.intersectObject(globe))[0];
  surfaceHeight=(hit?hit.point.length():radius)+eyeHeight/1000;
}
function updateSky(epoch){
  if(epoch===skyTime)return;
  skyTime=epoch;
  const A=globalThis.Astronomy;
  const date=new Date(epoch);
  const axis=A.RotationAxis(A.Body.Moon,date);
  const pole=vec(axis.north.x,axis.north.y,axis.north.z).normalize();
  const origin=vec(0,0,1).cross(pole).normalize().applyAxisAngle(pole,axis.spin*rad);
  const east=pole.clone().cross(origin);
  const lunar=p=>vec(origin.dot(p),pole.dot(p),-east.dot(p));
  if(catalogSky){
    catalogSky.matrix.set(origin.x,origin.y,origin.z,0,pole.x,pole.y,pole.z,0,-east.x,-east.y,-east.z,0,0,0,0,1);
  }
  const moon=A.GeoVector(A.Body.Moon,date,false);
  const solar=A.GeoVector(A.Body.Sun,date,true);
  const earthVector=lunar(vec(-moon.x,-moon.y,-moon.z));
  const sunVector=lunar(vec(solar.x-moon.x,solar.y-moon.y,solar.z-moon.z));
  earth.position.copy(earthVector).multiplyScalar(au);
  sun.position.copy(sunVector).multiplyScalar(au);
  sunlight.position.copy(sunVector).normalize().multiplyScalar(10000);
  for(const {star,j2000} of stars) star.position.copy(lunar(j2000)).multiplyScalar(210000000);
}
function setTime(epoch){
  time=clamp(epoch,-2208988800000,4133980799999);
  $('clock').value=new Date(time).toISOString().slice(0,16);
}
function toggle(id,on){$(id).setAttribute('aria-pressed',String(on));}
function selectLocation(lat,lon){
  selectedPin.visible=false;
  latitude=clamp(lat,-90,90);
  longitude=wrap(lon);
  orbitLat=lat;
  orbitLon=longitude;
  orbitAxis=undefined;
  $('lat').value=lat;
  $('lon').value=longitude;
  resetSurfaceHeight();
}
function zoom(factor){
  if(mode==='orbit'){
    if(factor<1 && selectedPin.visible && !fly){
      orbitLat=clamp(latitude,-89.999,89.999);
      orbitLon=longitude;
    }
    // Below the altitude floor, zoom optically to keep the camera above the terrain.
    const distance=altitude*camera.fov/45*factor;
    altitude=clamp(distance,15,30000);
    camera.fov=clamp(45*distance/altitude,6,45);
    if(altitude<1200)loadCloseupImagery();
  }else{
    camera.fov=clamp(camera.fov*factor,6,90);
  }
  camera.updateProjectionMatrix();
}
function rotate(dx,dy,bank=false){
  if(bank){roll=wrap(roll+dx*0.25);return;}
  if(mode==='orbit'){
    orbitLon=wrap(orbitLon-dx*0.25);
    orbitLat=clamp(orbitLat+dy*0.25,-89.999,89.999);
    orbitAxis=undefined;
  }else{
    heading=wrap(heading+dx*0.25);
    pitch=clamp(pitch-dy*0.25,-89.9,89.9);
  }
}
for(const button of document.querySelectorAll('[data-mode]'))button.onclick=()=>{
  mode=button.dataset.mode;
  selectedPin.visible=false;
  for(const other of document.querySelectorAll('[data-mode]')) other.setAttribute('aria-pressed',String(other===button));
  camera.fov=45;
  camera.updateProjectionMatrix();
  $('fly').disabled=mode==='surface';
  $('surface-controls').hidden=mode!=='surface';
  if(mode==='surface')loadCloseupImagery();
  $('mode').textContent=mode==='orbit'?'ORBITAL VIEW':'SURFACE VIEW';
  roll=0;
  resetSurfaceHeight();
};
$('site').onchange=()=>{const [,lat,lon]=sites[Number($('site').value)];selectLocation(lat,lon);};
$('coordinates').onsubmit=event=>{
  event.preventDefault();
  selectLocation($('lat').valueAsNumber,$('lon').valueAsNumber);
  $('site').selectedIndex=-1;
};
$('relief').onchange=()=>{selectedPin.visible=false;updateTerrain();};
$('metal').onchange=updateResources;
$('ice').onchange=()=>{
  updateResources();
  $('ice-info').hidden=!$('ice').checked;
};
$('ice-focus').onclick=()=>{
  document.querySelector('[data-mode="orbit"]').click();
  selectLocation(-84.6796,-48.7093);
  altitude=450;
  camera.fov=45;
  camera.updateProjectionMatrix();
  fly=false;
  toggle('fly',false);
  loadCloseupImagery();
};
$('in').onclick=()=>zoom(0.78);
$('out').onclick=()=>zoom(1.28);
$('map').onclick=()=>{map=!map;toggle('map',map);};
$('fly').onclick=()=>{fly=!fly;orbitAxis=undefined;toggle('fly',fly);};
$('live').onclick=()=>{live=!live;toggle('live',live);if(live)setTime(Date.now());};
function useDate(epoch){if(Number.isFinite(epoch)){live=false;toggle('live',false);setTime(epoch);}}
$('clock').onchange=()=>useDate(Date.parse($('clock').value+'Z'));
$('back').onclick=()=>useDate(time-3600000);
$('forward').onclick=()=>useDate(time+3600000);
const view=$('scene');
let pointer;
const pickRay = new T.Raycaster();
const selectedPin = new T.Mesh(new T.SphereGeometry(1,12,8),new T.MeshBasicMaterial({color:0x7bd9fc}));
selectedPin.visible=false;
scene.add(selectedPin);

function pickLocation(event){
  const bounds=view.getBoundingClientRect();
  pickRay.setFromCamera(new T.Vector2(
    (event.clientX-bounds.left)/bounds.width*2-1,
    1-(event.clientY-bounds.top)/bounds.height*2
  ),camera);
  const hit=(localTerrain?localTerrain.hits(pickRay):pickRay.intersectObject(globe))[0];
  if(!hit)return;
  const normal=hit.point.clone().normalize();
  const lat=Math.asin(clamp(normal.y,-1,1))/rad;
  const lon=wrap(Math.atan2(-normal.z,normal.x)/rad);
  if($('measure').checked){addMeasurement({lat,lon});return;}
  $('lat').value=lat.toFixed(5);
  $('lon').value=lon.toFixed(5);
  $('site').selectedIndex=-1;
  if(mode==='orbit'){
    latitude=lat;
    longitude=lon;
  }
  selectedPin.position.copy(hit.point).addScaledVector(normal,0.4);
  selectedPin.visible=mode==='orbit';
}

view.onpointerdown=event=>{
  if(pointer || !event.isPrimary || event.button!==0)return;
  pointer={id:event.pointerId,x:event.clientX,y:event.clientY,dragging:false};
  view.setPointerCapture(pointer.id);
  view.focus({preventScroll:true});
};
view.onpointermove=event=>{
  if(event.pointerId!==pointer?.id)return;
  const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
  if(!pointer.dragging && Math.hypot(dx,dy)<5)return;
  pointer.dragging=true;
  pointer.x=event.clientX;
  pointer.y=event.clientY;
  rotate(dx,dy,event.shiftKey);
};
view.onpointerup=event=>{
  if(event.pointerId!==pointer?.id)return;
  const isClick=!pointer.dragging && Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)<5;
  pointer=undefined;
  if(isClick)pickLocation(event);
};
view.onpointercancel=view.onlostpointercapture=event=>{
  if(event.pointerId===pointer?.id)pointer=undefined;
};
view.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.12:0.89);},{passive:false});
view.onkeydown=e=>{
  const delta={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[e.key];
  if(delta){e.preventDefault();rotate(...delta,e.shiftKey);}
  const walking={w:0,a:-90,s:180,d:90}[e.key.toLowerCase()];
  if(mode==='surface' && walking!==undefined){e.preventDefault();walk(walking);}
  if(e.key==='+'||e.key==='-'){e.preventDefault();zoom(e.key==='+'?0.78:1.28);}
};

selectLocation(latitude,longitude);
orbitLat=13;
orbitLon=14;
setTime(time);
updateTerrain();
fetch('./terrain.bin').then(response=>{
  if(!response.ok)throw Error(response.status);
  return response.arrayBuffer();
}).then(buffer=>{
  if(buffer.byteLength!==1440*720*4)throw Error('Unexpected elevation file size');
  dem=new Float32Array(buffer);
  for(let i=0;i<positions.count;i++)heights[i]=elevation((uvs.getY(i)-0.5)*180,uvs.getX(i)*360-180);
  terrainReady=true;
  updateTerrain();
  $('status').textContent='NASA LROC / LOLA · approx. 30 km equatorial mesh';
}).catch(()=>{$('status').textContent='Elevation data unavailable';});

const iceNormal=point(-84.6796,-48.7093);
const iceEast=vec(0,1,0).cross(iceNormal).normalize();
const iceNorth=iceNormal.clone().cross(iceEast);
const icePoints=[iceNormal.clone()];
for(let i=0;i<=64;i++){
  const angle=i/64*Math.PI*2;
  icePoints.push(iceNormal.clone().multiplyScalar(Math.cos(1.5*rad))
    .addScaledVector(iceEast,Math.sin(1.5*rad)*Math.cos(angle))
    .addScaledVector(iceNorth,Math.sin(1.5*rad)*Math.sin(angle)));
}
const iceGeometry=new T.BufferGeometry();
const iceVertices=[];
for(let i=1;i<icePoints.length-1;i++){
  for(const direction of [icePoints[0],icePoints[i],icePoints[i+1]]){
    iceVertices.push(...direction.clone().multiplyScalar(radius+0.2).toArray());
  }
}
iceGeometry.setAttribute('position',new T.Float32BufferAttribute(iceVertices,3));
const icePatch=new T.Mesh(iceGeometry,new T.MeshBasicMaterial({
  color:0x39dfff,transparent:true,opacity:0.55,side:T.DoubleSide,depthWrite:false,depthTest:false
}));
icePatch.renderOrder=3;
icePatch.visible=false;
scene.add(icePatch);
const iceLabel=document.createElement('span');
iceLabel.className='feature ice-evidence';
iceLabel.textContent='LCROSS · water detected (illustrative extent)';
iceLabel.hidden=true;
$('annotations').append(iceLabel);

localTerrain=new LocalTerrain(scene,globe,elevation,resetSurfaceHeight,message=>{
  if(!graphicsLost)$('status').textContent=message;
});
const resourceUniforms={ map:{value:base},mode:{value:0} };
function resourceMaterial(material){
  const previous=material.onBeforeCompile;
  material.onBeforeCompile=shader=>{
    previous.call(material,shader);
    shader.uniforms.resourceMap=resourceUniforms.map;
    shader.uniforms.resourceMode=resourceUniforms.mode;
    shader.vertexShader='varying vec3 resourcePosition;\n'+shader.vertexShader.replace(
      '#include <begin_vertex>','#include <begin_vertex>\nresourcePosition=position;');
    shader.fragmentShader='varying vec3 resourcePosition;\nuniform sampler2D resourceMap;\nuniform float resourceMode;\n'+shader.fragmentShader.replace(
      '#include <map_fragment>',`#include <map_fragment>
      if(resourceMode>0.5){
        vec3 p=normalize(resourcePosition);
        float lat=asin(clamp(p.y,-1.0,1.0));
        float lon=atan(-p.z,p.x);
        vec2 uv=vec2(lon/6.28318530718+0.5,lat/3.14159265359+0.5);
        bool valid=true;
        if(resourceMode>1.5){
          float rho=2.0*1737400.0*tan(0.78539816339+lat/2.0);
          uv=vec2(rho*sin(lon),rho*cos(lon))/2191860.0+0.5;
          valid=lat<0.0 && all(greaterThanEqual(uv,vec2(0.0))) && all(lessThanEqual(uv,vec2(1.0)));
        }
        if(valid){
          vec4 abundanceColor=texture2D(resourceMap,uv);
          diffuseColor.rgb=mix(diffuseColor.rgb,abundanceColor.rgb,abundanceColor.a*0.85);
        }
      }`);
  };
  material.needsUpdate=true;
}
resourceMaterial(globe.material);
resourceMaterial(localTerrain.mesh.material);
let resourceGeneration=0,resourceTexture,restoreResource=false;
$('resource').onchange=()=>{
  const value=$('resource').value;
  const skipFocus=restoreResource;restoreResource=false;
  if(value==='hydrogen' && !skipFocus)$('ice-focus').click();
  const generation=++resourceGeneration;
  resourceUniforms.mode.value=0;
  if(resourceTexture){resourceTexture.dispose();resourceTexture=null;}
  const description={
    titanium:'Clementine TiO₂ abundance visualization, derived from multispectral measurements. Global preview resampled to ≈5.3 km/pixel at the equator.',
    iron:'Clementine FeO abundance visualization, derived from multispectral measurements. Global preview resampled to ≈5.3 km/pixel at the equator.',
    hydrogen:'Lunar Prospector reconstructed water-equivalent hydrogen visualization. Bundled preview ≈2.1 km/pixel; sensing footprint and uncertainty vary. Hydrogen signals can have several causes.'
  };
  const layer={titanium:'Clem_UVVIS_TiO2_Clr_Global_152ppd',iron:'Clem_UVVIS_FeO_Clr_Global_152ppd',hydrogen:'sp_weh_5km_adapt.map_clr'};
  $('resource-info').replaceChildren();
  if(!value)return;
  $('resource-info').textContent='Loading resource map…';
  new T.TextureLoader().load('./'+value+'.webp',texture=>{
    if(generation!==resourceGeneration){texture.dispose();return;}
    resourceTexture=texture;
    texture.colorSpace=T.SRGBColorSpace;
    resourceUniforms.map.value=texture;
    resourceUniforms.mode.value=value==='hydrogen'?2:1;
    $('resource-info').textContent=description[value]+' Published color visualization blended with terrain. Refer to source metadata for calibration and uncertainty.';
    const link=document.createElement('a');
    link.textContent='NASA product metadata';
    link.target='_blank';link.rel='noopener';
    link.href='https://trek.nasa.gov/moon/TrekWS/rest/cat/metadata/fgdc/html?label='+encodeURIComponent(layer[value]);
    $('resource-info').append(link);

  },undefined,()=>{
    if(generation===resourceGeneration)$('resource-info').textContent='Resource map unavailable. Reload to retry.';
  });
};
const grid=new T.Group();
const gridMaterial=new T.LineBasicMaterial({color:0x79b9d6,transparent:true,opacity:0.28,depthWrite:false});
for(let latitude=-75;latitude<=75;latitude+=15){
  const points=[];
  for(let longitude=-180;longitude<=180;longitude+=2)points.push(point(latitude,longitude).multiplyScalar(radius+12));
  grid.add(new T.Line(new T.BufferGeometry().setFromPoints(points),gridMaterial));
}
for(let longitude=-180;longitude<180;longitude+=15){
  const points=[];
  for(let latitude=-90;latitude<=90;latitude+=2)points.push(point(latitude,longitude).multiplyScalar(radius+12));
  grid.add(new T.Line(new T.BufferGeometry().setFromPoints(points),gridMaterial));
}
grid.visible=false;scene.add(grid);
$('grid').onchange=()=>{grid.visible=$('grid').checked;};
let lastTerrainUpdate=0;
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=T.PCFSoftShadowMap;
sunlight.castShadow=false;
sunlight.shadow.mapSize.set(1024,1024);
sunlight.shadow.bias=-0.0001;
sunlight.shadow.normalBias=0.001;
$('shadows').onchange=()=>{sunlight.castShadow=$('shadows').checked;};
function walk(offset){
  const next=destination(latitude,longitude,heading+offset,Number($('step').value)/1000);
  selectLocation(next.lat,next.lon);
}
for(const button of document.querySelectorAll('[data-move]'))button.onclick=()=>walk(Number(button.dataset.move));
$('eye-height').onchange=()=>{
  eyeHeight=clamp(Number($('eye-height').value)||1.7,1,100);
  $('eye-height').value=eyeHeight;
  resetSurfaceHeight();
};

let measurementPoints=[];
let measurementLine;
function addMeasurement(p){
  if(measurementPoints.length===2)measurementPoints=[];
  measurementPoints.push(p);
  if(measurementLine){scene.remove(measurementLine);measurementLine.geometry.dispose();measurementLine.material.dispose();measurementLine=null;}
  if(measurementPoints.length===1){
    $('measurement').textContent='Start '+p.lat.toFixed(3)+'°, '+p.lon.toFixed(3)+'°. Click an endpoint.';
    return;
  }
  const [a,b]=measurementPoints;
  const result=measure(a,b);
  $('measurement').textContent=result.distance.toFixed(3)+' km along reference sphere'+
    (result.bearing===null?'':' · initial bearing '+result.bearing.toFixed(1)+'°');
  const vertices=[];
  for(let i=0;i<=128;i++){
    const pos=destination(a.lat,a.lon,result.bearing||0,result.distance*i/128);
    vertices.push(point(pos.lat,pos.lon).multiplyScalar(radius+12));
  }
  measurementLine=new T.Line(new T.BufferGeometry().setFromPoints(vertices),new T.LineBasicMaterial({color:0xffef7d}));
  scene.add(measurementLine);
}
$('measure-clear').onclick=()=>{
  measurementPoints=[];
  if(measurementLine){scene.remove(measurementLine);measurementLine.geometry.dispose();measurementLine.material.dispose();measurementLine=null;}
  $('measurement').textContent='Click two terrain points to measure.';
};

let graphicsLost=false;
renderer.domElement.addEventListener('webglcontextlost',event=>{
  event.preventDefault();
  graphicsLost=true;
  $('status').textContent='Graphics context lost. Waiting for browser recovery…';
});
renderer.domElement.addEventListener('webglcontextrestored',()=>{
  graphicsLost=false;
  $('status').textContent=terrainReady?'NASA LROC / LOLA · approx. 30 km equatorial mesh':'Elevation data unavailable';
});

const clusterPool=[];
function clusterButton(index){
  if(!clusterPool[index]){
    const button=document.createElement('button');
    button.className='cluster-marker';
    button.type='button';
    $('annotations').append(button);
    clusterPool.push(button);
  }
  return clusterPool[index];
}
function projectMarker(marker,w,h){
  const height=$('relief').checked?(localTerrain?localTerrain.sample(marker.lat,marker.lon):elevation(marker.lat,marker.lon)):0;
  const p=marker.normal.clone().multiplyScalar(radius+height+0.05);
  if(p.clone().sub(camera.position).dot(marker.normal)>=0)return null;
  if(mode==='surface'){
    const direction=p.clone().sub(camera.position);
    const distance=direction.length();
    pickRay.set(camera.position,direction.normalize());
    const obstruction=localTerrain.hits(pickRay)[0];
    if(obstruction && obstruction.distance<distance-0.1)return null;
  }
  p.project(camera);
  if(Math.abs(p.x)>1 || Math.abs(p.y)>1 || p.z>1 || p.z< -1)return null;
  return {x:(p.x+1)*w/2,y:(1-p.y)*h/2,marker};
}
function layoutMarkers(w,h){
  for(const button of clusterPool)button.hidden=true;
  const projected=[];
  for(const marker of [...markers,...missionMarkers]){
    marker.label.hidden=true;
    if(!(marker.mission?$('missions').checked && matchesMission(marker.mission):$('labels').checked))continue;
    const projection=projectMarker(marker,w,h);
    if(projection)projected.push(projection);
  }
  const groups=[];
  for(const candidate of projected.filter(p=>p.marker.mission)){
    if(candidate.marker.label.classList.contains('selected')){
      candidate.marker.label.hidden=false;
      candidate.marker.label.style.left=candidate.x+'px';
      candidate.marker.label.style.top=candidate.y+'px';
      continue;
    }
    const group=groups.find(group=>Math.abs(group.x-candidate.x)<190 && Math.abs(group.y-candidate.y)<28);
    if(group)group.members.push(candidate);
    else groups.push({x:candidate.x,y:candidate.y,members:[candidate]});
  }
  const occupied=[];
  for(const candidate of projected.filter(p=>p.marker.label.classList.contains('selected'))){
    occupied.push({x:candidate.x,y:candidate.y,width:candidate.marker.label.offsetWidth||160});
  }
  let clusterIndex=0;
  for(const group of groups){
    if(group.members.length>1){
      const button=clusterButton(clusterIndex++);
      button.hidden=false;
      button.textContent=group.members.length+' missions';
      button.style.left=group.x+'px';button.style.top=group.y+'px';
      button.onclick=()=>{
        const dialog=$('mission-media');
        $('mission-media-title').textContent='Missions in this area';
        $('mission-media-intro').textContent='Choose a mission to center its location and view its details.';
        $('mission-media-links').replaceChildren();
        for(const {marker} of group.members){
          const choice=document.createElement('button');
          choice.textContent=marker.mission.name;
          choice.onclick=()=>{
            dialog.close();
            document.querySelector('[data-mode="orbit"]').click();
            showMission(missionCatalog.indexOf(marker.mission));
            altitude=200;camera.fov=45;camera.updateProjectionMatrix();
          };
          $('mission-media-links').append(choice);
        }
        dialog.showModal();
      };
      occupied.push({x:group.x-30,y:group.y,width:90});
    }else{
      const candidate=group.members[0];
      candidate.marker.label.hidden=false;
      candidate.marker.label.style.left=candidate.x+'px';
      candidate.marker.label.style.top=candidate.y+'px';
      occupied.push({x:candidate.x,y:candidate.y,width:candidate.marker.label.offsetWidth||180});
    }
  }
  // Natural feature labels yield space to mission labels and each other.
  for(const candidate of projected.filter(p=>!p.marker.mission)){
    const width=candidate.marker.label.offsetWidth||110;
    const collides=occupied.some(p=>Math.abs(p.y-candidate.y)<23 && candidate.x<p.x+p.width+8 && candidate.x+width>p.x-8);
    if(collides)continue;
    candidate.marker.label.hidden=false;
    candidate.marker.label.style.left=candidate.x+'px';
    candidate.marker.label.style.top=candidate.y+'px';
    occupied.push({x:candidate.x,y:candidate.y,width});
  }
}
function updateScale(w,h){
  const start=new T.Vector2(-0.6,-0.55);
  const end=new T.Vector2(start.x+200/w,start.y);
  pickRay.setFromCamera(start,camera);
  const a=localTerrain.hits(pickRay)[0];
  pickRay.setFromCamera(end,camera);
  const b=localTerrain.hits(pickRay)[0];
  $('scale').hidden=!a || !b;
  if(!a || !b)return;
  const coordinates=p=>({lat:Math.asin(p.clone().normalize().y)/rad,lon:wrap(Math.atan2(-p.z,p.x)/rad)});
  const distance=measure(coordinates(a.point),coordinates(b.point)).distance;
  if(!Number.isFinite(distance) || distance<0.000001){$('scale').hidden=true;return;}
  const magnitude=10**Math.floor(Math.log10(distance));
  const nice=[1,2,5,10].map(n=>n*magnitude).filter(n=>n<=distance).pop();
  $('scale-line').style.width=(nice/distance*100)+'px';
  $('scale-label').textContent=(nice<1?Math.round(nice*1000)+' m':nice.toPrecision(2).replace(/\.0$/,'')+' km')+' · reference sphere';
}

const viewStorage='lunar-atlas-viewpoints-v1';
const layerIds=['relief','labels','ice','metal','missions','mission-flags','grid','shadows'];
let savedViews=[];
function captureView(){
  return {
    version:1,mode,latitude,longitude,orbitLat,orbitLon,altitude,heading,pitch,roll,
    fov:camera.fov,eyeHeight,time,map,resource:$('resource').value,
    detail:$('detail-terrain').checked,
    filters:{country:$('mission-country').value,clps:$('mission-clps').checked,query:$('mission-search').value,visible:$('mission-filters').checked},
    layers:Object.fromEntries(layerIds.map(id=>[id,$(id).checked]))
  };
}
function applyView(value){
  if(!validateView(value))throw Error('Invalid viewpoint');
  document.querySelector('[data-mode="'+value.mode+'"]').click();
  latitude=value.latitude;longitude=value.longitude;orbitLat=value.orbitLat;orbitLon=value.orbitLon;
  altitude=value.altitude;heading=value.heading;pitch=value.pitch;roll=value.roll;eyeHeight=value.eyeHeight;
  camera.fov=value.fov;camera.updateProjectionMatrix();orbitAxis=undefined;
  fly=false;live=false;toggle('fly',false);toggle('live',false);
  map=value.map;toggle('map',map);setTime(value.time);
  for(const id of layerIds)$(id).checked=value.layers[id];
  $('detail-terrain').checked=value.detail!==false;
  $('eye-height').value=eyeHeight;
  const filters=value.filters || {};
  restoredCountry=typeof filters.country==='string'?filters.country:'';
  $('mission-country').value=restoredCountry;
  $('mission-clps').checked=filters.clps===true;
  $('mission-search').value=typeof filters.query==='string'?filters.query:'';
  $('mission-filters').checked=filters.visible===true;
  $('mission-filter-controls').hidden=!$('mission-filters').checked;
  filterMissions();
  $('lat').value=latitude;$('lon').value=longitude;
  $('relief').onchange();$('ice').onchange();$('metal').onchange();$('grid').onchange();
  $('shadows').onchange();$('missions').onchange();$('mission-flags').onchange();
  const resource=['','titanium','iron','hydrogen'].includes(value.resource)?value.resource:'';
  // Restoring a view must preserve its camera, even when a polar overlay is enabled.
  $('resource').value=resource;
  restoreResource=true;
  $('resource').onchange();
  resetSurfaceHeight();
}
function populateSavedViews(){
  $('saved-views').replaceChildren(new Option('Saved viewpoints',''));
  savedViews.forEach((entry,index)=>$('saved-views').add(new Option(entry.name,index)));
}
try{
  const stored=JSON.parse(localStorage.getItem(viewStorage)||'[]');
  if(Array.isArray(stored))savedViews=stored.filter(entry=>entry && typeof entry.name==='string' && validateView(entry.view));
}catch{$('view-message').textContent='Saved viewpoints could not be read in this browser.';}
populateSavedViews();
function storeViews(){
  try{localStorage.setItem(viewStorage,JSON.stringify(savedViews));return true;}
  catch{$('view-message').textContent='Browser storage unavailable. Use Copy link to keep this view.';return false;}
}
$('save-view').onclick=()=>{
  const name=$('view-name').value.trim() || (mode==='surface'?'Surface':'Orbit')+' '+latitude.toFixed(2)+'°, '+longitude.toFixed(2)+'°';
  const entry={name,view:captureView()};
  const index=savedViews.findIndex(item=>item.name===name);
  if(index<0)savedViews.push(entry);else savedViews[index]=entry;
  if(storeViews()){$('view-message').textContent='Saved '+name;populateSavedViews();}
};
$('saved-views').onchange=()=>{
  const index=$('saved-views').value;
  if(index==='')return;
  applyView(savedViews[Number(index)].view);
  $('view-name').value=savedViews[Number(index)].name;
  $('view-message').textContent='Viewpoint restored.';
};
$('delete-view').onclick=()=>{
  const index=$('saved-views').value;
  if(index==='')return;
  savedViews.splice(Number(index),1);
  if(storeViews()){populateSavedViews();$('view-message').textContent='Viewpoint deleted.';}
};
$('share-view').onclick=async()=>{
  const url=new URL(location.href);
  url.hash='view='+encodeURIComponent(JSON.stringify(captureView()));
  try{
    await navigator.clipboard.writeText(url.href);
    $('view-message').textContent='Viewpoint link copied. It opens on a host serving the atlas.';
  }catch{
    const link=document.createElement('a');
    link.href=url.href;link.textContent='Open this viewpoint link';
    $('view-message').replaceChildren(link);
  }
};
function restoreHash(){
  if(!location.hash.startsWith('#view='))return;
  try{
    applyView(JSON.parse(decodeURIComponent(location.hash.slice(6))));
    $('view-message').textContent='Shared viewpoint restored.';
  }catch{$('view-message').textContent='This viewpoint link is invalid or unsupported.';}
}
window.addEventListener('hashchange',restoreHash);
restoreHash();

let lastFrame=performance.now();
function frame(now){
  requestAnimationFrame(frame);
  if(graphicsLost || now-lastFrame<1000/30)return;
  const dt=Math.min((now-lastFrame)/1000,0.1);
  lastFrame=now;
  if(live && Math.floor(time/1000)!==Math.floor(Date.now()/1000))setTime(Date.now());
  updateSky(time);
  ambient.intensity=map?2.0:0.025;
  sunlight.intensity=map?0.75:3;
  if(fly&&mode==='orbit'){
    const speed=Math.sqrt(4902.8/Math.pow(radius+altitude,3));
    const radial=point(orbitLat,orbitLon);
    orbitAxis ??= radial.clone().cross(vec(-Math.sin(orbitLon*rad),0,-Math.cos(orbitLon*rad)));
    radial.applyAxisAngle(orbitAxis,speed*dt);
    orbitLat=Math.asin(clamp(radial.y,-1,1))/rad;
    orbitLon=Math.atan2(-radial.z,radial.x)/rad;
  }
  if(now-lastTerrainUpdate>600){
    lastTerrainUpdate=now;
    localTerrain.update(mode==='orbit'?orbitLat:latitude,mode==='orbit'?orbitLon:longitude,
      altitude,mode==='surface',$('relief').checked,$('detail-terrain').checked)
      .catch(()=>{$('status').textContent='Local terrain unavailable; global terrain active';});
  }
  const lat=mode==='orbit'?orbitLat:latitude;
  const lon=mode==='orbit'?orbitLon:longitude;
  const up=point(lat,lon);
  const east=vec(-Math.sin(lon*rad),0,-Math.cos(lon*rad));
  const north=up.clone().cross(east);
  let bearing=-roll;
  if(mode==='surface'){
    camera.position.copy(up).multiplyScalar(surfaceHeight);
    const direction=north.clone().multiplyScalar(Math.cos(heading*rad)).addScaledVector(east,Math.sin(heading*rad));
    direction.multiplyScalar(Math.cos(pitch*rad)).addScaledVector(up,Math.sin(pitch*rad));
    camera.up.copy(up);
    camera.lookAt(camera.position.clone().add(direction));
    bearing=heading;
  }else{
    camera.position.copy(up).multiplyScalar(radius+altitude);
    camera.up.copy(north);
    camera.lookAt(0,0,0);
  }
  if(selectedPin.visible){
    const distance=camera.position.distanceTo(selectedPin.position);
    const scale=distance*Math.tan(camera.fov*rad/2)*0.009;
    selectedPin.scale.setScalar(scale);
  }
  if(sunlight.castShadow){
    const target=up.clone().multiplyScalar(radius);
    sunlight.target.position.copy(target);scene.add(sunlight.target);
    sunlight.position.copy(target).addScaledVector(sun.position.clone().normalize(),1500);
    const shadow=sunlight.shadow.camera;
    shadow.left=shadow.bottom=-150;shadow.right=shadow.top=150;shadow.near=1;shadow.far=3000;shadow.updateProjectionMatrix();
  }
  camera.rotateZ(roll*rad);
  camera.updateMatrixWorld();
  if(catalogSky){catalogSky.matrix.setPosition(camera.position);catalogSky.updateMatrixWorld(true);}
  $('needle').style.transform='rotate('+(-bearing)+'deg)';
  $('bearing').value=String((Math.round(bearing)%360+360)%360).padStart(3,'0')+'°';
  const sunAltitude=Math.asin(sun.position.clone().sub(camera.position).normalize().dot(up))/rad;
  $('position').textContent=lat.toFixed(2)+'° lat  /  '+lon.toFixed(2)+'° lon  ·  '+(mode==='orbit'?altitude.toFixed(0)+' km':'Sun '+sunAltitude.toFixed(1)+'°')+'  ·  '+camera.fov.toFixed(0)+'° FOV';
  const w=view.clientWidth,h=view.clientHeight;
  updateScale(w,h);
  layoutMarkers(w,h);
  const icePosition=iceNormal.clone().multiplyScalar(radius+0.2);
  const iceVisible=$('ice').checked && icePosition.clone().sub(camera.position).dot(iceNormal)<0;
  icePatch.visible=iceVisible;
  icePosition.project(camera);
  iceLabel.hidden=!iceVisible || Math.abs(icePosition.x)>1 || Math.abs(icePosition.y)>1 || Math.abs(icePosition.z)>1;
  if(!iceLabel.hidden){
    iceLabel.style.left=(icePosition.x+1)*w/2+'px';
    iceLabel.style.top=(1-icePosition.y)*h/2+'px';
  }
  renderer.render(scene,camera);
}
requestAnimationFrame(frame);
