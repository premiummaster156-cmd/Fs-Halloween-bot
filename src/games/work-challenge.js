const { randomInt } = require("../utils/core");

const QUESTION_POOL_SIZE = 115;
const RECENT_QUESTION_LIMIT = 500;
const LETTERS = ["A", "B", "C", "D"];
const WORK_SHIFT_TIME_LIMITS = Object.freeze({ easy: 3 * 60 * 1000, medium: 6 * 60 * 1000, hard: 10 * 60 * 1000 });

function getWorkShiftTimeLimit(band) {
  return WORK_SHIFT_TIME_LIMITS[band] || WORK_SHIFT_TIME_LIMITS.easy;
}

const recentQuestions = {
  easy: [],
  medium: [],
  hard: []
};

function pick(items) {
  return items[randomInt(0, items.length - 1)];
}

function int(min, max) {
  return randomInt(min, max);
}

function question(text, answer) {
  return { question: text, answer: Math.round(answer) };
}

function generateEasyQuestion() {
  const type = int(0, 16);

  switch (type) {
    case 0: {
      const a = int(8, 75);
      const b = int(6, 68);
      return question(pick([
        `What is ${a} + ${b}?`,
        `A worker earns ${a} FC in the morning and ${b} FC in the evening. How much did they earn in total?`,
        `There are ${a} items in one box and ${b} in another. How many items are there altogether?`
      ]), a + b);
    }
    case 1: {
      const a = int(45, 150);
      const b = int(5, a - 5);
      return question(pick([
        `What is ${a} − ${b}?`,
        `A shop had ${a} items and sold ${b}. How many are left?`,
        `You have ${a} FC and spend ${b} FC. How much remains?`
      ]), a - b);
    }
    case 2: {
      const a = int(2, 12);
      const b = int(2, 12);
      return question(pick([
        `What is ${a} × ${b}?`,
        `There are ${a} bags with ${b} items in each bag. How many items are there?`,
        `A worker completes ${a} tasks each day for ${b} days. How many tasks are completed?`
      ]), a * b);
    }
    case 3: {
      const divisor = int(2, 12);
      const quotient = int(3, 18);
      const total = divisor * quotient;
      return question(pick([
        `What is ${total} ÷ ${divisor}?`,
        `${total} packages are shared equally between ${divisor} workers. How many packages does each worker receive?`,
        `A shipment of ${total} items is split equally into ${divisor} boxes. How many go in each box?`
      ]), quotient);
    }
    case 4: {
      const price = int(4, 35);
      const quantity = int(2, 9);
      return question(pick([
        `One item costs ${price} FC. How much do ${quantity} items cost?`,
        `A member buys ${quantity} items for ${price} FC each. What is the total cost?`,
        `You complete ${quantity} deliveries and earn ${price} FC per delivery. How much do you earn?`
      ]), price * quantity);
    }
    case 5: {
      const start = int(30, 65);
      const a = int(15, 35);
      const b = int(3, 18);
      return question(`You start with ${start} supplies, receive ${a} more, then use ${b}. How many supplies remain?`, start + a - b);
    }
    case 6: {
      const first = int(2, 35);
      const gap = int(2, 12);
      const second = first + gap;
      const third = second + gap;
      const fourth = third + gap;
      return question(`Find the next number: ${first}, ${second}, ${third}, ${fourth}, ?`, fourth + gap);
    }
    case 7: {
      const a = int(8, 45);
      const b = int(6, 35);
      const c = int(4, 30);
      return question(`A team completes ${a} tasks on Monday, ${b} on Tuesday, and ${c} on Wednesday. How many tasks did it complete altogether?`, a + b + c);
    }
    case 8: {
      const paid = int(5, 30) * 10;
      const cost = int(2, Math.floor(paid / 10) - 1) * 10;
      return question(`An item costs ${cost} FC and you pay with ${paid} FC. How much change should you receive?`, paid - cost);
    }
    case 9: {
      const a = int(3, 15);
      const b = int(3, 12);
      const extra = int(2, 20);
      return question(`There are ${a} teams with ${b} members each, plus ${extra} helpers. How many people are there in total?`, a * b + extra);
    }
    case 10: {
      const a = int(10, 60);
      const b = int(2, 9);
      return question(`A worker earns ${a} FC per task and completes ${b} tasks. What is the total pay?`, a * b);
    }
    case 12: { const pay = int(2, 10) * 100; const bonus = pick([5, 10, 15, 20]); return question(`A shift pays ${pay} FC plus a ${bonus}% bonus. What is the total pay?`, pay + pay * bonus / 100); }
    case 13: { const minutes = int(2, 8) * 15; const tasks = int(2, 9); return question(`A worker completes ${tasks} tasks every ${minutes} minutes. How many tasks are completed in ${minutes * 4} minutes?`, tasks * 4); }
    case 14: { const total = int(4, 15) * 6; const part = pick([1, 2, 3, 4, 5]); return question(`A shipment has ${total} items. ${part}/6 are delivered first. How many items remain?`, total - total * part / 6); }
    case 15: { const hours = int(2, 12); const rate = int(3, 12); return question(`A shift lasts ${hours} hours with ${rate} tasks completed each hour. How many tasks are completed?`, hours * rate); }
    case 16: { const first = int(2, 8); const multiplier = int(2, 4); return question(`Find the next number in this pattern: ${first}, ${first * multiplier}, ${first * multiplier ** 2}, ?`, first * multiplier ** 3); }
    default: {
      const a = int(12, 80);
      const b = int(2, 9);
      const c = int(2, 18);
      return question(`A warehouse has ${a} items. It receives ${b} boxes containing ${c} items each. How many items does it have now?`, a + b * c);
    }
  }
}

