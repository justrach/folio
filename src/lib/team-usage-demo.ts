/** Fictional manager credit ledger. No real memberships, wallet, charges or provider conversion. */
export type UsageCategory = "research" | "evaluation";
export type UsageEntry = { id:string; employeeId:string; title:string; category:UsageCategory; status:"confirmed"|"reserved"|"unknown"; credits:number|null; reserved:number; day:string };
export type DemoEmployee = {id:string;name:string;role:string;budget:number};
export const DEMO_EMPLOYEES:DemoEmployee[]=[
 {id:"avery",name:"Avery Chen",role:"Social media",budget:800},
 {id:"jordan",name:"Jordan Patel",role:"Content",budget:600},
 {id:"sam",name:"Sam Rivera",role:"PR & communications",budget:1000},
 {id:"maya",name:"Maya Brooks",role:"Demand generation",budget:800},
 {id:"nina",name:"Nina Okafor",role:"Lifecycle",budget:600},
 {id:"leo",name:"Leo Park",role:"Brand & creative",budget:400},
];
export function demoUsageEntries(month:"2026-11"|"2026-10"):UsageEntry[]{const amounts=[[248,48],[310,116],[690,220],[250,80],[96,16],[0,0]];const factor=month==="2026-11"?1:.65;return DEMO_EMPLOYEES.flatMap((employee,i)=>{
 const rows:UsageEntry[]=[];const [research,evaluation]=amounts[i].map(n=>Math.floor(n*factor));
 if(research)rows.push({id:`${month}-${employee.id}-research`,employeeId:employee.id,title:"Customer questions & cited-source research",category:"research",status:"confirmed",credits:research,reserved:0,day:`${month}-06`});
 if(evaluation)rows.push({id:`${month}-${employee.id}-evaluation`,employeeId:employee.id,title:"Agent evaluation of website evidence",category:"evaluation",status:"confirmed",credits:evaluation,reserved:0,day:`${month}-07`});
 if(month==="2026-11"&&i===1)rows.push({id:'jordan-reservation',employeeId:employee.id,title:'Launch-page research in progress',category:'research',status:'reserved',credits:null,reserved:40,day:`${month}-08`});
 if(month==="2026-11"&&i===3)rows.push({id:'maya-reservation',employeeId:employee.id,title:'Competitor source comparison in progress',category:'research',status:'reserved',credits:null,reserved:60,day:`${month}-08`});
 if(month==="2026-11"&&i===4)rows.push({id:'nina-unknown',employeeId:employee.id,title:'Provider task awaiting final usage',category:'research',status:'unknown',credits:null,reserved:25,day:`${month}-08`});
 return rows;
});}
export function employeeUsage(employee:DemoEmployee,entries:UsageEntry[]){const own=entries.filter(e=>e.employeeId===employee.id);const research=own.filter(e=>e.category==="research"&&e.status==="confirmed").reduce((n,e)=>n+(e.credits??0),0);const evaluation=own.filter(e=>e.category==="evaluation"&&e.status==="confirmed").reduce((n,e)=>n+(e.credits??0),0);const used=research+evaluation;const reserved=own.reduce((n,e)=>n+e.reserved,0);const unknown=own.filter(e=>e.status==="unknown").length;return {...employee,entries:own,research,evaluation,used,reserved,unknown,remaining:unknown?null:Math.max(0,employee.budget-used-reserved)};}
export function startDemoTask(entries:UsageEntry[],employee:DemoEmployee):UsageEntry[]{const row=employeeUsage(employee,entries);if(row.remaining===null||row.remaining<30||entries.some(e=>e.id==='walkthrough-task'))return entries;return [...entries,{id:'walkthrough-task',employeeId:employee.id,title:'Sample citation-gap research',category:'research',status:'reserved',credits:null,reserved:30,day:'2026-11-08'}];}
export function completeDemoTask(entries:UsageEntry[]):UsageEntry[]{return entries.map(e=>e.id==='walkthrough-task'&&e.status==='reserved'?{...e,status:'confirmed',credits:22,reserved:0}:e);}
