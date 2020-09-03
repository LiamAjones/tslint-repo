"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

const core = require("@actions/core");
const github = require("@actions/github");
const common_tags_1 = require("common-tags");
const fs = require("fs");
const glob = require("glob");
const tslint = require("tslint");

const SeverityAnnotationLevelMap = new Map([
    ["warning", "warning"],
    ["error", "failure"],
]);
(async () => {
    const ctx = github.context;

    const tslintConfigFile = core.getInput("tslintConfigFile");
    const pattern = core.getInput("pattern");
    const github_token = core.getInput("token");

    if (!pattern) {
        core.setFailed("tslint-actions: Please set project or pattern input");
        return;
    }
    if (!github_token) {
        core.setFailed("tslint-actions: Please set token");
        return;
    }

    const octokit = new github.getOctokit(github_token);

    const check = await octokit.checks.create({
        owner: ctx.repo.owner,
        repo: ctx.repo.repo,
        name: "TSLint Action",
        head_sha: ctx.sha,
        status: "in_progress",
    });

    const result = (() => {

        const linter = new tslint.Linter({
            fix: false,
            formatter: "json",
        });

        for (const file of glob.sync(pattern)) {
            const fileContents = fs.readFileSync(file, { encoding: "utf8" });
            const configuration = tslint.Configuration.findConfiguration(tslintConfigFile, file).results;
            linter.lint(file, fileContents, configuration);
        }

        return linter.getResult();
    })();

    const annotations = result.failures.map(failure => ({
        path: failure.getFileName(),
        start_line: failure.getStartPosition().getLineAndCharacter().line,
        end_line: failure.getEndPosition().getLineAndCharacter().line,
        annotation_level: SeverityAnnotationLevelMap.get(failure.getRuleSeverity()) || "notice",
        message: `[${failure.getRuleName()}] ${failure.getFailure()}`,
    }));

    const conclusion = result.errorCount > 0 ? "failure" : "success";

    await octokit.checks.update({
        owner: ctx.repo.owner,
        repo: ctx.repo.repo,
        check_run_id: check.data.id,
        name: "TSLint Action",
        status: "completed",
        conclusion: conclusion,
        output: {
            title: "TSLint Action",
            summary: `${result.errorCount} error(s), ${result.warningCount} warning(s) found`,
            text: common_tags_1.stripIndent`
                ## Results
                \`\`\`json
                ${JSON.stringify(tslint.Configuration.readConfigurationFile(tslintConfigFile), null, 2)}
                \`\`\`
                </details>`,
            annotations,
        },
    });
})().catch((e) => {
    core.setFailed(e.message);
});