const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const workspace = require("../src/services/admin-workspace");

test("admin workspace writes, reads, updates, lists and deletes JavaScript command files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fukishokai-workspace-"));
  try {
    const guildId = "123456789012345678";
    const original = "module.exports = { data: { name: 'hello', description: 'Hello' }, async execute() { return { content: 'first' }; } };";
    const updated = "module.exports = { data: { name: 'hello', description: 'Hello' }, async execute() { return { content: 'updated live' }; } };";

    const filePath = await workspace.writeCommandFile(guildId, "hello", original, root);
    assert.equal(filePath, workspace.getCommandFilePath(guildId, "hello", root));
    assert.equal(path.basename(filePath), "hello.js");
    assert.equal(await workspace.readCommandFile(guildId, "hello", root), original);

    const files = await workspace.listCommandFiles(guildId, root);
    assert.deepEqual(files.map((file) => file.name), ["hello"]);
    assert.match(files[0].path, /admin-workspace|fukishokai-workspace/);

    await workspace.writeCommandFile(guildId, "hello", updated, root);
    assert.equal(await workspace.readCommandFile(guildId, "hello", root), updated);

    await workspace.deleteCommandFile(guildId, "hello", root);
    assert.equal(await workspace.readCommandFile(guildId, "hello", root), null);
    assert.deepEqual(await workspace.listCommandFiles(guildId, root), []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("admin workspace rejects path traversal and non-JavaScript command names", () => {
  assert.throws(() => workspace.getCommandFilePath("123456789012345678", "../escape"), /Command file names/);
  assert.throws(() => workspace.getCommandFilePath("../other", "hello"), /server ID/);
});
