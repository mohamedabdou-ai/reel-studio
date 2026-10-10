import '../scripts/lib/project-tmp.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {editorRenderCommand} from '../scripts/lib/editor-director.mjs';

const manifest={version:1,id:'command-test',purpose:'test',style:'section-deck',
  source:{path:'Raw/example.mp4',sha256:'a'.repeat(64),fps:30,width:1080,height:1920,totalFrames:360},
  segments:[{fromFrame:0,toFrame:360}],captions:{status:'reviewed',reviewer:'Creator',words:[]},
  scenes:[],sounds:[],camera:[],presenter:false};
const prepared={propsFile:'Projects/command-test/prepared/props.json',sfxFile:'Projects/command-test/prepared/sounds.wav'};

test('normal editor exports forward resumable-render controls and reviewed black intervals',()=>{
  const command=editorRenderCommand(manifest,prepared,{chunkFrames:60,chunkJobs:2,intentionalBlack:'0-3,120-125'});
  for(const [flag,value]of [['--chunk-frames','60'],['--chunk-jobs','2'],['--intentional-black','0-3,120-125']]){
    assert.equal(command.args[command.args.indexOf(flag)+1],value);
  }
  assert.equal(command.args.includes('--preview'),true);
  assert.equal(command.output,'Projects/command-test/renders/edit-preview.mp4');
});

test('invalid chunk controls and unreviewable frame intervals fail before preparation',()=>{
  for(const options of [{chunkFrames:0},{chunkFrames:1.5},{chunkFrames:NaN},{chunkJobs:0},{chunkJobs:3},{chunkJobs:1.5},
    {intentionalBlack:'3-2'},{intentionalBlack:'0-360'},{intentionalBlack:'unknown'},{intentionalBlack:'0-1,,'}]){
    assert.throws(()=>editorRenderCommand(manifest,prepared,options),JSON.stringify(options));
  }
});
