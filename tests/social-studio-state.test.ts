import test from 'node:test';
import assert from 'node:assert/strict';
import {initialSocialStudio,socialStudioReducer as transition} from '../src/lib/social-studio-state';

test('studio has one visible mode and selecting an agent draft enters the editor',()=>{
 const start=initialSocialStudio('Original');
 const thinking=transition(start,{type:'OPEN_BRAINSTORM'});
 const editing=transition(thinking,{type:'OPEN_DRAFT',caption:'Reviewed idea'});
 assert.equal(thinking.mode,'brainstorm');assert.equal(editing.mode,'draft');
 assert.equal(editing.draft.caption,'Reviewed idea');
 assert.deepEqual(start,initialSocialStudio('Original'));
 assert.equal(transition(editing,{type:'CLOSE'}).mode,'closed');
});
test('saved status is invalidated by changing copy or destination, but not selecting the same channel',()=>{
 const draft=transition(initialSocialStudio('Text'),{type:'OPEN_DRAFT',caption:'Text'});
 const saved=transition(draft,{type:'SAVE_DRAFT'});
 assert.equal(saved.draft.status,'saved');
 assert.equal(transition(saved,{type:'CHANGE_CHANNEL',channel:'LinkedIn'}),saved);
 assert.equal(transition(saved,{type:'CHANGE_CHANNEL',channel:'X'}).draft.status,'editing');
 assert.equal(transition(saved,{type:'EDIT_CAPTION',caption:'Updated'}).draft.status,'editing');
});
test('closed or empty drafts cannot claim a successful save',()=>{
 const closed=initialSocialStudio('Text');assert.equal(transition(closed,{type:'SAVE_DRAFT'}),closed);
 const empty=transition(closed,{type:'OPEN_DRAFT',caption:'  '});assert.equal(transition(empty,{type:'SAVE_DRAFT'}),empty);
});
