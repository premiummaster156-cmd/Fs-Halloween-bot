const MAX_MESSAGE_LENGTH=1800;
const MAX_BULK_RECIPIENTS=5000;
const wait=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
function validateMessage(value){
 const message=String(value||"").trim();
 if(!message)throw new Error("DM message cannot be empty.");
 if(message.length>MAX_MESSAGE_LENGTH)throw new Error("DM message must be 1,800 characters or fewer.");
 return message;
}
class AdminMessagingService{
 constructor(){ }
 async sendToMember(guild,targetId,content){
  const message=validateMessage(content);
  const member=await guild.members.fetch(targetId).catch(()=>null);
  if(!member||member.user.bot)throw new Error("Choose a real server member.");
  await member.send({content:message,allowedMentions:{parse:[]}});
  return {sent:1,failed:0,skipped:0};
 }
 async sendToAll(guild,content){
  const message=validateMessage(content);
  const members=await guild.members.fetch();
  const recipients=Array.from(members.values()).filter(member=>!member.user.bot);
  if(recipients.length>MAX_BULK_RECIPIENTS)throw new Error("This server has more than 5,000 human members. Use member-targeted DMs or split the announcement.");
  let sent=0,failed=0;
  for(let offset=0;offset<recipients.length;offset+=4){
   const batch=recipients.slice(offset,offset+4);
   const results=await Promise.allSettled(batch.map(member=>member.send({content:message,allowedMentions:{parse:[]}})));
   for(const result of results)result.status==="fulfilled"?sent++:failed++;
   if(offset+4<recipients.length)await wait(1000);
  }
  return {sent,failed,skipped:members.size-recipients.length};
 }
}
module.exports={AdminMessagingService,validateMessage,MAX_MESSAGE_LENGTH,MAX_BULK_RECIPIENTS};
