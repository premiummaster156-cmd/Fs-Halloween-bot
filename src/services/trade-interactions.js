const balancing = require("../config/game-balancing");
const { transaction } = require("../database/pool");
const { ensurePlayerTx } = require("./economy");
const { DomainError, uuid } = require("../utils/core");
const TRADE_TTL_MS = 30 * 60 * 1000;
const MAX_ITEM_TYPES = 10;
const MAX_FC = Number(balancing.economy.maxWallet);
const MIN_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_SERVER_TENURE_MS = 24 * 60 * 60 * 1000;
const MAX_DAILY_TRADE_OPENS = 8;
const PAIR_COOLDOWN_MS = 10 * 60 * 1000;
function snowflakeCreatedAt(id) {
  try { return Number((BigInt(String(id)) >> 22n) + 1420070400000n); } catch (_) { return NaN; }
}
function validateTradeMember(member, now = Date.now()) {
  const user = member?.user || member;
  const userId = user?.id || member?.id;
  if (!userId || user?.bot) throw new DomainError("Trading is available only to human server members.", "TRADE_MEMBER_INVALID");
  const createdAt = snowflakeCreatedAt(userId);
  if (!Number.isFinite(createdAt) || now - createdAt < MIN_ACCOUNT_AGE_MS) {
    throw new DomainError("Discord accounts must be at least 7 days old before trading.", "TRADE_ACCOUNT_TOO_NEW");
  }
  let joinedAt = NaN;
  if (member?.joinedTimestamp != null) joinedAt = Number(member.joinedTimestamp);
  else if (member?.joinedAt) joinedAt = new Date(member.joinedAt).getTime();
  else if (member?.joined_at) joinedAt = Date.parse(member.joined_at);
  if (!Number.isFinite(joinedAt) || now - joinedAt < MIN_SERVER_TENURE_MS) {
    throw new DomainError("You must have been in this server for at least 24 hours before trading.", "TRADE_SERVER_TENURE");
  }
  return true;
}
const emptyOffer = () => ({ fc: 0, items: [] });
function normalizeTrade(row) {
  if (!row) return null;
  const parse = (value, fallback) => {
    if (typeof value !== "string") return value || fallback;
    try { return JSON.parse(value); } catch (_) { return fallback; }
  };
  return { ...row, offers: parse(row.offers, { initiator: emptyOffer(), target: emptyOffer() }),
    confirmations: parse(row.confirmations, { initiator: false, target: false }) };
}
function sideFor(trade, userId) {
  if (trade.initiator_id === userId) return "initiator";
  if (trade.target_id === userId) return "target";
  throw new DomainError("You are not part of this trade.", "TRADE_NOT_PARTICIPANT");
}
function hasOffer(offer) {
  return Number(offer.fc) > 0 || (Array.isArray(offer.items) && offer.items.some((item) => Number(item.quantity) > 0));
}
function validateOffer(offer) {
  const fc = Math.floor(Number(offer.fc) || 0);
  if (!Number.isSafeInteger(fc) || fc < 0 || fc > MAX_FC) throw new DomainError("Invalid FC offer.", "TRADE_INVALID_FC");
  const items = Array.isArray(offer.items) ? offer.items : [];
  if (items.length > MAX_ITEM_TYPES) throw new DomainError("You can offer up to 10 item types.", "TRADE_TOO_MANY_ITEMS");
  const seen = new Set();
  const normalized = items.map((entry) => {
    const itemId = String(entry.itemId || "");
    const quantity = Math.floor(Number(entry.quantity) || 0);
    const item = balancing.items.find((x) => x.id === itemId && !x.boosterOnly) ||
      balancing.halloween.shop.find((x) => x.id === itemId);
    if (!item) throw new DomainError("That item cannot be traded.", "TRADE_ITEM_INVALID");
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) throw new DomainError("Item quantity must be 1–99.", "TRADE_ITEM_QUANTITY");
    if (seen.has(itemId)) throw new DomainError("An item can only appear once in an offer.", "TRADE_DUPLICATE_ITEM");
    seen.add(itemId);
    return { itemId, quantity };
  });
  return { fc, items: normalized };
}
class TradeService {
  constructor(pool, transactionRunner = transaction) { this.pool = pool; this.transactionRunner = transactionRunner; }
  async create(guildId, initiatorId, targetId, initiatorMember, targetMember) {
    if (!targetId || initiatorId === targetId) throw new DomainError("Choose another member.", "TRADE_INVALID_TARGET");
    validateTradeMember(initiatorMember);
    validateTradeMember(targetMember);
    return this.transactionRunner(async (client) => {
      await ensurePlayerTx(client, guildId, initiatorId);
      await ensurePlayerTx(client, guildId, targetId);
      for (const userId of [initiatorId, targetId].sort()) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [guildId, userId]);
      }
      for (const userId of [initiatorId, targetId]) {
        const usage = await client.query("SELECT COUNT(*)::int AS count FROM player_trades WHERE guild_id=$1 AND (initiator_id=$2 OR target_id=$2) AND created_at>NOW()-INTERVAL '24 hours'", [guildId, userId]);
        if (Number(usage.rows[0]?.count || 0) >= MAX_DAILY_TRADE_OPENS) throw new DomainError("You have reached the daily limit of 8 trade invitations. Try again tomorrow.", "TRADE_DAILY_LIMIT");
      }
      const pairRecent = await client.query(
        "SELECT id FROM player_trades WHERE guild_id=$1 AND ((initiator_id=$2 AND target_id=$3) OR (initiator_id=$3 AND target_id=$2)) AND status IN ('open','completed') AND created_at>NOW()-($4 * INTERVAL '1 millisecond') LIMIT 1",
        [guildId, initiatorId, targetId, PAIR_COOLDOWN_MS]);
      if (pairRecent.rowCount) throw new DomainError("You recently traded with this member. Wait 10 minutes before opening another trade together.", "TRADE_PAIR_COOLDOWN");
      const active = await client.query(
        "SELECT id FROM player_trades WHERE guild_id = $1 AND status IN ('pending','open') AND expires_at > NOW() " +
        "AND (initiator_id = $2 OR target_id = $2 OR initiator_id = $3 OR target_id = $3) FOR UPDATE",
        [guildId, initiatorId, targetId]);
      if (active.rowCount) throw new DomainError("One of these members already has a pending invitation or active trade.", "TRADE_ALREADY_ACTIVE");
      const result = await client.query(
        "INSERT INTO player_trades (id,guild_id,initiator_id,target_id,offers,confirmations,status,expires_at) " +
        "VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,'pending',NOW()+($7 * INTERVAL '1 millisecond')) RETURNING *",
        [uuid(), guildId, initiatorId, targetId,
          JSON.stringify({ initiator: emptyOffer(), target: emptyOffer() }),
          JSON.stringify({ initiator: false, target: false }), TRADE_TTL_MS]);
      return normalizeTrade(result.rows[0]);
    });
  }
  async get(guildId, id) {
    const result = await this.pool.query("SELECT * FROM player_trades WHERE guild_id=$1 AND id=$2", [guildId,id]);
    return normalizeTrade(result.rows[0]);
  }
  async getActive(guildId, userId) {
    const result = await this.pool.query(
      "SELECT * FROM player_trades WHERE guild_id=$1 AND status='open' AND expires_at>NOW() AND (initiator_id=$2 OR target_id=$2) ORDER BY created_at DESC LIMIT 1",
      [guildId,userId]);
    return normalizeTrade(result.rows[0]);
  }
  async getPendingInvitation(guildId, userId) {
    const result = await this.pool.query(
      "SELECT * FROM player_trades WHERE guild_id=$1 AND status='pending' AND expires_at>NOW() AND (initiator_id=$2 OR target_id=$2) ORDER BY created_at DESC LIMIT 1",
      [guildId,userId]);
    return normalizeTrade(result.rows[0]);
  }
  async respondToInvitation(guildId, id, userId, decision) {
    if (decision !== "accept" && decision !== "deny") {
      throw new DomainError("Choose Accept or Deny.", "TRADE_INVITATION_DECISION_INVALID");
    }
    const result = await this.transactionRunner(async (client) => {
      const selected = await client.query(
        "SELECT * FROM player_trades WHERE guild_id=$1 AND id=$2 FOR UPDATE",
        [guildId,id]);
      const trade = normalizeTrade(selected.rows[0]);
      if (!trade || trade.status !== "pending") {
        throw new DomainError("This trade invitation is no longer waiting for a response.", "TRADE_INVITATION_CLOSED");
      }
      if (trade.target_id !== userId) {
        throw new DomainError("Only the invited member can accept or deny this trade.", "TRADE_INVITATION_NOT_RECIPIENT");
      }
      if (new Date(trade.expires_at).getTime() <= Date.now()) {
        await client.query(
          "UPDATE player_trades SET status='expired',updated_at=NOW() WHERE guild_id=$1 AND id=$2 AND status='pending'",
          [guildId,id]);
        return { __tradeInvitationExpired: true };
      }
      const accepted = decision === "accept";
      const updated = await client.query(
        accepted
          ? "UPDATE player_trades SET status='open',expires_at=NOW()+($3 * INTERVAL '1 millisecond'),updated_at=NOW() WHERE guild_id=$1 AND id=$2 AND status='pending' RETURNING *"
          : "UPDATE player_trades SET status='cancelled',updated_at=NOW() WHERE guild_id=$1 AND id=$2 AND status='pending' RETURNING *",
        accepted ? [guildId,id,TRADE_TTL_MS] : [guildId,id]);
      if (!updated.rowCount) throw new DomainError("This trade invitation has already been answered.", "TRADE_INVITATION_CLOSED");
      return { decision: accepted ? "accepted" : "denied", trade: normalizeTrade(updated.rows[0]) };
    });
    if (result?.__tradeInvitationExpired) throw new DomainError("This trade invitation has expired.", "TRADE_EXPIRED");
    return result;
  }
  async cancelInvitation(guildId, id, userId) {
    return this.transactionRunner(async (client) => {
      const selected = await client.query(
        "SELECT * FROM player_trades WHERE guild_id=$1 AND id=$2 FOR UPDATE",
        [guildId,id]);
      const trade = normalizeTrade(selected.rows[0]);
      if (!trade || trade.status !== "pending") throw new DomainError("This trade invitation is no longer pending.", "TRADE_INVITATION_CLOSED");
      if (trade.initiator_id !== userId) throw new DomainError("Only the member who sent this invitation can cancel it.", "TRADE_INVITATION_NOT_INITIATOR");
      const updated = await client.query(
        "UPDATE player_trades SET status='cancelled',updated_at=NOW() WHERE guild_id=$1 AND id=$2 AND status='pending' RETURNING *",
        [guildId,id]);
      if (!updated.rowCount) throw new DomainError("This trade invitation has already been answered.", "TRADE_INVITATION_CLOSED");
      return normalizeTrade(updated.rows[0]);
    });
  }
  async setOffer(guildId, id, userId, rawOffer) {
    const offer = validateOffer(rawOffer);
    const result = await this.transactionRunner(async (client) => {
      const result = await client.query("SELECT * FROM player_trades WHERE guild_id=$1 AND id=$2 FOR UPDATE", [guildId,id]);
      const trade = normalizeTrade(result.rows[0]);
      if (!trade || trade.status !== "open") throw new DomainError("This trade is no longer open.", "TRADE_CLOSED");
      if (new Date(trade.expires_at).getTime() <= Date.now()) {
        await client.query("UPDATE player_trades SET status='expired',updated_at=NOW() WHERE guild_id=$1 AND id=$2", [guildId, id]);
        return { __tradeExpired: true };
      }
      const side = sideFor(trade,userId);
      if (offer.fc) {
        const wallet = await client.query("SELECT wallet FROM players WHERE guild_id=$1 AND user_id=$2 FOR UPDATE", [guildId,userId]);
        if (!wallet.rowCount || Number(wallet.rows[0].wallet) < offer.fc) throw new DomainError("Your wallet does not contain the offered FC.", "TRADE_INSUFFICIENT_FC");
      }
      for (const item of offer.items) {
        const owned = await client.query("SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_id=$3 FOR UPDATE", [guildId,userId,item.itemId]);
        if (!owned.rowCount || Number(owned.rows[0].quantity) < item.quantity) throw new DomainError("You do not own enough of " + item.itemId + ".", "TRADE_INSUFFICIENT_ITEM");
      }
      trade.offers[side] = offer;
      trade.confirmations = { initiator: false, target: false };
      const updated = await client.query(
        "UPDATE player_trades SET offers=$3::jsonb,confirmations=$4::jsonb,updated_at=NOW() WHERE guild_id=$1 AND id=$2 RETURNING *",
        [guildId,id,JSON.stringify(trade.offers),JSON.stringify(trade.confirmations)]);
      return normalizeTrade(updated.rows[0]);
    });
    if (result?.__tradeExpired) throw new DomainError("This trade has expired.", "TRADE_EXPIRED");
    return result;
  }
  async confirm(guildId,id,userId) {
    const result = await this.transactionRunner(async (client) => {
      const result = await client.query("SELECT * FROM player_trades WHERE guild_id=$1 AND id=$2 FOR UPDATE", [guildId,id]);
      const trade = normalizeTrade(result.rows[0]);
      if (!trade || trade.status !== "open") throw new DomainError("This trade is no longer open.", "TRADE_CLOSED");
      if (new Date(trade.expires_at).getTime() <= Date.now()) {
        await client.query("UPDATE player_trades SET status='expired',updated_at=NOW() WHERE guild_id=$1 AND id=$2", [guildId, id]);
        return { __tradeExpired: true };
      }
      const side = sideFor(trade,userId);
      if (!hasOffer(trade.offers.initiator) || !hasOffer(trade.offers.target)) throw new DomainError("Both players must offer FC or at least one item. Free gifts are disabled.", "TRADE_BOTH_SIDES_REQUIRED");
      trade.confirmations[side] = true;
      if (!trade.confirmations.initiator || !trade.confirmations.target) {
        const updated = await client.query("UPDATE player_trades SET confirmations=$3::jsonb,updated_at=NOW() WHERE guild_id=$1 AND id=$2 RETURNING *",
          [guildId,id,JSON.stringify(trade.confirmations)]);
        return { completed: false, trade: normalizeTrade(updated.rows[0]) };
      }
      const members = [trade.initiator_id,trade.target_id].sort();
      const players = await client.query("SELECT user_id,wallet FROM players WHERE guild_id=$1 AND user_id=ANY($2::text[]) ORDER BY user_id FOR UPDATE", [guildId,members]);
      if (players.rowCount !== 2) throw new DomainError("A trader profile is missing.", "TRADE_PLAYER_MISSING");
      const wallets = new Map(players.rows.map((row) => [row.user_id,Number(row.wallet)]));
      for (const sideName of ["initiator","target"]) {
        const user = trade[sideName+"_id"], offer = trade.offers[sideName];
        if (wallets.get(user) < offer.fc) throw new DomainError("A trader no longer has the offered FC.", "TRADE_FUNDS_CHANGED");
        for (const item of offer.items) {
          const owned = await client.query("SELECT quantity FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_id=$3 FOR UPDATE", [guildId,user,item.itemId]);
          if (!owned.rowCount || Number(owned.rows[0].quantity) < item.quantity) throw new DomainError("An offered item is no longer owned.", "TRADE_ITEMS_CHANGED");
        }
      }
      const a=trade.offers.initiator,b=trade.offers.target;
      const deltas = [[trade.initiator_id,b.fc-a.fc],[trade.target_id,a.fc-b.fc]];
      for (const [user,delta] of deltas) {
        if (!delta) continue;
        if (delta < 0) {
          if (wallets.get(user) < -delta) throw new DomainError("A trader no longer has enough wallet FC.", "TRADE_FUNDS_CHANGED");
          await client.query("UPDATE players SET wallet=wallet+$3,updated_at=NOW() WHERE guild_id=$1 AND user_id=$2", [guildId,user,delta]);
        } else {
          const current = wallets.get(user);
          const normalized = Math.min(current, MAX_FC);
          const recovered = Math.max(0, current - MAX_FC);
          const walletCredit = Math.min(delta, Math.max(0, MAX_FC - normalized));
          const bankCredit = recovered + delta - walletCredit;
          await client.query(
            "UPDATE players SET wallet=$3,bank=bank+$4,updated_at=NOW() WHERE guild_id=$1 AND user_id=$2",
            [guildId,user,normalized + walletCredit,bankCredit]
          );
        }
      }
      for (const [fromSide,toUser] of [["initiator",trade.target_id],["target",trade.initiator_id]]) {
        const fromUser=trade[fromSide+"_id"];
        for (const item of trade.offers[fromSide].items) {
          const owned=await client.query("SELECT quantity,upgrade_level FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_id=$3 FOR UPDATE", [guildId,fromUser,item.itemId]);
          const remaining=Number(owned.rows[0].quantity)-item.quantity;
          if (remaining===0) {
            await client.query("DELETE FROM equipped_items WHERE guild_id=$1 AND user_id=$2 AND item_id=$3", [guildId,fromUser,item.itemId]);
            await client.query("DELETE FROM inventory WHERE guild_id=$1 AND user_id=$2 AND item_id=$3", [guildId,fromUser,item.itemId]);
          } else await client.query("UPDATE inventory SET quantity=$4,updated_at=NOW() WHERE guild_id=$1 AND user_id=$2 AND item_id=$3", [guildId,fromUser,item.itemId,remaining]);
          await client.query(
            "INSERT INTO inventory (guild_id,user_id,item_id,quantity,upgrade_level) VALUES ($1,$2,$3,$4,$5) " +
            "ON CONFLICT (guild_id,user_id,item_id) DO UPDATE SET quantity=inventory.quantity+EXCLUDED.quantity,upgrade_level=GREATEST(inventory.upgrade_level,EXCLUDED.upgrade_level),updated_at=NOW()",
            [guildId,toUser,item.itemId,item.quantity,Number(owned.rows[0].upgrade_level)||0]);
        }
      }
      await client.query(
        "INSERT INTO player_economy_snapshots (guild_id,user_id,wallet,bank,lifetime_earned,lifetime_spent,level,xp) " +
        "SELECT guild_id,user_id,wallet,bank,lifetime_earned,lifetime_spent,level,xp FROM players WHERE guild_id=$1 AND user_id=ANY($2::text[]) " +
        "ON CONFLICT (guild_id,user_id) DO UPDATE SET wallet=EXCLUDED.wallet,bank=EXCLUDED.bank,lifetime_earned=EXCLUDED.lifetime_earned," +
        "lifetime_spent=EXCLUDED.lifetime_spent,level=EXCLUDED.level,xp=EXCLUDED.xp,updated_at=NOW()",
        [guildId,members]
      );
      const completed=await client.query("UPDATE player_trades SET status='completed',confirmations=$3::jsonb,completed_at=NOW(),updated_at=NOW() WHERE guild_id=$1 AND id=$2 RETURNING *",
        [guildId,id,JSON.stringify(trade.confirmations)]);
      return { completed:true,trade:normalizeTrade(completed.rows[0]) };
    });
    if (result?.__tradeExpired) throw new DomainError("This trade has expired.", "TRADE_EXPIRED");
    return result;
  }
  async cancel(guildId,id,userId) {
    return this.transactionRunner(async (client) => {
      const result=await client.query("SELECT * FROM player_trades WHERE guild_id=$1 AND id=$2 FOR UPDATE",[guildId,id]);
      const trade=normalizeTrade(result.rows[0]);
      if (!trade || trade.status!=="open") throw new DomainError("This trade is no longer open.","TRADE_CLOSED");
      sideFor(trade,userId);
      const updated=await client.query("UPDATE player_trades SET status='cancelled',updated_at=NOW() WHERE guild_id=$1 AND id=$2 RETURNING *",[guildId,id]);
      return normalizeTrade(updated.rows[0]);
    });
  }
}
function tradeCard(trade,viewerId) {
  if (!trade) return null;
  const side=sideFor(trade,viewerId);
  const format=(offer)=>[Number(offer.fc).toLocaleString()+" FC",...offer.items.map((entry)=>{
    const item=balancing.items.find((x)=>x.id===entry.itemId)||balancing.halloween.shop.find((x)=>x.id===entry.itemId);
    return (item?item.name:entry.itemId)+" ×"+entry.quantity;
  })].filter((x)=>x!=="0 FC").join(" + ")||"Nothing offered yet";
  return {title:"TRADE "+String(trade.id).slice(0,8),
    description:"With <@"+(side==="initiator"?trade.target_id:trade.initiator_id)+">. Both players must contribute something. Editing an offer clears both confirmations.",
    fields:[
      {name:"Your offer",value:format(trade.offers[side])},
      {name:"Their offer",value:format(trade.offers[side==="initiator"?"target":"initiator"])},
      {name:"Your confirmation",value:trade.confirmations[side]?"Confirmed":"Waiting",inline:true},
      {name:"Their confirmation",value:trade.confirmations[side==="initiator"?"target":"initiator"]?"Confirmed":"Waiting",inline:true}
    ]};
}
module.exports={TradeService,tradeCard,validateOffer,hasOffer,normalizeTrade,validateTradeMember,snowflakeCreatedAt,TRADE_TTL_MS,MAX_ITEM_TYPES,MIN_ACCOUNT_AGE_MS,MIN_SERVER_TENURE_MS,MAX_DAILY_TRADE_OPENS,PAIR_COOLDOWN_MS};