function generateMediumQuestion() {
  const type = int(0, 16);

  switch (type) {
    case 0: {
      const a = int(5, 18);
      const b = int(4, 16);
      const extra = int(12, 90);
      return question(`A team completes ${a} jobs per day for ${b} days, then completes ${extra} extra jobs. How many jobs are completed?`, a * b + extra);
    }
    case 1: {
      const base = int(3, 15) * 20;
      const percent = pick([10, 20, 25, 30, 40, 50]);
      return question(`What is ${percent}% of ${base}?`, base * percent / 100);
    }
    case 2: {
      const original = int(10, 60) * 20;
      const discount = pick([10, 20, 25, 30, 40]);
      const saved = original * discount / 100;
      return question(`A ${original} FC item is discounted by ${discount}%. What is its new price?`, original - saved);
    }
    case 3: {
      const base = int(12, 45);
      const firstOffset = int(-8, 8);
      const secondOffset = int(-8, 8);
      const values = [base + firstOffset, base - firstOffset, base + secondOffset, base - secondOffset];
      return question(`Find the average of ${values.join(", ")}.`, Math.round(values.reduce((sum, value) => sum + value, 0) / values.length));
    }
    case 4: {
      const denominator = pick([2, 3, 4, 5, 6, 8, 10]);
      const numerator = int(1, denominator - 1);
      const total = int(5, 30) * denominator;
      return question(`What is ${numerator}/${denominator} of ${total}?`, total * numerator / denominator);
    }
    case 5: {
      const length = int(6, 25);
      const width = int(4, 18);
      return question(`A rectangular room is ${length} m long and ${width} m wide. What is its area?`, length * width);
    }
    case 6: {
      const rate = int(3, 8);
      const hours = int(12, 35);
      const total = rate * hours;
      return question(`A team completes ${rate} deliveries per hour. How many hours will it need to complete ${total} deliveries?`, hours);
    }
    case 7: {
      const first = int(5, 35);
      const gap = int(3, 12);
      const second = first + gap;
      const third = second + gap;
      const fourth = third + gap;
      const fifth = fourth + gap;
      return question(`A sequence increases by the same amount each time. What comes next: ${first}, ${second}, ${third}, ${fourth}, ${fifth}, ?`, fifth + gap);
    }
    case 8: {
      const a = int(2, 8);
      const b = int(2, 8);
      const total = int(8, 30) * (a + b);
      return question(`${total} FC is shared between two workers in the ratio ${a}:${b}. How much does the first worker receive?`, total * a / (a + b));
    }
    case 9: {
      const price = int(15, 80);
      const quantity = int(3, 12);
      const fee = int(5, 30);
      return question(`${quantity} items cost ${price} FC each, and delivery costs ${fee} FC. What is the total bill?`, quantity * price + fee);
    }
    case 10: {
      const start = int(3, 20) * 100;
      const increase = pick([10, 15, 20, 25, 30, 40]);
      return question(`A balance of ${start} FC increases by ${increase}%. What is the new balance?`, start + start * increase / 100);
    }
    case 12: { const base = int(10, 40) * 100; const bonus = pick([10, 20, 25]); const fee = pick([10, 20]); return question(`A project pays ${base} FC, adds a ${bonus}% bonus, then deducts a ${fee}% fee from the bonus. What is the final payout?`, base + base * bonus / 100 - (base * bonus / 100) * fee / 100); }
    case 13: { const rateA = int(4, 12); const timeA = int(3, 8); const rateB = int(3, 10); const timeB = int(2, 7); return question(`Team A completes ${rateA} tasks per hour for ${timeA} hours. Team B completes ${rateB} tasks per hour for ${timeB} hours. How many tasks are completed together?`, rateA * timeA + rateB * timeB); }
    case 14: { const workers = int(3, 8); const days = int(4, 12); const daily = int(8, 20); const lost = int(5, 25); return question(`${workers} workers each finish ${daily} tasks per day for ${days} days. ${lost} tasks are rejected. How many valid tasks remain?`, workers * daily * days - lost); }
    case 15: { const denominator = pick([3, 4, 5, 6, 8]); const numerator = int(1, denominator - 1); const total = int(8, 30) * denominator; return question(`A team completes ${numerator}/${denominator} of ${total} tasks in the morning. How many tasks remain?`, total - total * numerator / denominator); }
    case 16: { const original = int(10, 40) * 100; const increase = pick([10, 20, 25, 30]); const final = original * (100 + increase) / 100; return question(`A contract value rises by ${increase}% to ${final} FC. What was its original value?`, original); }
    default: {
      const a = int(8, 25);
      const b = int(4, 18);
      const c = int(3, 15);
      return question(`A warehouse packs ${a} boxes with ${b} items each, then ships ${c} items. How many items remain?`, a * b - c);
    }
  }
}

