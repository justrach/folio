/** Public demo UI only. Transitions never fetch, publish, spend, or emit telemetry. */
export type StudioMode = 'closed' | 'draft' | 'brainstorm';
export type DraftChannel = 'LinkedIn' | 'X';
export type SocialStudioState = {
  mode: StudioMode;
  draft: {caption: string; channel: DraftChannel; status: 'editing' | 'saved'};
};
export type SocialStudioEvent =
  | {type:'OPEN_DRAFT';caption:string}
  | {type:'OPEN_BRAINSTORM'}
  | {type:'CLOSE'}
  | {type:'EDIT_CAPTION';caption:string}
  | {type:'CHANGE_CHANNEL';channel:DraftChannel}
  | {type:'SAVE_DRAFT'};
export function initialSocialStudio(caption:string):SocialStudioState {
  return {mode:'closed',draft:{caption,channel:'LinkedIn',status:'editing'}};
}
export function socialStudioReducer(state:SocialStudioState,event:SocialStudioEvent):SocialStudioState {
  switch(event.type){
    case 'OPEN_DRAFT':return {mode:'draft',draft:{...state.draft,caption:event.caption,status:'editing'}};
    case 'OPEN_BRAINSTORM':return {...state,mode:'brainstorm'};
    case 'CLOSE':return {...state,mode:'closed'};
    case 'EDIT_CAPTION':return {...state,draft:{...state.draft,caption:event.caption,status:'editing'}};
    case 'CHANGE_CHANNEL':return event.channel===state.draft.channel?state:{...state,draft:{...state.draft,channel:event.channel,status:'editing'}};
    case 'SAVE_DRAFT':return state.mode==='closed'||!state.draft.caption.trim()?state:{...state,draft:{...state.draft,status:'saved'}};
  }
}
