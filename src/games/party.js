const { randomInt } = require("../utils/core");

const TRIVIA_QUESTIONS = [
  { category: "Science", question: "Which planet is known as the Red Planet?", answer: "Mars", options: ["Venus", "Mars", "Mercury", "Neptune"] },
  { category: "Geography", question: "What is the capital of Japan?", answer: "Tokyo", options: ["Seoul", "Beijing", "Tokyo", "Bangkok"] },
  { category: "Math", question: "What is 9 × 8?", answer: "72", options: ["64", "68", "72", "81"] },
  { category: "Science", question: "What is the chemical symbol for oxygen?", answer: "O", options: ["Ox", "O", "Og", "Oy"] },
  { category: "Geography", question: "Which is the largest ocean on Earth?", answer: "Pacific Ocean", options: ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean", "Pacific Ocean"] },
  { category: "Tech", question: "What does CPU stand for?", answer: "Central Processing Unit", options: ["Computer Power Utility", "Central Processing Unit", "Core Program Upload", "Central Performance User"] },
  { category: "Math", question: "What is 12 squared?", answer: "144", options: ["124", "132", "144", "164"] },
  { category: "Science", question: "At what temperature does water freeze in Celsius?", answer: "0°C", options: ["0°C", "10°C", "32°C", "-10°C"] },
  { category: "General", question: "How many sides does a hexagon have?", answer: "6", options: ["5", "6", "7", "8"] },
  { category: "Tech", question: "How many bits are in one byte?", answer: "8", options: ["4", "8", "16", "32"] },
  { category: "Geography", question: "What is the world's tallest mountain above sea level?", answer: "Mount Everest", options: ["K2", "Kilimanjaro", "Mount Everest", "Mont Blanc"] },
  { category: "Science", question: "Which gas do plants absorb from the atmosphere?", answer: "Carbon dioxide", options: ["Oxygen", "Hydrogen", "Carbon dioxide", "Nitrogen"] },
  { category: "General", question: "How many minutes are in two hours?", answer: "120", options: ["90", "100", "120", "140"] },
  { category: "Geography", question: "Which country is shaped like a boot?", answer: "Italy", options: ["Greece", "Italy", "Portugal", "Chile"] },
  { category: "Tech", question: "What does HTML stand for?", answer: "HyperText Markup Language", options: ["High Transfer Machine Link", "HyperText Markup Language", "Home Tool Markup Language", "Hyperlink Text Management Logic"] },
  { category: "Science", question: "Which is the largest planet in our solar system?", answer: "Jupiter", options: ["Saturn", "Earth", "Jupiter", "Uranus"] },
  { category: "General", question: "Which animal is famous for carrying its home on its back?", answer: "Turtle", options: ["Turtle", "Fox", "Horse", "Eagle"] },
  { category: "Math", question: "What is 15% of 200?", answer: "30", options: ["15", "20", "25", "30"] },
  { category: "Geography", question: "Which continent is the Sahara Desert in?", answer: "Africa", options: ["Asia", "Africa", "Australia", "South America"] },
  { category: "General", question: "What is the first month of the year?", answer: "January", options: ["March", "January", "December", "June"] },
  { category: "Science", question: "What is the centre of an atom called?", answer: "Nucleus", options: ["Electron", "Shell", "Nucleus", "Neutron"] },
  { category: "Math", question: "What is 144 ÷ 12?", answer: "12", options: ["10", "11", "12", "14"] },
  { category: "General", question: "Which instrument has keys, pedals and strings?", answer: "Piano", options: ["Guitar", "Piano", "Violin", "Flute"] },
  { category: "Geography", question: "Which country is home to the city of Istanbul?", answer: "Türkiye", options: ["Greece", "Türkiye", "Egypt", "Romania"] },
  { category: "Science", question: "What force keeps us on the ground?", answer: "Gravity", options: ["Friction", "Magnetism", "Gravity", "Electricity"] }
];

const WOULD_YOU_RATHER = [
  ["Have a personal chef", "Have a personal driver"],
  ["Be able to teleport anywhere", "Be able to pause time for 10 seconds"],
  ["Always know when someone is lying", "Always get away with telling harmless lies"],
  ["Have unlimited free snacks", "Have unlimited free internet"],
  ["Fight one horse-sized duck", "Fight one hundred duck-sized horses"],
  ["Never have to sleep", "Never have to do homework or paperwork"],
  ["Have a rewind button for your day", "Have a fast-forward button for boring moments"],
  ["Be famous for something silly", "Be unknown but secretly legendary"],
  ["Only communicate with memes", "Only communicate with song lyrics"],
  ["Have a tiny dragon as a pet", "Have a very dramatic talking cat"],
  ["Always arrive 20 minutes early", "Always arrive exactly on time"],
  ["Win every game but nobody believes you", "Lose every game but everyone thinks you're a genius"]
];

const ROASTS = [
  "{name} has so many unfinished plans, even their to-do list needs a therapist.",
  "{name} brings 'loading...' energy to every conversation.",
  "{name} could lose a staring contest with a loading screen.",
  "{name} is the human version of a low battery warning.",
  "{name} has the confidence of a final boss and the strategy of a confused tutorial NPC.",
  "{name} doesn't miss the point. The point files a missing-person report.",
  "{name} could make a group project feel like a solo mission.",
  "{name} has premium opinions running on free-trial logic.",
  "{name} is proof that the mute button deserves employee of the month.",
  "{name} would ask a mirror for directions.",
  "{name} has the timing of a Discord notification during an exam.",
  "{name} is not offline, just buffering in real life.",
  "{name} could turn a one-minute task into a trilogy.",
  "{name} has more excuses than a broken alarm clock.",
  "{name} walks into a room and the Wi-Fi gets nervous.",
  "{name} is the plot twist nobody requested, but the server got anyway.",
  "{name} could overthink a yes-or-no question until it becomes a documentary.",
  "{name} has main-character confidence with background-NPC navigation.",
  "{name} would bring a spoon to a Wi-Fi fight.",
  "{name} is so unpredictable, even their autocorrect has trust issues.",
  "{name} has the attention span of a notification preview.",
  "{name} could make a calculator double-check its work.",
  "{name} has been on a side quest for so long, the main story moved on.",
  "{name} is the reason the tutorial has a skip button."
];

const FORTUNES = [
  { title: "Main Character Energy", vibe: "Today, the universe has accidentally put you in charge.", mission: "Do one thing confidently, even if you have no idea what you're doing.", warning: "Do not say 'watch this' near expensive objects." },
  { title: "Professional NPC", vibe: "You will repeat the same sentence at least three times today.", mission: "Help someone with a tiny task and collect your imaginary side-quest XP.", warning: "Beware of people asking you to press E to interact." },
  { title: "Certified Lucky", vibe: "A small win is heading your way. It may be a good snack.", mission: "Take the easy opportunity instead of overthinking it.", warning: "Do not challenge the universe to a 50/50." },
  { title: "CEO of Procrastination", vibe: "Your future self is already disappointed, but still believes in you.", mission: "Finish one thing you have been avoiding for no good reason.", warning: "The words 'I'll do it in five minutes' are cursed." },
  { title: "Chaos Magnet", vibe: "Somehow, a normal day may become a story.", mission: "Stay calm when the group chat starts typing at once.", warning: "Do not investigate suspicious noises without snacks." },
  { title: "Secret Final Boss", vibe: "You look harmless, but your patience bar is dangerously low.", mission: "Win one small battle by simply not arguing.", warning: "Avoid dramatic background music." },
  { title: "Golden Retriever Mode", vibe: "Your energy is friendly, chaotic and slightly confused.", mission: "Make someone laugh without starting a debate.", warning: "You may accidentally agree to three plans." },
  { title: "Wi-Fi Prophet", vibe: "You will sense a connection problem before anyone else.", mission: "Save your work before doing anything risky.", warning: "Never trust a router with blinking red lights." },
  { title: "Legendary Side Quest", vibe: "An unexpected task may turn out to be surprisingly useful.", mission: "Say yes to one reasonable new experience.", warning: "Check the quest description before accepting." },
  { title: "Sleep-Deprived Genius", vibe: "Your best idea may arrive at the least convenient time.", mission: "Write the idea down before it disappears.", warning: "Do not make life decisions at 3 AM." },
  { title: "Quiet Menace", vibe: "You are observing everything and explaining nothing.", mission: "Let your actions speak once today.", warning: "People may mistake your silence for a secret plan." },
  { title: "Legend in Progress", vibe: "Nothing huge is guaranteed, but progress is absolutely possible.", mission: "Make one useful move toward a goal you care about.", warning: "Ignore anyone selling you instant success." }
];

function pick(items, rng = Math.random) {
  return items[Math.min(items.length - 1, Math.max(0, Math.floor(rng() * items.length)))];
}

function shuffle(items, rng = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function makeTriviaQuestion(rng = Math.random) {
  const item = pick(TRIVIA_QUESTIONS, rng);
  const options = shuffle(item.options, rng);
  return {
    category: item.category,
    question: item.question,
    options,
    answer: item.answer,
    correctIndex: options.indexOf(item.answer)
  };
}

function makeWouldYouRather(rng = Math.random) {
  const [first, second] = pick(WOULD_YOU_RATHER, rng);
  return { first, second };
}

function makeRoast(displayName, rng = Math.random) {
  const safeName = String(displayName || "This member")
    .replace(/[\`*_~|]/g, "")
    .replace(/@/g, "@\u200b")
    .slice(0, 48);
  return pick(ROASTS, rng).replaceAll("{name}", safeName);
}

function makeFortune(rng = Math.random) {
  return { ...pick(FORTUNES, rng) };
}

function resolveRps(first, second) {
  const choices = new Set(["rock", "paper", "scissors"]);
  if (!choices.has(first) || !choices.has(second)) throw new TypeError("RPS choices must be rock, paper or scissors.");
  if (first === second) return "tie";
  if (
    (first === "rock" && second === "scissors") ||
    (first === "paper" && second === "rock") ||
    (first === "scissors" && second === "paper")
  ) return "first";
  return "second";
}

module.exports = {
  TRIVIA_QUESTIONS,
  WOULD_YOU_RATHER,
  ROASTS,
  FORTUNES,
  makeTriviaQuestion,
  makeWouldYouRather,
  makeRoast,
  makeFortune,
  resolveRps
};
