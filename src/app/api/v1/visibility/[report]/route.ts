import { agentApiContext, agentApiErrorResponse, AGENT_API_HEADERS } from "@/lib/agent-api";
import { AgentApiError } from "@/lib/agent-api-key-store";
import { savedVisibility, visibilityFilters } from "@/lib/visibility-service";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{report:string}>}){
  try{
    const {db,principal}=await agentApiContext(request);
    const {report}=await context.params;
    if(!["current","overview","citations","prompts","recommendations"].includes(report))throw new AgentApiError("Report not found.",404,"not_found");
    const result=await savedVisibility(db,principal.ownerId,visibilityFilters(new URL(request.url).searchParams));
    const {website,platform,surface,searchMode,dateRange,coverage,methodology}=result;
    const data=report==="overview"?result:{website,platform,surface,searchMode,dateRange,coverage,methodology,[report]:result[report as "current"|"citations"|"prompts"|"recommendations"]};
    return Response.json(data,{headers:AGENT_API_HEADERS});
  }catch(error){return agentApiErrorResponse(error);}
}
