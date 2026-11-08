const test=require("node:test");
const assert=require("node:assert/strict");
const {validateOffer,hasOffer}=require("../src/services/trade-interactions");
const {EconomyEventService}=require("../src/services/economy-events");
const {AdminMessagingService}=require("../src/services/admin-messaging");
const {leaderboardPayload}=require("../src/commands/leaderboard-ui");

test("trade offers require valid, owned-catalog item IDs and bounded quantities",()=>{
 assert.deepEqual(validateOffer({fc:500,items:[{itemId:"reinforced_gloves",quantity:1}]}),
  {fc:500,items:[{itemId:"reinforced_gloves",quantity:1}]});
 assert.throws(()=>validateOffer({fc:-1,items:[]}),/Invalid FC/);
 assert.throws(()=>validateOffer({fc:0,items:[{itemId:"booster_crimson_katana",quantity:1}]}),/cannot be traded/);
 assert.throws(()=>validateOffer({fc:0,items:[{itemId:"reinforced_gloves",quantity:100}]}),/1–99/);
 assert.equal(hasOffer({fc:0,items:[]}),false);
 assert.equal(hasOffer({fc:0,items:[{itemId:"reinforced_gloves",quantity:1}]}),true);
});

test("economy event rejects unsafe multiplier and duration settings",async()=>{
 const service=new EconomyEventService({query:async()=>({rows:[]})});
 await assert.rejects(service.start("g","admin","Party",1,30),/2× and 10×/);
 await assert.rejects(service.start("g","admin","Party",10,2),/5 minutes/);
});

test("economy event persists a validated party event",async()=>{
 const calls=[];
 const service=new EconomyEventService({query:async(sql,values)=>{
  calls.push({sql,values});
  if(sql.startsWith("INSERT"))return {rows:[{id:"event-1",name:values[2],multiplier:values[3],ends_at:new Date()}]};
  return {rows:[],rowCount:0};
 }});
 const event=await service.start("guild","admin","Weekend Frenzy",10,30);
 assert.equal(event.multiplier,10);
 assert.equal(event.name,"Weekend Frenzy");
 assert.ok(calls.some(x=>x.sql.startsWith("UPDATE economy_events")));
});

test("forced DM sends skip bots and count closed DMs as failures",async()=>{
 const guild={members:{fetch:async()=>new Map([
  ["1",{user:{bot:false},send:async()=>{}}],
  ["2",{user:{bot:true},send:async()=>{throw new Error("must skip")}}],
  ["3",{user:{bot:false},send:async()=>{throw new Error("closed DMs")}}]
 ])}};
 const result=await new AdminMessagingService().sendToAll(guild,"Server announcement");
 assert.deepEqual(result,{sent:1,failed:1,skipped:1});
});

test("leaderboard shows all members and gives missing profiles a zero score",async()=>{
 const guild={id:"g",members:{fetch:async()=>new Map([
  ["u1",{id:"u1",displayName:"Alice",user:{username:"alice",globalName:"Alice"}}],
  ["u2",{id:"u2",displayName:"Bob",user:{username:"bob",globalName:"Bob"}}]
 ])}};
 const pool={query:async(sql)=>({rows:sql.includes("FROM players")?[{user_id:"u1",wallet:50,bank:20,level:4,xp:3,lifetime_earned:100}]:[]})};
 const payload=await leaderboardPayload({guild,pool,owner:"u1",metric:"wealth"});
 const description=payload.embeds[0].data.description;
 assert.match(description,/Alice/);
 assert.match(description,/Bob/);
 assert.match(description,/70 FC/);
 assert.match(description,/0 FC/);
 assert.equal(payload.components.length,2);
});


test("editing a trade offer clears both players' confirmations",async()=>{
 const future=new Date(Date.now()+60000);
 const original={
  id:"trade-1",guild_id:"g",initiator_id:"a",target_id:"b",status:"open",expires_at:future,
  offers:{initiator:{fc:100,items:[]},target:{fc:200,items:[]}},
  confirmations:{initiator:true,target:true}
 };
 const client={query:async(sql,values)=>{
  if(sql.startsWith("SELECT * FROM player_trades"))return {rows:[original]};
  if(sql.startsWith("SELECT wallet FROM players"))return {rowCount:1,rows:[{wallet:500}]};
  if(sql.startsWith("UPDATE player_trades SET offers"))return {rows:[{
   ...original,offers:JSON.parse(values[2]),confirmations:JSON.parse(values[3])
  }]};
  throw new Error("Unexpected SQL: "+sql);
 }};
 const {TradeService}=require("../src/services/trade-interactions");
 const service=new TradeService({},async callback=>callback(client));
 const updated=await service.setOffer("g","trade-1","a",{fc:150,items:[]});
 assert.equal(updated.offers.initiator.fc,150);
 assert.deepEqual(updated.confirmations,{initiator:false,target:false});
});

test("a trade cannot be confirmed until both players offer something",async()=>{
 const trade={
  id:"trade-2",guild_id:"g",initiator_id:"a",target_id:"b",status:"open",
  expires_at:new Date(Date.now()+60000),
  offers:{initiator:{fc:100,items:[]},target:{fc:0,items:[]}},
  confirmations:{initiator:false,target:false}
 };
 const client={query:async(sql)=>{
  if(sql.startsWith("SELECT * FROM player_trades"))return {rows:[trade]};
  throw new Error("Trade should stop before settlement SQL.");
 }};
 const {TradeService}=require("../src/services/trade-interactions");
 const service=new TradeService({},async callback=>callback(client));
 await assert.rejects(service.confirm("g","trade-2","a"),/Both players must offer/);
});
