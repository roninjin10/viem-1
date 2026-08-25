/// <reference path="./smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets"
import { Package as contracts } from "./contracts/PACKAGE.js"
import { Package as environments } from "./environments/PACKAGE.js"
import { Package as examples } from "./examples/PACKAGE.js"
import { Package as site } from "./site/PACKAGE.js"
import { Package as src } from "./src/PACKAGE.js"
import { Package as test } from "./test/PACKAGE.js"
import { Package as vectors } from "./vectors/PACKAGE.js"

// PACKAGE.ts files are discovered automatically: the CLI globs the tree and
// indexes each file's Package export under path-derived labels
// (//src:build, //test:typeBench, //:verify) before the workspace runs.
// Only targets passed to S.Package are public; consts that stay out of the
// map are private to this file.
const packageJson = S.file("//package.json")
const srcManifest = S.file("//src/package.json")
const lockfile = S.file("//pnpm-lock.yaml")
const biomeConfig = S.file("//biome.json")
const rootTsconfig = S.file("//tsconfig.json")
const changesetConfig = S.file("//.changeset/config.json")

const lint = S.Shell.Test({
  bin: S.NodeModule.Bin("@biomejs/biome"),
  args: ["check"],
  data: [src.srcs, site.srcs, test.infra, biomeConfig],
})

const format = S.Shell.Diff({
  bin: S.NodeModule.Bin("@biomejs/biome"),
  args: ["check", "--write", "--unsafe"],
  data: [src.srcs, site.srcs, biomeConfig],
  changes: ["**"],
})

// sherif lints the monorepo itself: mismatched dependency ranges across
// workspace packages, unordered manifests.
const checkRepo = S.Shell.Test({
  bin: S.NodeModule.Bin("sherif"),
  data: [packageJson, srcManifest, lockfile],
})

// tsc -b walks the project references in the root tsconfig.
const typeCheck = S.Shell.Test({
  bin: S.NodeModule.Bin("typescript", "tsc"),
  args: ["-b"],
  data: [src.srcs, src.tests, site.srcs, contracts.generated, rootTsconfig],
})

const knip = S.Shell.Test({
  bin: S.NodeModule.Bin("knip"),
  args: ["--production"],
  data: [src.srcs, site.srcs, packageJson],
})

const audit = S.Shell.Test({
  bin: S.PackageManager.bin,
  args: ["audit"],
  data: [packageJson, lockfile],
  sandbox: { network: true },
})

// publint and attw lint the published shape of the package: exports map
// integrity and esm/cjs/types agreement.
const publint = S.Shell.Test({
  bin: S.NodeModule.Bin("publint"),
  args: ["--strict", "./src"],
  data: [src.build, srcManifest],
})

const attw = S.Shell.Test({
  bin: S.NodeModule.Bin("@arethetypeswrong/cli", "attw"),
  args: ["--pack", "./src", "--ignore-rules", "false-esm"],
  data: [src.build, srcManifest],
})

// The 18 per-entrypoint budgets live in the root manifest's size-limit
// field. Budgets fans out one check per entry and reports each entry's
// delta against the base branch, so a PR sees which export path grew, not
// one opaque number.
const size = S.Size.Budgets({
  manifest: packageJson,
  data: [src.buildEsm, src.buildCjs],
})

// Dev linking: symlinks the dist dirs so workspace consumers resolve viem
// without a rebuild.
const preconstruct = S.Shell.Run({
  bin: S.NodeModule.Bin("bun"),
  args: ["scripts/preconstruct.ts"],
  data: [srcManifest],
})

const clean = S.Shell.Run({
  command: "rm -rf *.tsbuildinfo src/*.tsbuildinfo src/_esm src/_cjs src/_types",
})

// Agentic lint: a diff that changes published source must carry a
// changeset whose semver level matches the change. The bot check upstream
// only tests presence; judging patch vs minor vs major is judgment work.
const changesetLint = S.Agent.Lint({
  agent: S.Agent.Codex("luna"),
  prompt: S.file("//workflows/lints/changeset.md"),
  data: [S.gitDiff({ paths: ["src/**", ".changeset/**"] })],
  fixes: [".changeset/**"],
})

