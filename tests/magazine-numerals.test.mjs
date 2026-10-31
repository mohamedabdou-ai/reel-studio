import test from 'node:test';
import assert from 'node:assert/strict';
import {bundleEngine} from './helpers/engine-bundle.mjs';

const api=await bundleEngine(`
  import React from 'react';
  import {renderToStaticMarkup} from 'react-dom/server';
  import {SmallNumeral} from './engine/src/styles/magazine-interview/system/numerals';
  import {DigitsProvider} from './engine/src/creative-kit/digits';
  export {smallNumeralStyle} from './engine/src/styles/magazine-interview/system/numerals';
  export const render=(text,digits,width)=>renderToStaticMarkup(<DigitsProvider digits={digits}><SmallNumeral text={text} width={width}/></DigitsProvider>);
`,{ssr:true});
test('mapped glyphs choose Alexandria 600 or MONO 500 with tabular numerals',()=>{
  for(const value of ['١٢','۱۲']) {
    const style=api.smallNumeralStyle(value);
    assert.equal(style.fontFamily,'Alexandria');assert.equal(style.fontWeight,600);
    assert.equal(style.fontVariantNumeric,'tabular-nums');assert.equal(style.fontSize,40);
  }
  const latin=api.smallNumeralStyle('12');assert.match(latin.fontFamily,/IBM Plex Mono/);assert.equal(latin.fontWeight,500);
  assert.equal(api.smallNumeralStyle('12',12).fontSize,28);
});
test('SmallNumeral maps digits before choosing the face and fits down to 28',()=>{
  const indic=api.render('12','arabic-indic');
  assert.match(indic,/data-small-numeral="١٢"/);assert.match(indic,/data-numeral-face="Alexandria"/);assert.match(indic,/data-numeral-weight="600"/);
  const latin=api.render('١٢','latin');
  assert.match(latin,/data-small-numeral="12"/);assert.match(latin,/data-numeral-face="[^\"]*IBM Plex Mono/);assert.match(latin,/data-numeral-weight="500"/);
  assert.match(api.render('12','latin',32),/data-numeral-size="28"/);
});