function generateHardQuestion() {
  const type = int(0, 16);

  switch (type) {
    case 0: {
      const a = int(8, 28);
      const b = int(6, 22);
      const c = int(5, 18);
      const d = int(4, 15);
      return question(`A crew completes ${a} × ${b} tasks in one operation and ${c} × ${d} in another. How many tasks did it complete in total?`, a * b + c * d);
    }
    case 1: {
      const first = int(2, 8);
      const second = int(2, 8);
      const third = int(2, 8);
      const total = int(20, 80) * (first + second + third);
      return question(`${total} FC is divided among three workers in the ratio ${first}:${second}:${third}. How much does the second worker receive?`, total * second / (first + second + third));
    }
    case 2: {
      const original = int(20, 100) * 50;
      const firstDiscount = pick([10, 20, 25, 30]);
      const secondDiscount = pick([10, 15, 20, 25]);
      const afterFirst = original * (100 - firstDiscount) / 100;
      const finalPrice = afterFirst * (100 - secondDiscount) / 100;
      return question(`An item costs ${original} FC. It is discounted by ${firstDiscount}%, then by another ${secondDiscount}%. What is the final price?`, Math.round(finalPrice));
    }
    case 3: {
      const workers = int(4, 12);
      const days = int(5, 18);
      const perWorker = int(6, 20);
      const extra = int(20, 120);
      return question(`${workers} workers each complete ${perWorker} tasks per day for ${days} days. They then complete ${extra} more tasks. What is the total?`, workers * perWorker * days + extra);
    }
    case 4: {
      const base = int(20, 80) * 100;
      const increase = pick([10, 15, 20, 25]);
      const decrease = pick([10, 20, 25, 30]);
      const afterIncrease = base * (100 + increase) / 100;
      const finalValue = afterIncrease * (100 - decrease) / 100;
      return question(`A balance of ${base} FC rises by ${increase}% and then falls by ${decrease}%. What is the final balance?`, Math.round(finalValue));
    }
    case 5: {
      const a = int(6, 18);
      const gap1 = int(3, 9);
      const gapStep = int(2, 6);
      const gap2 = gap1 + gapStep;
      const gap3 = gap2 + gapStep;
      const n1 = a;
      const n2 = n1 + gap1;
      const n3 = n2 + gap2;
      const n4 = n3 + gap3;
      const nextGap = gap3 + gapStep;
      return question(`The gaps in this sequence increase by a constant amount. What comes next: ${n1}, ${n2}, ${n3}, ${n4}, ?`, n4 + nextGap);
    }
    case 6: {
      const numerator = pick([2, 3, 4, 5]);
      const denominator = numerator + pick([3, 4, 5, 6]);
      const whole = int(8, 30) * denominator;
      const firstPart = whole * numerator / denominator;
      const secondPart = whole * (denominator - numerator) / denominator;
      return question(`A shipment contains ${whole} items. ${numerator}/${denominator} is delivered in the morning. How many items remain for the afternoon?`, secondPart);
    }
    case 7: {
      const length = int(12, 35);
      const width = int(8, 24);
      const perimeter = 2 * (length + width);
      return question(`A rectangular yard is ${length} m long and ${width} m wide. How many metres of fencing are needed to go all the way around it?`, perimeter);
    }
    case 8: {
      const price = int(9, 38) * 20;
      const quantity = int(4, 15);
      const tax = pick([5, 10, 15, 20]);
      const subtotal = price * quantity;
      return question(`${quantity} items cost ${price} FC each. A ${tax}% fee is added to the bill. What is the final total?`, subtotal + subtotal * tax / 100);
    }
    case 9: {
      const rateA = int(8, 24);
      const hoursA = int(3, 8);
      const rateB = int(6, 20);
      const hoursB = int(2, 7);
      return question(`Worker A completes ${rateA} tasks per hour for ${hoursA} hours. Worker B completes ${rateB} tasks per hour for ${hoursB} hours. How many tasks do they complete together?`, rateA * hoursA + rateB * hoursB);
    }
    case 10: {
      const total = int(10, 35) * 100;
      const firstPercent = pick([20, 25, 30, 40]);
      const secondPercent = pick([10, 15, 20, 25]);
      const firstAmount = total * firstPercent / 100;
      const secondAmount = total * secondPercent / 100;
      return question(`A project has a budget of ${total} FC. ${firstPercent}% is spent on supplies and ${secondPercent}% on transport. How much remains?`, total - firstAmount - secondAmount);
    }
    case 12: { const budget = int(20, 80) * 1000; const supplies = pick([15, 20, 25, 30]); const transport = pick([10, 15, 20]); return question(`A project budget is ${budget} FC. ${supplies}% is spent on supplies and ${transport}% on transport. How much remains?`, budget * (100 - supplies - transport) / 100); }
    case 13: { const a = int(8, 24); const b = int(5, 18); const hoursA = int(4, 9); const hoursB = int(3, 8); const bonus = int(40, 180); return question(`Team A completes ${a} tasks per hour for ${hoursA} hours; Team B completes ${b} per hour for ${hoursB} hours. Add ${bonus} emergency tasks. What is the total?`, a * hoursA + b * hoursB + bonus); }
    case 14: { const original = int(20, 90) * 100; const first = pick([10, 15, 20, 25]); const second = pick([10, 20, 25]); return question(`An item costs ${original} FC. It receives a ${first}% discount and then a further ${second}% discount. What is the final price?`, Math.round(original * (100 - first) * (100 - second) / 10000)); }
    case 15: { const total = int(20, 70) * 12; const shipped = pick([2, 3, 4, 5, 6, 7]); return question(`A warehouse has ${total} units. ${shipped}/12 are shipped, then 15 more are damaged. How many usable units remain?`, total - total * shipped / 12 - 15); }
    case 16: { const workers = int(5, 14); const perWorker = int(3, 8) * 20; const shifts = int(4, 10); const efficiency = pick([5, 10, 15, 20]); return question(`${workers} workers complete ${perWorker} tasks each per shift for ${shifts} shifts, then improve output by ${efficiency}%. What is the new total?`, workers * perWorker * shifts * (100 + efficiency) / 100); }
    default: {
      const first = int(8, 25);
      const second = int(5, 18);
      const multiplier = int(3, 9);
      const fixed = int(25, 150);
      return question(`A shipment has ${first} crates with ${second} items each. Another delivery brings ${multiplier} times that number, plus ${fixed} extra items. How many items are delivered altogether?`, first * second * (multiplier + 1) + fixed);
    }
  }
}

