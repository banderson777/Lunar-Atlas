import test from 'node:test';
import assert from 'node:assert/strict';
import { destination, measure, validateView, MOON_RADIUS } from '../dist/navigation.mjs';

test('great-circle distances and initial bearings cross the longitude seam',()=>{
  const result=measure({lat:0,lon:179},{lat:0,lon:-179});
  assert.ok(Math.abs(result.distance-MOON_RADIUS*Math.PI/90)<1e-9);
  assert.equal(result.bearing,90);
  const endpoint=destination(0,179,90,result.distance);
  assert.ok(Math.abs(endpoint.lat)<1e-9);
  assert.ok(Math.abs(endpoint.lon+179)<1e-9);
});
test('walking across a pole produces finite coordinates and preserves distance',()=>{
  const next=destination(89.99,30,0,10);
  assert.ok(Number.isFinite(next.lat) && next.lat<=90);
  assert.ok(Math.abs(measure({lat:89.99,lon:30},next).distance-10)<1e-7);
});
test('a coincident point has zero distance and no defined initial bearing',()=>{
  assert.deepEqual(measure({lat:-45,lon:100},{lat:-45,lon:100}),{distance:0,bearing:null});
});
const view={
  version:1,mode:'surface',latitude:1,longitude:2,orbitLat:1,orbitLon:2,
  altitude:100,heading:0,pitch:0,roll:0,fov:45,eyeHeight:1.7,time:Date.UTC(2026,10,18),
  map:true,layers:Object.fromEntries(['relief','labels','ice','metal','missions','mission-flags','grid','shadows'].map(id=>[id,false]))
};
test('shared viewpoints reject invalid positions and incomplete layer state',()=>{
  assert.equal(validateView(view),true);
  for(const latitude of [91,NaN,Infinity,'1'])assert.equal(validateView({...view,latitude}),false);
  assert.equal(validateView({...view,eyeHeight:0}),false);
  assert.equal(validateView({...view,layers:{}}),false);
});
