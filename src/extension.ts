import * as vscode from "vscode";

const GITHUB_URL_RE = /^(https:\/\/([^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com(:\d+)?\/)/;

let cachedGitApi: GitAPI | undefined;
const repoDisposables = new Map<string, vscode.Disposable>();
let updateContextTimer: ReturnType<typeof setTimeout> | undefined;

function isGitHubUrl(url: string): boolean {
    return GITHUB_URL_RE.test(url);
}

function hasGitHubRemote(repo: Repository): boolean {
    return repo.state.remotes.some(r => {
        const url = r.fetchUrl ?? r.pushUrl;
        return url !== undefined && isGitHubUrl(url);
    });
}

async function getGitApi(): Promise<GitAPI | undefined> {
    if (cachedGitApi) {
        return cachedGitApi;
    }
    const gitExtension = vscode.extensions.getExtension<GitExtension>("vscode.git");
    if (!gitExtension) {
        return undefined;
    }
    if (!gitExtension.isActive) {
        await gitExtension.activate();
    }
    cachedGitApi = gitExtension.exports.getAPI(1);
    return cachedGitApi;
}

function scheduleUpdateContext(): void {
    if (updateContextTimer) {
        clearTimeout(updateContextTimer);
    }
    updateContextTimer = setTimeout(() => {
        updateContextTimer = undefined;
        void updateIsGitHubContext();
    }, 150);
}

async function updateIsGitHubContext(): Promise<void> {
    const git = await getGitApi();
    const isGitHub = git !== undefined && git.repositories.some(hasGitHubRemote);
    await vscode.commands.executeCommand("setContext", "openOnGithub.isGitHub", isGitHub);
}

function getGitHubOriginUrl(repo: Repository): string | undefined {
    const remote = repo.state.remotes.find(r => r.name === "origin");
    const url = remote?.fetchUrl ?? remote?.pushUrl;
    if (!url || !isGitHubUrl(url)) {
        return undefined;
    }

    // Convert SSH (git@github.com:user/repo.git) or HTTPS (https://github.com/user/repo.git) to base URL
    return url
        .replace(/\.git$/, "")
        .replace(/\/+$/, "")
        .replace(/^https:\/\/[^@/]+@github\.com\//, "https://github.com/")
        .replace(/^git@github\.com:/, "https://github.com/")
        .replace(/^ssh:\/\/git@github\.com(:\d+)?\//, "https://github.com/");
}

async function findGitHubRepo(sourceControl?: vscode.SourceControl): Promise<Repository | undefined> {
    const git = await getGitApi();
    if (!git) {
        return undefined;
    }

    // If invoked from a specific repo's SCM menu, match by rootUri
    if (sourceControl?.rootUri) {
        const targetPath = sourceControl.rootUri!.toString();
        const repo = git.repositories.find(r => r.rootUri.toString() === targetPath);
        if (repo && getGitHubOriginUrl(repo)) {
            return repo;
        }
    }

    // Fallback: find the first repo with a GitHub origin remote
    for (const repo of git.repositories) {
        if (getGitHubOriginUrl(repo)) {
            return repo;
        }
    }

    return undefined;
}

async function openGitHubPage(path: string, sourceControl?: vscode.SourceControl): Promise<void> {
    const repo = await findGitHubRepo(sourceControl);
    if (!repo) {
        vscode.window.showWarningMessage("Could not determine GitHub remote URL.");
        return;
    }
    const baseUrl = getGitHubOriginUrl(repo)!;
    await vscode.env.openExternal(vscode.Uri.parse(`${baseUrl}${path}`));
}

function branchExistsOnOrigin(repo: Repository, branch: string): boolean {
    // A tracking upstream on origin means the branch exists remotely.
    if (repo.state.HEAD?.upstream?.remote === "origin" && repo.state.HEAD.upstream.name === branch) {
        return true;
    }
    // Otherwise look for a remote-tracking ref refs/remotes/origin/<branch>.
    return repo.state.refs.some(
        ref => ref.type === RefType.RemoteHead && ref.remote === "origin" && ref.name === `origin/${branch}`
    );
}

function getBranchPath(repo: Repository): string {
    const branch = repo.state.HEAD?.name;
    // Only link to a branch that exists on origin; otherwise GitHub returns a 404.
    // Falling back to an empty path opens the repo root, which redirects to the default branch.
    return branch && branchExistsOnOrigin(repo, branch) ? `/tree/${encodeURIComponent(branch)}` : "";
}

interface GitExtension {
    getAPI(version: 1): GitAPI;
}

interface GitAPI {
    repositories: Repository[];
    onDidOpenRepository: vscode.Event<Repository>;
    onDidCloseRepository: vscode.Event<Repository>;
}

interface Repository {
    readonly rootUri: vscode.Uri;
    state: RepositoryState;
}

interface Branch {
    name?: string;
    commit?: string;
    upstream?: UpstreamRef;
}

interface UpstreamRef {
    remote: string;
    name: string;
}

const enum RefType {
    Head = 0,
    RemoteHead = 1,
    Tag = 2,
}

interface Ref {
    type: RefType;
    name?: string;
    commit?: string;
    remote?: string;
}

interface RepositoryState {
    HEAD?: Branch;
    refs: Ref[];
    remotes: Remote[];
    onDidChange: vscode.Event<void>;
}

interface Remote {
    name: string;
    fetchUrl?: string;
    pushUrl?: string;
}

export async function activate(context: vscode.ExtensionContext) {
    // Set initial context based on whether any repo has a GitHub remote
    await updateIsGitHubContext();

    // Watch for repository changes to update the context dynamically
    const git = await getGitApi();
    if (git) {
        context.subscriptions.push(
            git.onDidOpenRepository(repo => {
                const key = repo.rootUri.toString();
                const disposable = repo.state.onDidChange(() => scheduleUpdateContext());
                repoDisposables.set(key, disposable);
                context.subscriptions.push(disposable);
                scheduleUpdateContext();
            }),
            git.onDidCloseRepository(repo => {
                const key = repo.rootUri.toString();
                repoDisposables.get(key)?.dispose();
                repoDisposables.delete(key);
                scheduleUpdateContext();
            })
        );

        // Also re-evaluate when existing repos change state (e.g. remotes added/removed)
        for (const repo of git.repositories) {
            const key = repo.rootUri.toString();
            const disposable = repo.state.onDidChange(() => scheduleUpdateContext());
            repoDisposables.set(key, disposable);
            context.subscriptions.push(disposable);
        }
    }

    context.subscriptions.push(
        vscode.commands.registerCommand("openOnGithub.openCode", async (sourceControl?: vscode.SourceControl) => {
            const repo = await findGitHubRepo(sourceControl);
            if (!repo) {
                vscode.window.showWarningMessage("Could not determine GitHub remote URL.");
                return;
            }
            const baseUrl = getGitHubOriginUrl(repo)!;
            const branchPath = getBranchPath(repo);
            await vscode.env.openExternal(vscode.Uri.parse(`${baseUrl}${branchPath}`));
        }),
        vscode.commands.registerCommand("openOnGithub.openIssues", (sourceControl?: vscode.SourceControl) => {
            return openGitHubPage("/issues", sourceControl);
        }),
        vscode.commands.registerCommand("openOnGithub.openPullRequests", (sourceControl?: vscode.SourceControl) => {
            return openGitHubPage("/pulls", sourceControl);
        }),
        vscode.commands.registerCommand("openOnGithub.openActions", (sourceControl?: vscode.SourceControl) => {
            return openGitHubPage("/actions", sourceControl);
        })
    );
}

export function deactivate() { }
