const settings = require("../config/settings");
const MAX_MESSAGE_LENGTH=1800;
const MAX_BULK_RECIPIENTS=1500;
const wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
function validateMessage(value){
 const message=String(value||"").trim();
 if(!message)throw new Error("DM message cannot be empty.");
 if(message.length>MAX_MESSAGE_LENGTH)throw new Error("DM message must be 1,800 characters or fewer.");
 return message;
}
class AdminMessagingService{
 async sendToMember(guild,targetId,content){
  const message=validateMessage(content);
  if (Array.isArray(settings.kingIds) && settings.kingIds.includes(String(targetId))) {
   throw new Error("This account has Fukishōkai King protection and cannot be targeted by administrator DM tools.");
  }
  const member=await guild.members.fetch(targetId).catch(()=>null);
  if(!member||member.user.bot)throw new Error("Choose a real server member.");
  await member.send({content:message,allowedMentions:{parse:[]}});
  return {sent:1,failed:0,skipped:0};
 }
 async sendToAll(guild,content,knownRecipientIds=[]){
  const message=validateMessage(content);
  const cachedIds=Array.from(guild.members?.cache?.keys?.()||[]);
  const allIds=Array.from(new Set([...(knownRecipientIds||[]),...cachedIds].map(String))).filter(Boolean);
  if(allIds.length>MAX_BULK_RECIPIENTS)throw new Error("This campaign contains more than 1,500 tracked members. Split it into smaller campaigns.");
  const protectedIds = new Set(Array.isArray(settings.kingIds) ? settings.kingIds.map(String) : []);
  const ids = allIds.filter((id) => !protectedIds.has(id));
  let sent=0,failed=0,skipped=allIds.length-ids.length;
  for(let offset=0;offset<ids.length;offset+=4){
   const batch=ids.slice(offset,offset+4);
   const results=await Promise.allSettled(batch.map(async id=>{
    const member=guild.members.cache?.get(id)||await guild.members.fetch(id);
    if(!member||member.user.bot)return "skipped";
    await member.send({content:message,allowedMentions:{parse:[]}});
    return "sent";
   }));
   for(const result of results){
    if(result.status==="fulfilled"){if(result.value==="sent")sent++;else skipped++;}
    else if(result.reason?.code===10007||result.reason?.code===10013)skipped++;
    else failed++;
   }
   if(offset+4<ids.length)await wait(1000);
  }
  return {sent,failed,skipped,attempted:ids.length};
 }
}
module.exports={AdminMessagingService,validateMessage,MAX_MESSAGE_LENGTH,MAX_BULK_RECIPIENTS};