const generators = {
  easy: generateEasyQuestion,
  medium: generateMediumQuestion,
  hard: generateHardQuestion
};

function getQuestionBand(job, jobLevel) {
  const averagePay = (Number(job.payMin) + Number(job.payMax)) / 2;
  const payBand = Math.max(0, Math.floor(Math.log2(Math.max(1, averagePay / 150))));
  const levelBand = Math.floor(Math.max(0, Number(jobLevel) - 1) / 10);
  const score = Number(job.tier) + payBand + levelBand;
  if (score <= 3) return "easy";
  if (score <= 6) return "medium";
  return "hard";
}

function makeOptions(answer, band) {
  const baseSpread = band === "easy" ? 12 : band === "medium" ? 35 : 100;
  const spread = Math.max(baseSpread, Math.ceil(Math.abs(answer) * 0.12));
  const values = new Set([answer]);

  while (values.size < 4) {
    const distance = int(1, spread);
    const choice = answer + (int(0, 1) ? distance : -distance);
    if (choice >= 0 && choice !== answer) values.add(choice);
  }

  const shuffled = Array.from(values);
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = int(0, index);
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
  }

  return shuffled.map((value, index) => ({
    letter: LETTERS[index],
    value,
    correct: value === answer
  }));
}

function rememberQuestions(band, questions) {
  const history = recentQuestions[band];
  for (const item of questions) {
    history.push(item.question);
  }
  if (history.length > RECENT_QUESTION_LIMIT) {
    history.splice(0, history.length - RECENT_QUESTION_LIMIT);
  }
}

