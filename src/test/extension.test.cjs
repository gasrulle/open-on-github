const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { buildSync } = require("esbuild");

const bundle = buildSync({
    entryPoints: [path.join(__dirname, "../extension.ts")],
    bundle: true,
    format: "cjs",
    platform: "node",
    external: ["vscode"],
    write: false,
}).outputFiles[0].text;

const pages = [
    ["openOnGithub.openCode", ""],
    ["openOnGithub.openIssues", "/issues"],
    ["openOnGithub.openPullRequests", "/pulls"],
    ["openOnGithub.openActions", "/actions"],
];

const event = () => ({ dispose() {} });

function repository(name, { selected = false, url = `https://github.com/owner/${name}.git`, HEAD, refs = [] } = {}) {
    return {
        rootUri: {
            fsPath: `/workspace/${name}`,
            toString: () => `file:///workspace/${name}`,
        },
        ui: { selected },
        state: {
            remotes: [{ name: "origin", fetchUrl: url }],
            HEAD,
            refs,
            onDidChange: event,
        },
    };
}

async function activate(repositories, { pick = 0, gitAvailable = true } = {}) {
    const commands = new Map();
    const opened = [];
    const warnings = [];
    const pickers = [];
    const contexts = [];
    const git = {
        repositories,
        onDidOpenRepository: event,
        onDidCloseRepository: event,
    };
    const vscode = {
        extensions: {
            getExtension: () => gitAvailable ? { isActive: true, exports: { getAPI: () => git } } : undefined,
        },
        commands: {
            executeCommand: async (...args) => { contexts.push(args); },
            registerCommand: (id, handler) => {
                commands.set(id, handler);
                return { dispose() {} };
            },
        },
        window: {
            showWarningMessage: async message => { warnings.push(message); },
            showQuickPick: async (items, options) => {
                pickers.push({ items, options });
                return items[pick];
            },
        },
        env: {
            openExternal: async uri => {
                opened.push(uri.toString());
                return true;
            },
        },
        Uri: { parse: value => ({ toString: () => value }) },
    };
    const module = { exports: {} };
    vm.runInNewContext(bundle, {
        module,
        exports: module.exports,
        require: name => {
            assert.equal(name, "vscode");
            return vscode;
        },
        setTimeout,
        clearTimeout,
    });
    await module.exports.activate({ subscriptions: [] });
    return { commands, opened, warnings, pickers, contexts };
}

for (const [command, suffix] of pages) {
    test(`${command} uses the selected second repository without SCM arguments`, async () => {
        const app = await activate([repository("first"), repository("second", { selected: true })]);
        await app.commands.get(command)();
        assert.deepEqual(app.opened, [`https://github.com/owner/second${suffix}`]);
        assert.equal(app.pickers.length, 0);
        assert.equal(app.warnings.length, 0);
    });

    test(`${command} honors explicit repository context over selection`, async () => {
        const first = repository("first", { selected: true });
        const second = repository("second");
        const app = await activate([first, second]);
        await app.commands.get(command)({ rootUri: { toString: second.rootUri.toString } });
        assert.deepEqual(app.opened, [`https://github.com/owner/second${suffix}`]);
        assert.equal(app.pickers.length, 0);
    });

    test(`${command} opens the repository chosen from the picker`, async () => {
        const app = await activate([repository("first"), repository("second")], { pick: 1 });
        await app.commands.get(command)();
        assert.deepEqual(app.opened, [`https://github.com/owner/second${suffix}`]);
        assert.equal(app.pickers.length, 1);
        assert.equal(app.pickers[0].items[1].label, "https://github.com/owner/second");
        assert.equal(app.pickers[0].items[1].description, "/workspace/second");
    });

    test(`${command} does nothing when the repository picker is canceled`, async () => {
        const canceled = await activate([repository("first"), repository("second")], { pick: -1 });
        await canceled.commands.get(command)();
        assert.equal(canceled.pickers.length, 1);
        assert.equal(canceled.opened.length, 0);
        assert.equal(canceled.warnings.length, 0);
    });
}

