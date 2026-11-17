import * as T from './three.mjs';

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
function updateTerrain() {
  for(let i=0;i<positions.count;i++){
    const r=radius+($('relief').checked?heights[i]:0);
    const j=i*3;
    positions.setXYZ(i,units[j]*r,units[j+1]*r,units[j+2]*r);
  }
  positions.needsUpdate=true;
  shape.computeVertexNormals();
  shape.computeBoundingSphere();
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
function openMissionMedia(mission){
  $('mission-media-title').textContent=mission.name+' — Pictures and videos';
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
  return (!$('mission-country').value || mission.country===$('mission-country').value) &&
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
const earth = new T.Mesh(new T.SphereGeometry(6371,32,24),new T.MeshLambertMaterial({color:0x458bd5}));
const sun = new T.Mesh(new T.SphereGeometry(696340,32,24),new T.MeshBasicMaterial({color:0xffecc1}));
scene.add(earth,sun);
let time=Date.now(),live=false,map=true,fly=false,skyTime;
let mode='orbit',latitude=0.674,longitude=23.473,orbitLat=13,orbitLon=14;
let orbitAxis;
let altitude=3500,heading=90,pitch=1,roll=0,surfaceHeight=radius+0.0017;
const raycaster = new T.Raycaster();
function resetSurfaceHeight(){
  if(mode!=='surface')return;
  const normal=point(latitude,longitude);
  globe.updateMatrixWorld(true);
  raycaster.set(normal.clone().multiplyScalar(radius+30),normal.clone().negate());
  const hit=raycaster.intersectObject(globe)[0];
  surfaceHeight=(hit?hit.point.length():radius)+0.0017;
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
  time=epoch;
  $('clock').value=new Date(epoch).toISOString().slice(0,16);
}
function toggle(id,on){$(id).setAttribute('aria-pressed',String(on));}
function selectLocation(lat,lon){
  selectedPin.visible=false;
  latitude=lat;
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
  const hit=pickRay.intersectObject(globe)[0];
  if(!hit)return;
  const normal=hit.point.clone().normalize();
  const lat=Math.asin(clamp(normal.y,-1,1))/rad;
  const lon=wrap(Math.atan2(-normal.z,normal.x)/rad);
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
  camera.rotateZ(roll*rad);
  camera.updateMatrixWorld();
  $('needle').style.transform='rotate('+(-bearing)+'deg)';
  $('bearing').value=String((Math.round(bearing)%360+360)%360).padStart(3,'0')+'°';
  const sunAltitude=Math.asin(sun.position.clone().sub(camera.position).normalize().dot(up))/rad;
  $('position').textContent=lat.toFixed(2)+'° lat  /  '+lon.toFixed(2)+'° lon  ·  '+(mode==='orbit'?altitude.toFixed(0)+' km':'Sun '+sunAltitude.toFixed(1)+'°')+'  ·  '+camera.fov.toFixed(0)+'° FOV';
  const w=view.clientWidth,h=view.clientHeight;
  for(const {label,lat:markLat,lon:markLon,normal,mission} of [...markers,...missionMarkers]){
    const height=$('relief').checked && terrainReady?elevation(markLat,markLon):0;
    const p=normal.clone().multiplyScalar(radius+height+0.05);
    const visible=p.clone().sub(camera.position).dot(normal)<0;
    p.project(camera);
    label.hidden=!(mission?$('missions').checked && matchesMission(mission):$('labels').checked)||!visible||Math.abs(p.x)>1||Math.abs(p.y)>1||p.z>1||p.z< -1;
    if(!label.hidden){label.style.left=(p.x+1)*w/2+'px';label.style.top=(1-p.y)*h/2+'px';}
  }
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
