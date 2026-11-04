const ivm = require("isolated-vm");

function readInput() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    process.stdin.on("data", (chunk) => {
      size += chunk.length;
      if (size > 128 * 1024) {
        reject(new Error("Command source or input is too large."));
        process.stdin.destroy();
        return;
      }
      chunks.push(chunk);
    });
    process.stdin.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch (_) { reject(new Error("Invalid command runner input.")); }
    });
    process.stdin.on("error", reject);
  });
}

function write(value) {
  process.stdout.write(JSON.stringify(value));
}

async function main() {
  const request = await readInput();
  if (!request || typeof request.source !== "string" || request.source.length > 50000) {
    throw new Error("Command source must be a string under 50,000 characters.");
  }

  const isolate = new ivm.Isolate({ memoryLimit: 48 });
  try {
    const context = isolate.createContextSync();
    context.global.setSync("__input", request.input || {}, { copy: true });

    const prefix = "const module = { exports: {} }; const exports = module.exports;\\n";

    if (request.mode === "inspect") {
      const script = isolate.compileScriptSync(prefix + request.source + "\\n; JSON.stringify(module.exports.data)");
      const dataJson = script.runSync(context, { timeout: 500, copy: true });
      const inspectScript = isolate.compileScriptSync("typeof module.exports.execute === 'function' ? 'ok' : 'missing'");
      const hasExecute = inspectScript.runSync(context, { timeout: 100, copy: true });
      if (typeof dataJson !== "string" || hasExecute !== "ok") {
        throw new Error("Export { data: { name, description, options }, execute() } from your command file.");
      }
      write({ ok: true, data: JSON.parse(dataJson) });
      return;
    }

    if (request.mode !== "run") throw new Error("Unknown command runner operation.");
    const initScript = isolate.compileScriptSync(prefix + request.source + "\\n; true");
    initScript.runSync(context, { timeout: 500, copy: true });
    const inspectScript = isolate.compileScriptSync("typeof module.exports.execute === 'function' ? 'ok' : 'missing'");
    if (inspectScript.runSync(context, { timeout: 100, copy: true }) !== "ok") {
      throw new Error("Your command file must export an execute function.");
    }
    let settled = false;
    let resolveResult;
    const resultPromise = new Promise((resolve) => { resolveResult = resolve; });
    const finish = new ivm.Callback((json) => {
      if (settled) return;
      settled = true;
      resolveResult(String(json));
    }, { sync: true });
    context.global.setSync("__finish", finish);

    const runScript = isolate.compileScriptSync(
      "if (typeof module.exports.execute !== 'function') throw new Error('Missing execute function');\n" +
      "(async () => { try { const result = await module.exports.execute(__input); " +
      "const serialized = JSON.stringify({ ok: true, result: result === undefined ? null : result }); " +
      "__finish(serialized || '{\"ok\":false,\"error\":\"Unserializable command result\"}'); " +
      "} catch (error) { __finish(JSON.stringify({ ok: false, error: String(error && error.message || error).slice(0, 700) })); } })();\n" +
      "'started';"
    );
    await runScript.run(context, { timeout: 1200 });
    const serialized = await Promise.race([
      resultPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Command execution timed out after 2 seconds.")), 2000))
    ]);
    const result = JSON.parse(serialized);
    if (!result.ok) throw new Error(result.error || "Command execution failed.");
    write({ ok: true, result: result.result });
  } finally {
    isolate.dispose();
  }
}

main().catch((error) => {
  write({ ok: false, error: String(error && error.message || error).slice(0, 1000) });
  process.exitCode = 1;
});
