const test=require("node:test");
const assert=require("node:assert/strict");
const core=require("../src/utils/core");
const balancing=require("../src/config/game-balancing");
const {EconomyService}=require("../src/services/economy");

test("progression is level capped at 600 with no rebirth multiplier",()=>{
 assert.equal(balancing.progression.maxLevel,600);
 assert.equal("maxRebirths" in balancing.progression,false);
 assert.equal("rebirth" in balancing,false);
 assert.equal(core.levelXpRequired(601),core.levelXpRequired(600));
 assert.equal(core.getLevelEarningMultiplier(600),3.995);
});

test("valid large XP grants cannot raise a player above level 600",async()=>{
 const service=new EconomyService({});
 const updates=[];
 const client={query:async(sql)=>{
  if(sql.includes("SELECT wallet, bank, lifetime_earned, lifetime_spent, level, xp FROM players"))return{rowCount:1,rows:[{wallet:0,bank:0,lifetime_earned:0,lifetime_spent:0,level:599,xp:0}]};
  if(sql.includes("FROM guild_settings"))return{rowCount:0,rows:[]};
  if(sql.includes("UPDATE players SET level"))updates.push(sql);
  return{rowCount:1,rows:[]};
 }};
 const result=await service.addXpTx(client,"guild","member",50000);
 assert.equal(result.level,600);
 assert.equal(result.xp,0);
 assert.equal(result.levelsGained,1);
 assert.equal(updates.length,1);
});

test("an impossible XP payload is blocked before player progression changes",async()=>{
 const service=new EconomyService({});
 let selected=false;
 const client={query:async(sql)=>{if(sql.includes("FROM players"))selected=true;return{rowCount:0,rows:[]};}};
 await assert.rejects(service.addXpTx(client,"guild","member",50001),error=>error.code==="ECONOMY_XP_INVALID");
 assert.equal(selected,false);
});
