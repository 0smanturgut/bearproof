#!/usr/bin/env node
/**
 * Writes the Claude Code settings the Build Agent runs under (passed with --settings), for this checkout:
 *
 *   node agent/sandbox-settings.mjs > "$RUNNER_TEMP/agent-settings.json"
 *
 * Every Bash command the agent runs, and everything it starts, goes through Claude Code's sandbox: no network at
 * all (an empty allowlist, strictly enforced), writes only inside the checkout and /tmp but never into the
 * pipeline's own files or node_modules, and none of the run's secrets in the environment. Claude Code itself still
 * reaches the API; only the agent's commands are boxed. If the sandbox can't start, the run fails instead of
 * running unboxed. Absolute paths, so nothing depends on where the settings file sits.
 */
const ws = process.env.GITHUB_WORKSPACE || process.cwd();
const secrets = [
    'ANTHROPIC_API_KEY',
    'INGEST_TOKEN',
    'GITHUB_TOKEN',
    'GH_TOKEN',
    'ACTIONS_RUNTIME_TOKEN'
];

const settings = {
    sandbox: {
        enabled: true,
        failIfUnavailable: true,
        allowUnsandboxedCommands: false,
        // Keep the --allowedTools list in charge of which commands may run at all.
        autoAllowBashIfSandboxed: false,
        network: { allowedDomains: [], strictAllowlist: true },
        filesystem: {
            allowWrite: ['/tmp'],
            denyWrite: [
                `${ws}/node_modules`,
                `${ws}/scripts`,
                `${ws}/.github`,
                `${ws}/game/scripts`,
                // the agent writes its plan, notes and proposals with the Write tool, never from a shell
                `${ws}/agent`,
                `${ws}/package.json`,
                `${ws}/package-lock.json`
            ]
        },
        credentials: { envVars: secrets.map((name) => ({ name, mode: 'deny' })) }
    }
};
process.stdout.write(JSON.stringify(settings, null, 2) + '\n');
