const { EmbedBuilder,ActionRowBuilder,ButtonBuilder,ButtonStyle }=require("discord.js");
const PAGE_SIZE=10;
const METRICS={
 wealth:{title:"TOTAL WEALTH",label:"FC",description:"Wallet and bank combined."},
 level:{title:"PLAYER LEVEL",label:"Level",description:"Player level, with XP used as a tie-breaker."},
 earned:{title:"LIFETIME FC EARNED",label:"FC",description:"Eligible FC earned over the member's lifetime."},
 party:{title:"PARTY POINTS",label:"PP",description:"Points earned from Party Games."},
 activity:{title:"WEEKLY MESSAGES",label:"messages",description:"Messages sent during the current week."},
 rebirths:{title:"REBIRTHS",label:"rebirths",description:"Completed rebirth count."},
 career:{title:"CAREER LEVEL",label:"job levels",description:"Current career progression."},
 crimes:{title:"SUCCESSFUL CRIMES",label:"crimes",description:"Successful crime operations."},
 heists:{title:"COMPLETED HEISTS",label:"heists",description:"Successfully completed heists."}
};
function scoreFor(metric,p,party,activity){
 if(metric==="wealth")return Number(p.wallet||0)+Number(p.bank||0);
 if(metric==="level")return Number(p.level||1);
 if(metric==="earned")return Number(p.lifetime_earned||0);
 if(metric==="party")return Number(p.points||0);
 if(metric==="activity")return Number(activity.messages||0);
 if(metric==="rebirths")return Number(p.prestige||0);
 if(metric==="career")return p.job_id?Number(p.job_level||0):0;
 if(metric==="crimes")return Number(p.crime_successes||0);
 if(metric==="heists")return Number(p.heists_completed||0);
 return 0;
}
function cachedName(guild,id){
 const member=guild.members?.cache?.get(id);
 const user=member?.user||guild.client?.users?.cache?.get(id);
 return {name:member?.displayName||user?.globalName||user?.username||"Member "+String(id).slice(-4),username:user?.username||""};
}
async function leaderboardPayload({guild,pool,owner,metric="wealth",page=0,query=""}){
 const key=METRICS[metric]?metric:"wealth";
 const [players,party,activity,exclusions]=await Promise.all([
  pool.query("SELECT user_id,wallet,bank,level,xp,lifetime_earned,prestige,job_id,job_level,crime_successes,heists_completed FROM players WHERE guild_id=$1",[guild.id]),
  pool.query("SELECT user_id,points FROM party_game_stats WHERE guild_id=$1",[guild.id]),
  pool.query("SELECT user_id,messages FROM weekly_activity WHERE guild_id=$1 AND week_start=date_trunc('week',CURRENT_DATE)::date",[guild.id]),
  pool.query("SELECT user_id FROM leaderboard_exclusions WHERE guild_id=$1",[guild.id])
 ]);
 const profileMap=new Map(players.rows.map(x=>[x.user_id,x]));
 const partyMap=new Map(party.rows.map(x=>[x.user_id,x]));
 const activityMap=new Map(activity.rows.map(x=>[x.user_id,x]));
 const cachedIds=Array.from(guild.members?.cache?.keys?.()||[]);
 const ids=new Set([...profileMap.keys(),...partyMap.keys(),...activityMap.keys(),...cachedIds]);
 const excluded=new Set(exclusions.rows.map(x=>x.user_id));
 const needle=String(query||"").trim().toLocaleLowerCase();
 // Exact-ID lookup uses the non-privileged single-member endpoint only.
 if(/^\d{17,20}$/.test(needle)&&!ids.has(needle)){
  const member=await guild.members.fetch(needle).catch(()=>null);
  if(member&&!member.user.bot)ids.add(needle);
 }
 let rows=Array.from(ids).filter(id=>!excluded.has(id)&&!guild.members?.cache?.get(id)?.user?.bot).map(id=>{
  const p=profileMap.get(id)||{},g=partyMap.get(id)||{},a=activityMap.get(id)||{};
  const identity=cachedName(guild,id);
  return {id,name:identity.name,username:identity.username,score:scoreFor(key,p,g,a),xp:Number(p.xp||0)};
 });
 if(needle)rows=rows.filter(x=>x.name.toLocaleLowerCase().includes(needle)||x.username.toLocaleLowerCase().includes(needle)||x.id.includes(needle));
 rows.sort((a,b)=>b.score-a.score||(key==="level"?b.xp-a.xp:0)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
 const pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
 const current=Math.max(0,Math.min(pages-1,Math.floor(Number(page)||0)));
 const shown=rows.slice(current*PAGE_SIZE,(current+1)*PAGE_SIZE);
 const lines=shown.map((x,i)=>"**#"+(current*PAGE_SIZE+i+1)+"** "+x.name.replace(/[\r\n]/g," ").slice(0,65)+" · <@"+x.id+"> · **"+x.score.toLocaleString()+" "+METRICS[key].label+"**");
 const embed=new EmbedBuilder().setColor(0x851E2A).setTitle(METRICS[key].title+" / SERVER RANKING")
  .setDescription(METRICS[key].description+(needle?"\nSearch: "+needle.slice(0,80):"")+"\n\n"+(lines.join("\n")||"No matching tracked players.")+"\n\nPage "+(current+1)+" of "+pages+" · "+rows.length.toLocaleString()+" tracked profiles")
  .setFooter({text:"Tracked player profiles only · Privileged member-list intent is disabled"});
 return {embeds:[embed],components:[
  new ActionRowBuilder().addComponents(
   new ButtonBuilder().setCustomId("dash:"+owner+":leaderboard-page:"+key+":"+Math.max(0,current-1)).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(current===0),
   new ButtonBuilder().setCustomId("dash:"+owner+":leaderboard-page:"+key+":"+Math.min(pages-1,current+1)).setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(current>=pages-1),
   new ButtonBuilder().setCustomId("dash:"+owner+":leaderboard-search:"+key+":"+current).setLabel("Search member").setStyle(ButtonStyle.Primary)),
  new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("dash:"+owner+":rankings").setLabel("Change ranking").setStyle(ButtonStyle.Secondary))
 ],allowedMentions:{parse:[]}};
}
module.exports={leaderboardPayload,PAGE_SIZE,METRICS,scoreFor};
