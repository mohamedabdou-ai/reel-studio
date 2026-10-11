import test from 'node:test';
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';

const files=['core/accents.tsx','core/speed.tsx','core/speed-math.ts','creative-kit/kinetic-words.tsx','creative-kit/kinetic-words-logic.ts','creative-kit/emphasis.tsx','creative-kit/compare.tsx','creative-kit/ui-code.tsx','creative-kit/ui-keys.tsx'];
test('portable editorial primitives are available in the installed runtime',async()=>{
  for(const file of files)await access(new URL(`../engine/src/${file}`,import.meta.url)).catch(()=>assert.fail(`Missing reusable primitive: ${file}`));
});
test('speed timing refuses speech retiming and maps only whole frames',async()=>{
  await access(new URL('../engine/src/core/speed-math.ts',import.meta.url)).catch(()=>assert.fail('Measured media timing is missing'));
  const speed=await import('../engine/src/core/speed-math.ts');
  assert.deepEqual(speed.freezeMap(15,10,8),{phase:'hold',childFrame:10,holdElapsed:5});
  assert.ok(speed.validateSpeedPlan({src:'_prepared/example.mp4',fps:30,realFps:30,sourceStep:1,sourceFrames:120,trimBefore:0,segments:[{fromF:0,toF:30,rate:2}]}).some(message=>/speech|presenter/.test(message)));
  assert.equal(speed.sourceFrameAt(20,[{fromF:0,toF:30,rate:2}]),40);
});
