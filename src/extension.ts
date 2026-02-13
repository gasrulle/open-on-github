import * as vscode from "vscode";

function isGitHubUrl(url: string): boolean {
    return /^(https:\/\/([^@/]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com(:\d+)?\/)/.test(url);
}

function hasGitHubRemote(repo: Repository): boolean {
    return repo.state.remotes.some(r => {
        const url = r.fetchUrl ?? r.pushUrl;
        return url !== undefined && isGitHubUrl(url);
    });
}

async function getGitApi(): Promise<GitAPI | undefined> {
    const gitExtension = vscode.extensions.getExtension<GitExtension>("vscode.git");
    if (!gitExtension) {
        return undefined;
    }
    if (!gitExtension.isActive) {
        await gitExtension.activate();
    }
    return gitExtension.exports.getAPI(1);
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
        .replace(/^https:\/\/[^@/]+@github\.com\//, "https://github.com/")
        .replace(/^git@github\.com:/, "https://github.com/")
        .replace(/^ssh:\/\/git@github\.com(:\d+)?\//, "https://github.com/");
}

async function getGitHubUrl(sourceControl?: vscode.SourceControl): Promise<string | undefined> {
    const git = await getGitApi();
    if (!git) {
        return undefined;
    }

    // If invoked from a specific repo's SCM menu, match by rootUri
    if (sourceControl?.rootUri) {
        const repo = git.repositories.find(r => r.rootUri.fsPath === sourceControl.rootUri!.fsPath);
        if (repo) {
            return getGitHubOriginUrl(repo);
        }
    }

    // Fallback: find the first repo with a GitHub origin remote
    for (const repo of git.repositories) {
        const url = getGitHubOriginUrl(repo);
        if (url) {
            return url;
        }
    }

    return undefined;
}

async function openGitHubPage(path: string, sourceControl?: vscode.SourceControl): Promise<void> {
    const baseUrl = await getGitHubUrl(sourceControl);
    if (!baseUrl) {
        vscode.window.showWarningMessage("Could not determine GitHub remote URL.");
        return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(`${baseUrl}${path}`));
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

interface RepositoryState {
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
            git.onDidOpenRepository(() => updateIsGitHubContext()),
            git.onDidCloseRepository(() => updateIsGitHubContext())
        );

        // Also re-evaluate when existing repos change state (e.g. remotes added/removed)
        for (const repo of git.repositories) {
            context.subscriptions.push(
                repo.state.onDidChange(() => updateIsGitHubContext())
            );
        }

        // Attach the listener to any repo opened in the future
        context.subscriptions.push(
            git.onDidOpenRepository(repo => {
                context.subscriptions.push(
                    repo.state.onDidChange(() => updateIsGitHubContext())
                );
            })
        );
    }

    context.subscriptions.push(
        vscode.commands.registerCommand("openOnGithub.openCode", (sourceControl?: vscode.SourceControl) => {
            openGitHubPage("", sourceControl);
        }),
        vscode.commands.registerCommand("openOnGithub.openPullRequests", (sourceControl?: vscode.SourceControl) => {
            openGitHubPage("/pulls", sourceControl);
        }),
        vscode.commands.registerCommand("openOnGithub.openActions", (sourceControl?: vscode.SourceControl) => {
            openGitHubPage("/actions", sourceControl);
        })
    );
}

export function deactivate() { }
