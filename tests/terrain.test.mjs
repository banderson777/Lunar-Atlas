import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

async function tile(x,y) {
  const buffer=gunzipSync(await readFile(new URL('../dist/terrain/'+x+'-'+y+'.bin.gz',import.meta.url)));
  assert.equal(buffer.length,162*162*2);
  return new Int16Array(buffer.buffer,buffer.byteOffset,162*162);
}
test('adjacent LOLA tiles share identical interpolation borders',async()=>{
  const [west,east,south]=await Promise.all([tile(20,7),tile(21,7),tile(20,8)]);
  for(let row=0;row<162;row++){
    assert.equal(west[row*162+160],east[row*162]);
    assert.equal(west[row*162+161],east[row*162+1]);
  }
  for(let col=0;col<162;col++){
    assert.equal(west[160*162+col],south[col]);
    assert.equal(west[161*162+col],south[162+col]);
  }
});
test('LOLA tile borders wrap across the lunar longitude seam',async()=>{
  const [west,east]=await Promise.all([tile(35,8),tile(0,8)]);
  for(let row=0;row<162;row++){
    assert.equal(west[row*162+160],east[row*162]);
    assert.equal(west[row*162+161],east[row*162+1]);
  }
});
