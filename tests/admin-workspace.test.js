const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const workspace = require("../src/services/admin-workspace");

test("admin workspace creates, reads, lists and deletes JavaScript command files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fukishokai-workspace-"));
  try {
    const guildId = "123456789012345678";
    const source = "module.exports = { data: { name: 'hello', description: 'Hello' }, async execute() { return { content: 'hi' }; } };";
    const target = workspace.getCommandFilePath(guildId, "hello", root);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, source, "utf8");
    assert.equal(await fs.readFile(target, "utf8"), source);
    const files = await fs.readdir(path.dirname(target));
    assert.deepEqual(files, ["hello.js"]);
    await fs.rm(target);
    await fs.rm(root, { recursive: true, force: true });
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("admin workspace rejects path traversal and non-JavaScript command names", () => {
  assert.throws(() => workspace.getCommandFilePath("123456789012345678", "../escape"), /Command file names/);
  assert.throws(() => workspace.getCommandFilePath("../other", "hello"), /server ID/);
});
