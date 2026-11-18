import * as T from './three.mjs';
const rad = Math.PI / 180;
const R = 1737.4;
const wrap = x => ((x + 180) % 360 + 360) % 360 - 180;
const point = (lat,lon) => new T.Vector3(Math.cos(lat*rad)*Math.cos(lon*rad),
  Math.sin(lat*rad),-Math.cos(lat*rad)*Math.sin(lon*rad));

export class LocalTerrain {
  constructor(scene, globe, fallbackElevation, onChange, onStatus) {
    this.scene = scene;
    this.globe = globe;
    this.fallbackElevation = fallbackElevation;
    this.onChange = onChange;
    this.onStatus = onStatus;
    this.tiles = new Map();
    this.images = new Map();
    this.generation = 0;
    this.key = '';
    this.mesh = new T.Mesh(new T.BufferGeometry(), new T.MeshLambertMaterial({side:T.DoubleSide}));
    this.mesh.visible = false;
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this.cut = { center: {value: new T.Vector3()}, cosine: {value: 2} };
    globe.material.onBeforeCompile = shader => {
      shader.uniforms.localCenter = this.cut.center;
      shader.uniforms.localCosine = this.cut.cosine;
      shader.vertexShader = 'varying vec3 terrainPosition;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>', '#include <begin_vertex>\nterrainPosition = position;');
      shader.fragmentShader = 'varying vec3 terrainPosition;\nuniform vec3 localCenter;\nuniform float localCosine;\n' +
        shader.fragmentShader.replace('#include <clipping_planes_fragment>',
          '#include <clipping_planes_fragment>\nif(dot(normalize(terrainPosition),localCenter)>localCosine) discard;');
    };
  }

  sample(lat, lon) {
    const x = (wrap(lon)+180)*16-0.5;
    const y = T.MathUtils.clamp((90-lat)*16-0.5,0,2879);
    const tx = Math.min(35,Math.floor((x+0.5)/160));
    const ty = Math.min(17,Math.floor((y+0.5)/160));
    const data = this.tiles.get(tx+'-'+ty);
    if (!data || data instanceof Promise) return this.fallbackElevation(lat,lon);
    const localX = x-tx*160+1, localY = y-ty*160+1;
    const col = Math.floor(localX), row = Math.floor(localY);
    const s = (dx,dy) => data[(row+dy)*162+col+dx]/2000;
    return T.MathUtils.lerp(T.MathUtils.lerp(s(0,0),s(1,0),localX-col),
      T.MathUtils.lerp(s(0,1),s(1,1),localX-col),localY-row);
  }

  async tile(key) {
    if (this.tiles.has(key)) return this.tiles.get(key);
    const request = (async () => {
      const response = await fetch('./terrain/'+key+'.bin.gz');
      if (!response.ok) throw Error('Elevation tile unavailable');
      const decompressed = response.body.pipeThrough(new DecompressionStream('gzip'));
      const buffer = await new Response(decompressed).arrayBuffer();
      if (buffer.byteLength !== 162*162*2) throw Error('Invalid elevation tile');
      const data = new Int16Array(buffer);
      this.tiles.set(key,data);
      return data;
    })();
    this.tiles.set(key,request);
    try { return await request; }
    catch (error) { this.tiles.delete(key); throw error; }
  }

  async image(z, row, col) {
    const key = z+'/'+row+'/'+col;
    if (!this.images.has(key)) {
      const promise = new Promise((resolve,reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/'+key+'.jpg';
      });
      this.images.set(key,promise);
    }
    try { return await this.images.get(key); }
    catch (error) { this.images.delete(key); throw error; }
  }

  async update(lat, lon, altitude, surface, relief, enabled=true) {
    if (!enabled || (!surface && altitude > 900)) {
      if (this.mesh.visible) {
        this.mesh.visible = false;
        this.cut.cosine.value = 2;
        this.onChange();
      }
      this.key = '';
      this.generation++;
      return;
    }
    const extent = surface ? 4 : T.MathUtils.clamp(altitude/R*180/Math.PI*1.1,1,12);
    const key = [lat.toFixed(2),lon.toFixed(2),extent.toFixed(1),relief].join('/');
    if (key === this.key) return;
    this.key = key;
    const generation = ++this.generation;
    const center = point(lat,lon);
    const east = new T.Vector3(-Math.sin(lon*rad),0,-Math.cos(lon*rad));
    const north = center.clone().cross(east);
    const directions = [center.clone()];
    const latlons = [{lat,lon}];
    const rings = 64, segments = 192;
    for (let r=1;r<=rings;r++) {
      const angle=extent*rad*r/rings;
      for (let j=0;j<segments;j++) {
        const azimuth=2*Math.PI*j/segments;
        const p = center.clone().multiplyScalar(Math.cos(angle))
          .addScaledVector(east,Math.sin(angle)*Math.cos(azimuth))
          .addScaledVector(north,Math.sin(angle)*Math.sin(azimuth)).normalize();
        directions.push(p);
        latlons.push({lat:Math.asin(p.y)/rad,lon:wrap(Math.atan2(-p.z,p.x)/rad)});
      }
    }
    const keys = [...new Set(latlons.map(p =>
      Math.min(35,Math.floor((wrap(p.lon)+180)/10))+'-'+Math.min(17,Math.floor((90-p.lat)/10))))];
    this.onStatus('Loading local LOLA terrain…');
    let failed = false;
    // Four concurrent requests bound network use while walking or rotating.
    for(let i=0;i<keys.length;i+=4) {
      const results=await Promise.allSettled(keys.slice(i,i+4).map(key=>this.tile(key)));
      failed ||= results.some(result=>result.status==='rejected');
      if(generation!==this.generation)return;
    }
    if(this.tiles.size>120) {
      for(const key of this.tiles.keys())if(!keys.includes(key) && !(this.tiles.get(key) instanceof Promise)){
        this.tiles.delete(key);
        if(this.tiles.size<=120)break;
      }
    }
    const vertices=[],uv=[];
    const fallbackMap=this.globe.material.map;
    for(let i=0;i<directions.length;i++) {
      const p=latlons[i];
      vertices.push(...directions[i].clone().multiplyScalar(R+(relief?this.sample(p.lat,p.lon):0)).toArray());
      uv.push((p.lon+180)/360,(p.lat+90)/180);
    }
    const indices=[];
    for(let j=0;j<segments;j++)indices.push(0,1+j,1+(j+1)%segments);
    for(let r=1;r<rings;r++)for(let j=0;j<segments;j++){
      const a=1+(r-1)*segments+j,b=1+(r-1)*segments+(j+1)%segments,c=1+r*segments+j,d=1+r*segments+(j+1)%segments;
      indices.push(a,c,b,b,c,d);
    }
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
    geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    this.mesh.geometry.dispose();
    this.mesh.geometry=geometry;
    this.disposeTexture();
    this.mesh.material.map=fallbackMap;
    this.mesh.material.needsUpdate=true;
    this.mesh.visible=true;
    this.cut.center.value.copy(center);
    this.cut.cosine.value=Math.cos(extent*rad*0.995);
    this.onChange();
    this.onStatus(failed?'Local terrain using coarse fallback in missing tiles':'LOLA local terrain · 16 samples/degree (≈1.9 km at equator)');
    this.loadImagery(latlons,generation,failed);
  }

  disposeTexture() {
    if(this.ownTexture){this.ownTexture.dispose();this.ownTexture=null;}
  }

  async loadImagery(latlons,generation,terrainFailed) {
    const centerLon=latlons[0].lon;
    const longitudes=latlons.map(p=>centerLon+wrap(p.lon-centerLon));
    const west=Math.min(...longitudes),east=Math.max(...longitudes);
    const south=Math.min(...latlons.map(p=>p.lat)),north=Math.max(...latlons.map(p=>p.lat));
    const span=Math.max(east-west,north-south,0.5);
    const z=T.MathUtils.clamp(Math.floor(Math.log2(180*3/span)),0,8);
    const size=180/2**z;
    const x0=Math.floor((west+180)/size),x1=Math.floor((east+180)/size);
    const y0=Math.max(0,Math.floor((90-north)/size)),y1=Math.min(2**z-1,Math.floor((90-south)/size));
    const canvas=document.createElement('canvas');
    canvas.width=(x1-x0+1)*256;canvas.height=(y1-y0+1)*256;
    const context=canvas.getContext('2d');
    try {
      const tiles=[];
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)tiles.push({x,y});
      for(let i=0;i<tiles.length;i+=4){
        await Promise.all(tiles.slice(i,i+4).map(async({x,y})=>{
          const columns=2**(z+1);
          const image=await this.image(z,y,((x%columns)+columns)%columns);
          if(generation===this.generation)context.drawImage(image,(x-x0)*256,(y-y0)*256);
        }));
        if(generation!==this.generation)return;
      }
      const uvs=this.mesh.geometry.attributes.uv;
      for(let i=0;i<latlons.length;i++){
        const lon=centerLon+wrap(latlons[i].lon-centerLon);
        uvs.setXY(i,((lon+180)/size-x0)/(x1-x0+1),
          1-((90-latlons[i].lat)/size-y0)/(y1-y0+1));
      }
      uvs.needsUpdate=true;
      const texture=new T.CanvasTexture(canvas);
      texture.colorSpace=T.SRGBColorSpace;
      texture.anisotropy=2;
      this.disposeTexture();
      this.ownTexture=texture;
      this.mesh.material.map=texture;
      this.mesh.material.needsUpdate=true;
      this.onStatus('LROC image tiles · ≈'+Math.round(R*rad*size/256*1000)+' m/pixel at equator'+
        (terrainFailed?' · coarse terrain fallback':' · LOLA terrain ≈1.9 km'));
      while(this.images.size>48)this.images.delete(this.images.keys().next().value);
    }catch{
      if(generation===this.generation)this.onStatus('LOLA local terrain · LROC tiles unavailable; bundled imagery active');
    }
  }

  hits(raycaster) {
    const candidates=raycaster.intersectObjects(this.mesh.visible?[this.globe,this.mesh]:[this.globe]);
    return candidates.filter(hit=>hit.object!==this.globe || !this.mesh.visible ||
      hit.point.clone().normalize().dot(this.cut.center.value)<=this.cut.cosine.value);
  }
}
