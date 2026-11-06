const test = require("node:test");
const assert = require("node:assert/strict");
const balancing = require("../src/config/game-balancing");
const { makeWorkChallenge, getQuestionBand, QUESTION_POOL_SIZE } = require("../src/games/work-challenge");

test("career tiers unlock progressively harder work challenge bands", () => {
  const byId = Object.fromEntries(balancing.jobs.map((job) => [job.id, job]));
  assert.equal(getQuestionBand(byId.street_runner, 1), "easy");
  assert.equal(getQuestionBand(byId.shopkeeper, 1), "medium");
  assert.equal(getQuestionBand(byId.crime_boss, 1), "hard");
  assert.equal(getQuestionBand(byId.street_runner, 31), "medium");
});

test("each work shift draws three valid questions from a fresh 100-question pool", () => {
  const job = balancing.jobs.find((item) => item.id === "shopkeeper");
  const shift = makeWorkChallenge(job, 4, 3);
  assert.equal(QUESTION_POOL_SIZE, 100);
  assert.equal(shift.questionCount, 100);
  assert.equal(shift.questions.length, 3);
  for (const item of shift.questions) {
    assert.equal(item.options.length, 4);
    assert.equal(new Set(item.options.map((option) => option.value)).size, 4);
    assert.equal(item.options.filter((option) => option.correct).length, 1);
    assert.equal(item.options.find((option) => option.correct).letter, item.answer);
  }
});

test("recently presented work questions are avoided on the next shift", () => {
  const job = balancing.jobs.find((item) => item.id === "crime_boss");
  const first = makeWorkChallenge(job, 12, 3);
  const second = makeWorkChallenge(job, 12, 3);
  const seen = new Set(first.questions.map((item) => item.question));
  assert.ok(second.questions.every((item) => !seen.has(item.question)));
});


test("hard work shifts receive more time than easier shifts", () => {
  const { getWorkShiftTimeLimit } = require("../src/games/work-challenge");
  assert.equal(getWorkShiftTimeLimit("easy"), 3 * 60 * 1000);
  assert.equal(getWorkShiftTimeLimit("medium"), 6 * 60 * 1000);
  assert.equal(getWorkShiftTimeLimit("hard"), 10 * 60 * 1000);
  assert.equal(getWorkShiftTimeLimit("unknown"), 3 * 60 * 1000);
});
