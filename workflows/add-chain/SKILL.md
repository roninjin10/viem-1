# Add a chain definition

Input: chain id, chain name, RPC URLs, and optionally a block explorer URL
and native currency details.

Adding a chain is the most common contributor PR. Produce one that matches
the house style exactly.

1. Verify the chain id against the provided RPC with eth_chainId.
2. Create src/chains/definitions/<camelCaseName>.ts using defineChain,
   following the structure of an existing definition (mainnet.ts for a
   layer 1, optimism.ts for an OP-stack chain; extend with the correct
   formatters and serializers when the chain is an OP-stack or zksync
   fork).
3. Export it from src/chains/index.ts, keeping the list alphabetized.
4. Add a patch changeset describing the addition.
5. Run the chains test for the new definition.

Do not touch unrelated chain definitions. Decline inputs whose RPC does
not answer eth_chainId with the claimed id.