test("commands follow changes to the SCM selection", async () => {
    const first = repository("first");
    const second = repository("second", { selected: true });
    const app = await activate([first, second]);
    await app.commands.get("openOnGithub.openCode")();
    first.ui.selected = true;
    second.ui.selected = false;
    await app.commands.get("openOnGithub.openCode")();
    assert.deepEqual(app.opened, ["https://github.com/owner/second", "https://github.com/owner/first"]);
});

for (const explicit of [true, false]) {
    test(`a non-GitHub ${explicit ? "explicit" : "selected"} repository never redirects`, async () => {
        const other = repository("other", { selected: !explicit, url: "https://example.com/owner/other.git" });
        const app = await activate([repository("first"), other]);
        await app.commands.get("openOnGithub.openCode")(explicit ? { rootUri: other.rootUri } : undefined);
        assert.equal(app.opened.length, 0);
        assert.equal(app.pickers.length, 0);
        assert.equal(app.warnings.length, 1);
    });
}

test("an unknown explicit repository never redirects", async () => {
    const app = await activate([repository("first")]);
    await app.commands.get("openOnGithub.openCode")({ rootUri: repository("closed").rootUri });
    assert.equal(app.opened.length, 0);
    assert.equal(app.warnings.length, 1);
});

test("multiple selected repositories only offer selected GitHub repositories", async () => {
    const app = await activate([
        repository("unselected"),
        repository("first", { selected: true }),
        repository("second", { selected: true }),
    ], { pick: 1 });
    await app.commands.get("openOnGithub.openCode")();
    assert.deepEqual(app.opened, ["https://github.com/owner/second"]);
    assert.equal(app.pickers[0].items.length, 2);
});

test("a single eligible repository opens without a picker", async () => {
    const app = await activate([
        repository("other", { url: "https://example.com/owner/other.git" }),
        repository("only"),
    ]);
    await app.commands.get("openOnGithub.openCode")();
    assert.deepEqual(app.opened, ["https://github.com/owner/only"]);
    assert.equal(app.pickers.length, 0);
});

test("an empty workspace warns instead of opening a URL", async () => {
    const app = await activate([]);
    await app.commands.get("openOnGithub.openCode")();
    assert.equal(app.opened.length, 0);
    assert.equal(app.warnings.length, 1);
});

test("an unavailable Git extension warns instead of opening a URL", async () => {
    const app = await activate([], { gitAvailable: false });
    await app.commands.get("openOnGithub.openCode")();
    assert.equal(app.opened.length, 0);
    assert.equal(app.warnings.length, 1);
});

test("a GitHub remote other than origin does not enable the menu", async () => {
    const repo = repository("other", { url: "https://example.com/owner/other.git" });
    repo.state.remotes.push({ name: "upstream", fetchUrl: "https://github.com/owner/other.git" });
    const app = await activate([repo]);
    assert.equal(app.contexts[0][2], false);
});

for (const url of [
    "https://github.com/owner/second.git",
    "https://user@github.com/owner/second.git",
    "git@github.com:owner/second.git",
    "ssh://git@github.com/owner/second.git",
    "ssh://git@github.com:22/owner/second.git",
]) {
    test(`selected repository normalizes ${url}`, async () => {
        const app = await activate([repository("first"), repository("second", { selected: true, url })]);
        await app.commands.get("openOnGithub.openCode")();
        assert.deepEqual(app.opened, ["https://github.com/owner/second"]);
    });
}

for (const { HEAD, refs, suffix } of [
    { HEAD: { name: "feature/topic", upstream: { remote: "origin", name: "feature/topic" } }, suffix: "/tree/feature%2Ftopic" },
    { HEAD: { name: "feature/topic" }, refs: [{ type: 1, remote: "origin", name: "origin/feature/topic" }], suffix: "/tree/feature%2Ftopic" },
    { HEAD: { name: "local-only" }, suffix: "" },
    { HEAD: { commit: "abc123" }, suffix: "" },
]) {
    test(`Code preserves branch handling for ${HEAD.name ?? "detached HEAD"}`, async () => {
        const app = await activate([
            repository("first"),
            repository("second", { selected: true, HEAD, refs }),
        ]);
        await app.commands.get("openOnGithub.openCode")();
        assert.deepEqual(app.opened, [`https://github.com/owner/second${suffix}`]);
    });
}