function makeWorkChallenge(job, jobLevel, count = 3) {
  const band = getQuestionBand(job, jobLevel);
  const targetCount = Math.max(1, Math.min(10, Number.isInteger(count) ? count : 3));
  const generate = generators[band];
  const recent = new Set(recentQuestions[band]);
  const pool = [];
  const used = new Set();

  // Build a fresh pool of 115 randomized questions for every work shift.
  // Also avoid recently shown questions so members do not keep seeing repeats.
  let attempts = 0;
  const maxAttempts = QUESTION_POOL_SIZE * 200;

  while (pool.length < QUESTION_POOL_SIZE && attempts < maxAttempts) {
    attempts += 1;
    const candidate = generate();
    if (!Number.isSafeInteger(candidate.answer) || candidate.answer < 0) continue;
    if (used.has(candidate.question) || recent.has(candidate.question)) continue;
    used.add(candidate.question);
    pool.push(candidate);
  }

  // Extremely unlikely fallback: expand the number range to guarantee a full pool.
  while (pool.length < QUESTION_POOL_SIZE) {
    const left = int(1000, 999999);
    const right = int(1000, 999999);
    const candidate = question(`Calculate ${left} + ${right}.`, left + right);
    if (used.has(candidate.question) || recent.has(candidate.question)) continue;
    used.add(candidate.question);
    pool.push(candidate);
  }

  const questions = [];
  for (let index = 0; index < targetCount; index += 1) {
    const selectedIndex = int(0, pool.length - 1);
    const selected = pool.splice(selectedIndex, 1)[0];
    const options = makeOptions(selected.answer, band);
    questions.push({
      question: selected.question,
      options,
      answer: options.find((option) => option.correct).letter
    });
  }

  rememberQuestions(band, questions);

  return {
    band,
    questions,
    questionCount: QUESTION_POOL_SIZE
  };
}

// Kept as a compatibility export: the live question pool is generated per shift.
const questionBank = Object.freeze(Array.from({ length: QUESTION_POOL_SIZE }, (_, index) => index + 1));

module.exports = {
  makeWorkChallenge,
  getQuestionBand,
  getWorkShiftTimeLimit,
  WORK_SHIFT_TIME_LIMITS,
  questionBank,
  QUESTION_POOL_SIZE
};
