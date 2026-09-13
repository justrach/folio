import {test,expect} from "@playwright/test";
const user={id:"fixture-owner",name:"Fixture",email:"owner@example.test",emailVerified:true};
for(const state of ["signed-out","expired","unavailable","signed-in"] as const){
 test(`API key form requires confirmed access: ${state}`,async({page})=>{
  let writes=0;
  await page.route("**/api/**",async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   if(!path.startsWith("/api/"))return route.continue();
   if(request.method()!=="GET"){writes++;return route.fulfill({status:403,json:{error:{message:"Fixture prevents writes"}}});}
   if(path==="/api/auth/get-session")return route.fulfill({json:state==="signed-out"?null:{user,session:{id:"session-fixture",userId:user.id,token:"fixture",expiresAt:"2099-01-01T00:00:00Z"}}});
   if(path==="/api/agent-keys")return route.fulfill(state==="expired"?{status:401,json:{error:{message:"Unauthorized"}}}:state==="unavailable"?{status:503,json:{error:{message:"signal is aborted without reason"}}}:{json:{keys:[]}});
   return route.fulfill({status:404,json:{}});
  });
  await page.goto("/docs/api#api-keys");
  if(state==="signed-in"){
   await expect(page.getByText("owner@example.test",{exact:true})).toBeVisible();
   await expect(page.getByLabel("Key name",{exact:true})).toBeVisible();
   await expect(page.getByRole("checkbox")).not.toBeChecked();
  }else{
   await expect(page.getByLabel("Key name",{exact:true})).toHaveCount(0);
   if(state==="unavailable")await expect(page.locator("#api-keys").getByRole("alert")).toContainText("could not be loaded");
   else await expect(page.getByRole("link",{name:"Sign in to manage keys",exact:true})).toBeVisible();
  }
  await expect(page.getByText("signal is aborted without reason",{exact:true})).toHaveCount(0);
  expect(writes).toBe(0);
 });
}
