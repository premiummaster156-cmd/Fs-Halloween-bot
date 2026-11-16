"use strict";
const {SlashCommandBuilder,EmbedBuilder,PermissionFlagsBits:P,MessageFlags,ChannelType}=require("discord.js");
const names="coopft-setup coopft-roles-sync coopft-channels-sync coopft-channel-decorate coopft-panel coopft-ticket-config announce poll event-create event-list event-cancel slowmode lock unlock purge timeout untimeout kick ban unban warn warnings clear-warnings case note notes member-note-remove role-add role-remove nickname reset-nickname channel-topic channel-rename ticket-cooldown ticket-claim ticket-close ticket-add ticket-remove ticket-rename ticket-priority ticket-info ticket-list suggestion suggestion-review".split(" ");
const desc="Create missing CoopFT resources without overwriting custom settings|Explicitly apply configured CoopFT role names, colors, permissions and order|Explicitly apply configured CoopFT channel names, categories and permissions|Apply decorative names to default CoopFT channels only|Publish or move a CoopFT panel|Configure ticket category and transcript archive|Publish announcement|Create poll|Schedule event|List events|Cancel event|Set slowmode|Lock channel|Unlock channel|Purge messages|Timeout member|Remove timeout|Kick member|Ban member|Unban user|Issue warning|View warnings|Clear warnings|Moderation case|Add staff note|View staff notes|Remove staff note|Assign role|Remove role|Set nickname|Reset nickname|Edit channel topic|Rename channel|Apply a manual seven-day cooldown to one request type|Claim ticket|Close ticket|Add ticket member|Remove ticket member|Rename ticket|Set ticket priority|Ticket details|List tickets|Submit suggestion|Review suggestion".split("|");
const staff=(i,s)=>{if(!s.coopft.isStaff(i.member))throw Error("CoopFT staff only.");};
const ownerConfig=(i,s)=>{if(!s.coopft.canManageApplications(i.member,i.guild))throw Error("Only the server owner or Owner Rank can configure CoopFT.");};
const lead=(i,s)=>{if(!s.coopft.canManageStaff(i.member,i.guild))throw Error("CoopFT leadership only.");};
const say=(i,c,e=[])=>i.reply({content:c,embeds:e,flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
async function run(n,i,s){
const g=i.guild,id=i.guildId,u=i.user,c=i.channel,reason=i.options.getString("reason")||"CoopFT staff action";
const getMember=async()=>{const x=i.options.getUser("member");if(!x)throw Error("Select a member.");const m=await g.members.fetch(x.id).catch(()=>null);if(!m)throw Error("Member not found.");return m;};
const getTicket=async()=>{const r=await s.pool.query("SELECT * FROM coopft_tickets WHERE guild_id=$1 AND channel_id=$2 AND status='open'",[id,c.id]);if(!r.rows[0])throw Error("Use this inside an open ticket.");return r.rows[0];};
if(n==="coopft-setup"||n==="coopft-roles-sync"||n==="coopft-channels-sync"){
 ownerConfig(i,s);
 await i.deferReply({flags:MessageFlags.Ephemeral});
 const options={manual:true,actorId:u.id};
 if(n==="coopft-roles-sync")options.syncRoles=true;
 if(n==="coopft-channels-sync")options.syncChannels=true;
 const result=await s.coopft.bootstrap(g,options);
 const label=n==="coopft-roles-sync"?"Configured role properties and order applied.":n==="coopft-channels-sync"?"Configured channel names, categories and permissions applied.":"Missing CoopFT resources created; existing role and channel customizations preserved.";
 return i.editReply(label+" Created "+result.createdRoles+" roles and "+result.createdChannels+" channels. Existing settings were not reset unless you ran an explicit sync command.");
}
if(n==="coopft-channel-decorate"){
 ownerConfig(i,s);
 const result=await s.coopft.decorateManagedChannelNames(g);
 return say(i,"Applied decorations to "+result.renamed.length+" default channel/category names. Already styled: "+result.alreadyDecorated.length+". Preserved custom names: "+result.preservedCustomNames.length+". Missing resources: "+result.missing.length+". No permissions or category assignments were changed.");
}
if(n==="coopft-panel"){
 ownerConfig(i,s);
 const panel=i.options.getString("panel");
 const target=i.options.getChannel("channel")||null;
 const result=await s.coopft.configurePanel(g,panel,target);
 return say(i,"Published **"+result.panel+"** panel in <#"+result.channelId+">.");
}
if(n==="coopft-ticket-config"){
 ownerConfig(i,s);
 const result=await s.coopft.configureTicketing(g,{
  category:i.options.getChannel("category"),
  transcriptChannel:i.options.getChannel("transcript")
 });
 return say(i,"Ticket routing saved. Category: "+(result.categoryId?"<#"+result.categoryId+">":"not configured")+". Transcript archive: "+(result.transcriptChannelId?"<#"+result.transcriptChannelId+">":"not configured")+".");
}
if(n==="ticket-cooldown"){
 staff(i,s);
 const target=await getMember();
 const ticketType=i.options.getString("ticket_type");
 const allowedTypes=new Set(["custom_bot_request","partnership","member_report","staff_report","bot_exploit"]);
 if(!allowedTypes.has(ticketType))throw Error("That request type cannot receive a manual cooldown. Ordinary support requests are never cooldown-restricted.");
 const why=i.options.getString("reason");
 if(!why)throw Error("Provide a reason so the cooldown is documented.");
 const saved=await s.pool.query(
  "INSERT INTO coopft_ticket_cooldowns(guild_id,member_id,ticket_type,expires_at,set_by,reason) VALUES($1,$2,$3,NOW()+INTERVAL '7 days',$4,$5) ON CONFLICT(guild_id,member_id,ticket_type) DO UPDATE SET expires_at=EXCLUDED.expires_at,set_by=EXCLUDED.set_by,reason=EXCLUDED.reason,updated_at=NOW() RETURNING expires_at",
  [id,target.id,ticketType,u.id,why.slice(0,500)]
 );
 return say(i,"Applied a **7-day** cooldown to <@"+target.id+"> for **"+ticketType.replaceAll("_"," ")+"**. It expires <t:"+Math.floor(new Date(saved.rows[0].expires_at).getTime()/1000)+":F>. Ordinary support requests are unaffected.");
}
if(n==="announce"){staff(i,s);if(!i.memberPermissions.has(P.ManageGuild))throw Error("Manage Server required.");const dest=i.options.getChannel("channel"),title=i.options.getString("title"),msg=i.options.getString("message");if(!dest||!title||!msg)throw Error("Set channel, title and message.");const m=await dest.send({embeds:[new EmbedBuilder().setColor(0x8C1D32).setTitle(title).setDescription(msg).setTimestamp()],allowedMentions:{parse:[]}});return say(i,"Announcement: "+m.url);}
if(n==="poll"){staff(i,s);if(!i.memberPermissions.has(P.ManageMessages))throw Error("Manage Messages required.");const q=i.options.getString("question"),raw=i.options.getString("options");if(!q||!raw)throw Error("Set question and choices separated by |.");const a=raw.split("|").map(x=>x.trim()).filter(Boolean),em=["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣"];if(a.length<2||a.length>5)throw Error("Provide 2-5 choices.");const m=await c.send({embeds:[new EmbedBuilder().setTitle("COMMUNITY POLL").setDescription("**"+q+"**\n"+a.map((x,k)=>em[k]+" "+x).join("\n"))]});for(let k=0;k<a.length;k++)await m.react(em[k]);return say(i,"Poll: "+m.url);}
if(n==="event-list"){staff(i,s);const a=await g.scheduledEvents.fetch();return say(i,[...a.values()].filter(x=>x.scheduledStartTimestamp>Date.now()).map(x=>x.name+" • <t:"+Math.floor(x.scheduledStartTimestamp/1000)+":F>").join("\n")||"No upcoming events.");}
if(n==="event-create"||n==="event-cancel"){staff(i,s);if(!i.memberPermissions.has(P.ManageEvents))throw Error("Manage Events required.");if(n==="event-cancel"){const v=i.options.getString("event_id");if(!v)throw Error("Set event_id.");const e=await g.scheduledEvents.fetch(v).catch(()=>null);if(!e)throw Error("Event not found.");await e.delete(reason);return say(i,"Event cancelled.");}const title=i.options.getString("title"),a=new Date(i.options.getString("start")||""),b=new Date(i.options.getString("end")||"");if(!title||!Number.isFinite(+a)||!Number.isFinite(+b)||a<=new Date()||b<=a)throw Error("Set title and valid future ISO start/end.");const e=await g.scheduledEvents.create({name:title,scheduledStartTime:a,scheduledEndTime:b,privacyLevel:2,entityType:3,entityMetadata:{location:"CoopFT Discord"}});return say(i,"Scheduled "+e.name+".");}
if(["slowmode","lock","unlock","purge","channel-topic","channel-rename","channel-clone"].includes(n)){staff(i,s);const p=n==="purge"?P.ManageMessages:P.ManageChannels;if(!i.memberPermissions.has(p))throw Error("Missing channel permission.");if(n==="slowmode"){const v=i.options.getInteger("amount");if(v===null||v>21600)throw Error("Set amount 0-21600.");await c.setRateLimitPerUser(v);return say(i,"Slowmode updated.");}if(n==="lock"||n==="unlock"){await c.permissionOverwrites.edit(g.id,{SendMessages:n==="lock"?false:null});return say(i,n==="lock"?"Locked.":"Unlocked.");}if(n==="purge"){const v=i.options.getInteger("amount");if(!v||v>100)throw Error("Set amount 1-100.");const r=await c.bulkDelete(v,true);return say(i,"Deleted "+r.size+" recent messages.");}if(n==="channel-topic"){const v=i.options.getString("topic");if(!v)throw Error("Set topic.");await c.setTopic(v);return say(i,"Topic updated.");}if(n==="channel-rename"){const v=i.options.getString("name");if(!v)throw Error("Set name.");await c.setName(v);return say(i,"Channel renamed.");}const x=await c.clone({reason:"CoopFT staff clone"});return say(i,"Cloned <#"+x.id+">.");}
if(["timeout","untimeout","kick","ban","warn","role-add","role-remove","nickname","reset-nickname"].includes(n)){staff(i,s);const m=await getMember();if(n==="timeout"){if(!i.memberPermissions.has(P.ModerateMembers))throw Error("Moderate Members required.");const mins=i.options.getInteger("amount"),why=i.options.getString("reason");if(!mins||mins>40320||!why||m.id===g.ownerId||m.id===u.id)throw Error("Set valid minutes and reason; cannot timeout self/owner.");await m.timeout(mins*60000,why);const x=await s.pool.query("INSERT INTO coopft_mod_cases(guild_id,actor_id,target_id,action,reason,expires_at,active) VALUES($1,$2,$3,'timeout',$4,NOW()+($5::int*INTERVAL '1 minute'),TRUE) RETURNING id",[id,u.id,m.id,why,mins]);return say(i,"Timeout applied. Case #"+x.rows[0].id+".");}if(n==="untimeout"){if(!i.memberPermissions.has(P.ModerateMembers))throw Error("Moderate Members required.");await m.timeout(null,reason);return say(i,"Timeout removed.");}if(n==="kick"||n==="ban"){if(!i.memberPermissions.has(n==="kick"?P.KickMembers:P.BanMembers))throw Error("Missing kick/ban permission.");if(m.id===g.ownerId||m.id===u.id)throw Error("Cannot punish self/owner.");const x=await s.pool.query("INSERT INTO coopft_mod_cases(guild_id,actor_id,target_id,action,reason) VALUES($1,$2,$3,$4,$5) RETURNING id",[id,u.id,m.id,n,reason]);if(n==="kick")await m.kick("Case #"+x.rows[0].id+": "+reason);else await g.members.ban(m.id,{reason:"Case #"+x.rows[0].id+": "+reason});return say(i,n+" completed. Case #"+x.rows[0].id+".");}if(n==="warn"){if(!i.memberPermissions.has(P.ManageMessages))throw Error("Manage Messages required.");const x=await s.pool.query("INSERT INTO coopft_mod_cases(guild_id,actor_id,target_id,action,reason,active) VALUES($1,$2,$3,'warn',$4,TRUE) RETURNING id",[id,u.id,m.id,reason]);await m.send("CoopFT warning: "+reason).catch(()=>{});return say(i,"Warning saved. Case #"+x.rows[0].id+".");}if(n==="role-add"||n==="role-remove"){if(!i.memberPermissions.has(P.ManageRoles))throw Error("Manage Roles required.");const r=i.options.getRole("role");if(!r||r.managed||r.position>=g.members.me.roles.highest.position||r.position>=i.member.roles.highest.position&&u.id!==g.ownerId)throw Error("Role is managed or above hierarchy.");const developerRole=s.coopft.roles.get("developer_member");if(developerRole?.id===r.id&&!s.coopft.canManageApplications(i.member,g))throw Error("Only Owner Rank can assign or remove the Developer role.");await m.roles[n==="role-add"?"add":"remove"](r,reason);return say(i,"Role updated.");}if(!i.memberPermissions.has(P.ManageNicknames))throw Error("Manage Nicknames required.");await m.setNickname(n==="nickname"?i.options.getString("name"):null,reason);return say(i,"Nickname updated.");}
if(n==="unban"){staff(i,s);if(!i.memberPermissions.has(P.BanMembers))throw Error("Ban Members required.");const x=i.options.getString("user_id");if(!/^\d{17,25}$/.test(x||""))throw Error("Set a valid user_id.");await g.members.unban(x,reason);await s.pool.query("INSERT INTO coopft_mod_cases(guild_id,actor_id,target_id,action,reason) VALUES($1,$2,$3,'unban',$4)",[id,u.id,x,reason]);return say(i,"User unbanned.");}
if(n==="warnings"){staff(i,s);const x=i.options.getUser("member");if(!x)throw Error("Select member.");const r=await s.pool.query("SELECT id,actor_id,reason FROM coopft_mod_cases WHERE guild_id=$1 AND target_id=$2 AND action='warn' AND active=TRUE ORDER BY created_at DESC LIMIT 15",[id,x.id]);return say(i,r.rows.map(a=>"#"+a.id+" • <@"+a.actor_id+"> • "+a.reason).join("\n")||"No warnings.");}
if(n==="clear-warnings"){lead(i,s);const m=await getMember(),r=await s.pool.query("UPDATE coopft_mod_cases SET active=FALSE WHERE guild_id=$1 AND target_id=$2 AND action='warn' AND active=TRUE RETURNING id",[id,m.id]);return say(i,"Cleared "+r.rowCount+" warnings.");}
if(n==="case"){staff(i,s);const v=i.options.getInteger("amount"),r=await s.pool.query("SELECT * FROM coopft_mod_cases WHERE guild_id=$1 AND id=$2",[id,v]),a=r.rows[0];if(!a)throw Error("Set amount to an existing case ID.");return say(i,null,[new EmbedBuilder().setTitle("CASE #"+a.id).addFields({name:"Action",value:a.action},{name:"Target",value:"<@"+a.target_id+">"},{name:"Staff",value:"<@"+a.actor_id+">"},{name:"Reason",value:a.reason})]);}
if(n==="note"){staff(i,s);const x=i.options.getUser("member"),v=i.options.getString("note");if(!x||!v)throw Error("Select member and note.");const r=await s.pool.query("INSERT INTO coopft_staff_notes(guild_id,member_id,actor_id,note) VALUES($1,$2,$3,$4) RETURNING id",[id,x.id,u.id,v]);return say(i,"Private note #"+r.rows[0].id+" saved.");}
if(n==="notes"){staff(i,s);const x=i.options.getUser("member");if(!x)throw Error("Select member.");const r=await s.pool.query("SELECT id,actor_id,note FROM coopft_staff_notes WHERE guild_id=$1 AND member_id=$2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 10",[id,x.id]);return say(i,r.rows.map(a=>"#"+a.id+" by <@"+a.actor_id+"> • "+a.note).join("\n")||"No notes.");}
if(n==="member-note-remove"){lead(i,s);const v=i.options.getInteger("amount"),r=await s.pool.query("UPDATE coopft_staff_notes SET deleted_at=NOW(),deleted_by=$3 WHERE guild_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING id",[id,v,u.id]);if(!r.rowCount)throw Error("Set amount to an active note ID.");return say(i,"Note removed.");}
if(n.startsWith("ticket-")){
 if(n==="ticket-list"){
  staff(i,s);
  const r=await s.pool.query("SELECT channel_id,opener_id,ticket_type,priority FROM coopft_tickets WHERE guild_id=$1 AND status='open' ORDER BY created_at LIMIT 20",[id]);
  return say(i,r.rows.map(a=>"<#"+a.channel_id+"> • "+a.priority+" • <@"+a.opener_id+"> • "+a.ticket_type).join("\n")||"No open tickets.");
 }
 const t=await getTicket();
 const canHandle=s.coopft.canHandleTicket(i.member,t);
 if(n==="ticket-close"){
  if(t.opener_id!==u.id&&!canHandle)throw Error("Only the ticket owner or assigned ticket team can close this request.");
  await i.deferReply({flags:MessageFlags.Ephemeral});
  await s.coopft.closeTicket(g,c,t,u.id);
  return i.editReply("Ticket closed and transcript archived.");
 }
 if(!canHandle)throw Error("This ticket is reserved for its owner, CoopFT staff or the assigned Developer team.");
 if(n==="ticket-claim"){
  const r=await s.pool.query("UPDATE coopft_tickets SET claimed_by=$3 WHERE guild_id=$1 AND id=$2 AND status='open' AND (claimed_by IS NULL OR claimed_by=$3) RETURNING id",[id,t.id,u.id]);
  if(!r.rowCount)throw Error("Already claimed.");
  return say(i,"Ticket claimed.");
 }
 if(n==="ticket-add"||n==="ticket-remove"){
  const x=i.options.getUser("member");
  if(!x)throw Error("Select member.");
  if(n==="ticket-remove"&&x.id===t.opener_id)throw Error("Cannot remove opener.");
  if(n==="ticket-add")await c.permissionOverwrites.edit(x.id,{ViewChannel:true,SendMessages:true,ReadMessageHistory:true,AttachFiles:true});
  else await c.permissionOverwrites.delete(x.id);
  return say(i,"Ticket access updated.");
 }
 if(n==="ticket-rename"){
  const v=i.options.getString("name");
  if(!v)throw Error("Set name.");
  await c.setName("ticket-"+v.toLowerCase().replace(/[^a-z0-9-]/g,"-").slice(0,85));
  return say(i,"Ticket renamed.");
 }
 if(n==="ticket-priority"){
  const v=i.options.getString("value");
  if(!["low","normal","high","urgent"].includes(v))throw Error("Set value to low, normal, high or urgent.");
  await s.pool.query("UPDATE coopft_tickets SET priority=$3 WHERE guild_id=$1 AND id=$2",[id,t.id,v]);
  return say(i,"Priority updated.");
 }
 if(n==="ticket-info"){
  const d=t.ticket_data||{};
  return say(i,null,[new EmbedBuilder().setTitle("TICKET DETAILS").addFields(
   {name:"Owner",value:"<@"+t.opener_id+">"},
   {name:"Priority",value:String(t.priority||"normal")},
   {name:"Type",value:String(d.typeLabel||t.ticket_type)},
   {name:"Answers",value:Object.entries(d.answers||{}).map(([k,v])=>k+": "+v).join("\n").slice(0,1024)||"None"}
  )]);
 }
}if(n==="suggestion"){const destId=await s.coopft.getResource(id,"channel:suggestions"),dest=destId?await g.channels.fetch(destId).catch(()=>null):null;if(!dest?.send)throw Error("Suggestions channel not configured.");const title=i.options.getString("title"),details=i.options.getString("message");if(!title||!details)throw Error("Set title and message.");const r=await s.pool.query("INSERT INTO coopft_suggestions(guild_id,author_id,title,details) VALUES($1,$2,$3,$4) RETURNING id",[id,u.id,title,details]),m=await dest.send({embeds:[new EmbedBuilder().setTitle("SUGGESTION #"+r.rows[0].id).setDescription("**"+title+"**\n"+details).addFields({name:"Submitted by",value:"<@"+u.id+">"},{name:"Status",value:"Open"})],allowedMentions:{parse:[]}});await s.pool.query("UPDATE coopft_suggestions SET channel_id=$2,message_id=$3 WHERE id=$1",[r.rows[0].id,dest.id,m.id]);return say(i,"Suggestion submitted: "+m.url);}
if(n==="suggestion-review"){lead(i,s);const x=i.options.getInteger("amount"),st=i.options.getString("value"),valid=["under_review","accepted","planned","implemented","declined"];if(!x||!valid.includes(st))throw Error("Set amount to suggestion ID and value to "+valid.join(", "));const r=await s.pool.query("UPDATE coopft_suggestions SET status=$3,reviewed_by=$4,updated_at=NOW() WHERE guild_id=$1 AND id=$2 RETURNING id",[id,x,st,u.id]);if(!r.rowCount)throw Error("Suggestion not found.");return say(i,"Suggestion review saved.");}
throw Error("No handler for "+n);
}
function loadCoopFTCommands(){
 const map=new Map();
 const schema={
  announce:["channel","title","message"],poll:["question","options"],
  "event-create":["title","start","end"],"event-cancel":["event_id"],
  slowmode:["amount"],purge:["amount"],
  timeout:["member","amount","reason"],untimeout:["member","reason"],kick:["member","reason"],ban:["member","reason"],unban:["user_id","reason"],warn:["member","reason"],warnings:["member"],"clear-warnings":["member"],case:["amount"],
  note:["member","note"],notes:["member"],"member-note-remove":["amount"],
  "role-add":["member","role","reason"],"role-remove":["member","role","reason"],nickname:["member","name","reason"],"reset-nickname":["member","reason"],
  "channel-topic":["topic"],"channel-rename":["name"],
  "ticket-add":["member"],"ticket-remove":["member"],"ticket-rename":["name"],"ticket-priority":["value"],
  "ticket-cooldown":["member","ticket_type","reason"],
  suggestion:["title","message"],"suggestion-review":["amount","value","reason"]
 };
 const optionDefinitions={
  member:["user","Member to target"],role:["role","Role to target"],channel:["channel","Destination channel"],
  title:["string","Title"],message:["string","Message or details"],question:["string","Poll question"],options:["string","Poll choices separated by |"],
  start:["string","Start time in ISO 8601"],end:["string","End time in ISO 8601"],event_id:["string","Scheduled event ID"],user_id:["string","Discord user ID"],
  reason:["string","Reason"],note:["string","Private staff note"],topic:["string","New channel topic"],name:["string","New name or nickname"],value:["string","Priority or review status"],ticket_type:["string","Request type to cool down"],
  amount:["integer","Number, ID, seconds or minutes"]
 };
 for(let k=0;k<names.length;k++){
  const n=names[k];let b=new SlashCommandBuilder().setName(n).setDescription(desc[k]);
  if(n==="coopft-panel"){
   b.addStringOption(o=>o.setName("panel").setDescription("Panel to publish or move").setRequired(true)
    .addChoices(
     {name:"Ticket intake",value:"tickets"},
     {name:"Staff applications",value:"applications"},
     {name:"Member role selection",value:"roles"},
     {name:"Custom bot commissions",value:"custom-bot"},
     {name:"Staff directory",value:"directory"}
    ));
   b.addChannelOption(o=>o.setName("channel").setDescription("Destination text channel (defaults to the saved channel)").setRequired(false));
  }
  if(n==="coopft-ticket-config"){
   b.addChannelOption(o=>o.setName("category").setDescription("Category where new tickets will be created").addChannelTypes(ChannelType.GuildCategory).setRequired(false));
   b.addChannelOption(o=>o.setName("transcript").setDescription("Text channel that receives closed-ticket transcripts").addChannelTypes(ChannelType.GuildText,ChannelType.GuildAnnouncement).setRequired(false));
  }
  for(const key of (schema[n]||[])){
   const [kind,label]=optionDefinitions[key];
   if(kind==="user")b.addUserOption(o=>o.setName(key).setDescription(label).setRequired(true));
   else if(kind==="role")b.addRoleOption(o=>o.setName(key).setDescription(label).setRequired(true));
   else if(kind==="channel")b.addChannelOption(o=>o.setName(key).setDescription(label).setRequired(true));
   else if(kind==="integer")b.addIntegerOption(o=>o.setName(key).setDescription(label).setMinValue(0).setMaxValue(40320).setRequired(true));
   else if(key==="ticket_type")b.addStringOption(o=>o.setName(key).setDescription(label).setRequired(true).addChoices(
    {name:"Custom Bot Commission",value:"custom_bot_request"},
    {name:"Partnership Enquiry",value:"partnership"},
    {name:"Member Report",value:"member_report"},
    {name:"Staff Concern or Appeal",value:"staff_report"},
    {name:"Bot Exploit Report",value:"bot_exploit"}
   ));
   else b.addStringOption(o=>o.setName(key).setDescription(label).setMaxLength(key==="message"||key==="note"?2500:1000).setRequired(true));
  }
  map.set(n,{data:b,execute:(i,s)=>run(n,i,s)});
 }
 if(map.size!==names.length)throw Error("CoopFT slash-command registry contains a duplicate.");
 return map;
}
module.exports={loadCoopFTCommands};