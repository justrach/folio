import { readJsonBody } from "@/lib/api-request";
import { evaluationRequestContext,evaluationErrorResponse,PRIVATE_EVAL_HEADERS } from "@/lib/eval-api";
import { getEvaluationRun,EvalStoreError } from "@/lib/eval-store";
import { getSemanticReview,semanticReviewAccess,startSemanticReview } from "@/lib/typesafe-review-store";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context) {
 try {
  const {db,ownerId,env}=await evaluationRequestContext(request);const {id}=await context.params;
  if(!await getEvaluationRun(db,ownerId,id)) throw new EvalStoreError("Evaluation not found.",404);
  return Response.json({review:await getSemanticReview(db,ownerId,id),available:semanticReviewAccess(env,ownerId)}, {headers:PRIVATE_EVAL_HEADERS});
 }catch(error){return evaluationErrorResponse(error);}
}
export async function POST(request:Request,context:Context) {
 try {
  const body=await readJsonBody(request);
  if(body.confirmPaidReview!==true) throw new EvalStoreError("Confirm this paid semantic review.",400);
  const {db,ownerId,env}=await evaluationRequestContext(request);const {id}=await context.params;
  return Response.json({review:await startSemanticReview(db,ownerId,id,body.revision,env)}, {headers:PRIVATE_EVAL_HEADERS});
 }catch(error){return evaluationErrorResponse(error);}
}