// Agentic lint: a new exported action needs a docs page and a twoslash
// snippet; the site is part of the public surface.
const docsParityLint = S.Agent.Lint({
  agent: S.Agent.Codex("luna"),
  prompt: S.file("//workflows/lints/docs-parity.md"),
  data: [S.gitDiff({ added: ["src/actions/**", "src/accounts/**", "src/utils/**"] })],
  fixes: ["site/pages/**"],
})

const agentLints = S.Suite({
  tests: [changesetLint, docsParityLint],
})

// verify.yml's fast job: runs on every push, draft PRs included.
const check = S.Suite({
  tests: [audit, checkRepo, lint],
})

// verify.yml's full matrix as one suite. CI shape (shards, service
// containers, runtime matrix) lives on the individual targets.
const verify = S.Suite({
  tests: [
    check,
    typeCheck,
    knip,
    publint,
    attw,
    size,
    test.typecheckTests,
    test.typeBench,
    test.test,
    test.testNoMulticall,
    test.testTempo,
    test.testTempoNext,
    test.testTempoMultisig,
    test.testTempoFuzz,
    test.testTempoFuzzNode,
    vectors.test,
    environments.envs,
    examples.check,
    site.twoslash,
  ],
})

// The downstream check the disabled wagmi CI job wants to be: build wagmi
// against this working tree (override its viem dependency), then run its
// type checks and type benches. Run weekly and on release candidates
// instead of every PR.
const wagmiCompat = S.Npm.Downstream({
  repository: "https://github.com/wevm/wagmi",
  overrides: { viem: src.build },
  run: ["check:types", "bench:types", "build"],
  sandbox: { network: true },
})

const wagmiNightly = S.Cron({
  schedule: "0 6 * * 1",
  run: [wagmiCompat],
})

// The changesets release train. version consumes pending changesets into
// version bumps and changelogs (a Diff over the tree, opened as the
// Version Packages PR upstream); publish rebuilds, packs, and publishes
// with provenance. Publishing is outward, so it carries approval on top
// of its gates.
const changesetVersion = S.Changesets.Version({
  config: changesetConfig,
  data: [srcManifest, src.version],
  changes: ["//src/package.json", "//src/CHANGELOG.md", "//.changeset/**", "//src/errors/version.ts"],
})

const pack = S.Npm.Pack({
  manifest: srcManifest,
  data: [src.build, src.srcs],
})

const release = S.Changesets.Publish({
  config: changesetConfig,
  pack,
  gates: [verify],
  provenance: true,
  secrets: [S.Secret("NPM_TOKEN")],
  sandbox: { network: true },
  approval: "required",
})

// pull-request.yml publishes a prerelease build of every PR; dist-tag
// keeps it off latest.
const prerelease = S.Npm.Publish({
  pack,
  distTag: "prerelease",
  gates: [check],
  secrets: [S.Secret("NPM_TOKEN")],
  sandbox: { network: true },
  approval: "required",
})

// The workflow files are emitted from the graph, not hand-written: each
// entry maps a trigger to a target and the generator writes the actions
// boilerplate (pnpm setup, submodules, foundry toolchain, shard fan-out)
// from the workspace layers and target attributes. Check mode fails on
// drift; --write regenerates.
const githubCi = S.Github.Ci({
  workflows: {
    "pull-request": { on: { pullRequest: true }, run: verify },
    changesets: { on: { push: ["main"], dispatch: true }, run: [verify, release] },
    verify: { on: { dispatch: true }, run: verify },
  },
  changes: [".github/workflows/**"],
})

// simple-git-hooks runs `pnpm check` before commit; here the hook is the
// gate on the commit target itself.
const preCommit = S.Suite({
  tests: [lint, checkRepo],
})

const prePush = S.Suite({
  tests: [check, typeCheck, agentLints],
})

const commit = S.Git.Commit({
  gates: [preCommit],
  message: S.Agent.Codex("luna"),
})

const pr = S.Git.Pr({
  gates: [prePush],
  secrets: [S.Secret("GITHUB_TOKEN")],
  sandbox: { network: true },
})

export const Package = S.Package({
  defaultVisibility: "public",
  targets: {
    agentLints,
    attw,
    audit,
    changesetLint,
    changesetVersion,
    check,
    checkRepo,
    clean,
    commit,
    docsParityLint,
    format,
    githubCi,
    knip,
    lint,
    pack,
    pr,
    preCommit,
    preconstruct,
    prePush,
    prerelease,
    publint,
    release,
    size,
    typeCheck,
    verify,
    wagmiCompat,
    wagmiNightly,
  },
})
