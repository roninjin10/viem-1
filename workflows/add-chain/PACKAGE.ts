/// <reference path="../../smithers.d.ts" />
import { Smithers as S } from "@smthrs/targets"
import { Package as root } from "../../PACKAGE.js"
import { Package as src } from "../../src/PACKAGE.js"
import { Package as test } from "../../test/PACKAGE.js"

// The most common contributor PR, as a workflow: payload turns the chain
// parameters into typed input, the agent verifies the chain id against
// the live RPC, and the gates run the chain validation test plus the type
// check before the PR opens. Opening a PR is outward, so approval is
// declared.
const addChain = S.Agent.Pr({
  agent: S.Agent.Codex("luna"),
  prompt: S.file("SKILL.md"),
  payload: {
    chainId: S.Input.String("Chain id, e.g. 8453"),
    name: S.Input.String("Chain name, e.g. Base"),
    rpcUrls: S.Input.String("Comma-separated RPC URLs"),
    explorerUrl: S.Input.Optional(S.Input.String("Block explorer URL")),
  },
  data: [src.srcs],
  changes: ["src/chains/**", ".changeset/**"],
  gates: [test.testChains, root.typeCheck, root.changesetLint],
  secrets: [S.Secret("GITHUB_TOKEN")],
  sandbox: { network: true },
  approval: "required",
  maxRounds: 3,
})

export const Package = S.Package({
  targets: { addChain },
})
