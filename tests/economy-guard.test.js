const test=require("node:test");
const assert=require("node:assert/strict");
const {inspectEconomyMutation,inspectRewardBurst}=require("../src/services/economy-guard");

test("economy mutations require an approved reason, sign and safe amount",()=>{
 assert.equal(inspectEconomyMutation({userId:"u",delta:500,reason:"daily_reward"}).allowed,true);
 assert.equal(inspectEconomyMutation({userId:"u",delta:-500,reason:"daily_reward"}).code,"ECONOMY_DIRECTION_INVALID");
 assert.equal(inspectEconomyMutation({userId:"u",delta:1,reason:"unknown_reason"}).code,"ECONOMY_REASON_INVALID");
 assert.equal(inspectEconomyMutation({userId:"u",delta:50001,reason:"crime_success"}).code,"ECONOMY_AMOUNT_LIMIT");
});

test("administrator grants require an audit actor and reason and cannot target the actor",()=>{
 assert.equal(inspectEconomyMutation({userId:"target",delta:100,reason:"admin_grant"}).code,"ECONOMY_ADMIN_AUDIT_REQUIRED");
 assert.equal(inspectEconomyMutation({userId:"actor",delta:100,reason:"admin_grant",metadata:{actorId:"actor",reason:"test"}}).code,"ECONOMY_SELF_GRANT");
 assert.equal(inspectEconomyMutation({userId:"target",delta:100,reason:"admin_grant",metadata:{actorId:"actor",reason:"approved reward"}}).allowed,true);
});

test("casino payout policy requires well-formed wager metadata",()=>{
 assert.equal(inspectEconomyMutation({userId:"u",delta:100,reason:"casino_payout"}).code,"ECONOMY_CASINO_METADATA_INVALID");
 assert.equal(inspectEconomyMutation({userId:"u",delta:100,reason:"casino_payout",metadata:{wager:100,multiplier:100}}).allowed,true);
});

test("reward bursts create soft alerts and hard blocks at the configured thresholds",()=>{
 assert.equal(inspectRewardBurst({recentCount:2,recentBase:1000,currentBase:1000}).alert,false);
 const soft=inspectRewardBurst({recentCount:9,recentBase:5000,currentBase:500});
 assert.equal(soft.alert,true);
 assert.equal(soft.blocked,false);
 const hard=inspectRewardBurst({recentCount:29,recentBase:1000,currentBase:100});
 assert.equal(hard.blocked,true);
 assert.equal(hard.score,100);
});

test("player economy snapshots block values edited outside bot transactions",async()=>{
 const service=new (require("../src/services/economy").EconomyService)({});
 const client={query:async(sql)=>{
  if(sql.includes("FROM player_economy_snapshots"))return{rowCount:1,rows:[{wallet:90,bank:0,lifetime_earned:100,lifetime_spent:0,level:10,xp:0}]};
  return{rowCount:1,rows:[]};
 }};
 await assert.rejects(
  service.assertSnapshotTx(client,"guild","member",{wallet:999,bank:0,lifetime_earned:100,lifetime_spent:0,level:10,xp:0}),
  error=>error.code==="ECONOMY_INTEGRITY_MISMATCH"
 );
});
